import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { selectPairing, PairingInput, PairingCandidate } from './pairingService';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'picklestack.db');

function cleanupDb() {
  closeDb();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
  if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
}

function insertSession(id: string) {
  return repo.createSession({
    id,
    name: 'Test Session',
    court_count: 4,
    status: 'active',
    pairing_mode: 'smart',
    court_name: '',
    session_type: 'open_play',
    game_mode: 'doubles',
    matching_mode: 'smart',
    live_view_url: `/live/${id}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

function insertPlayer(sessionId: string, name: string): string {
  const id = uuidv4();
  repo.createPlayer({
    id,
    session_id: sessionId,
    name,
    checked_in_at: new Date().toISOString(),
  });
  return id;
}

/**
 * Property 7: Diversity bonus as correct tiebreaker priority
 * Validates: Requirements 3.1, 3.3
 *
 * For any two candidate groupings with equal skill gap scores:
 * 1. The pairing algorithm SHALL select the grouping with the higher diversity bonus
 * 2. The teammate frequency sum tiebreaker SHALL only apply when diversity bonuses are also equal
 */
describe('pairingService diversity bonus tiebreaker property tests', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('Property 7a: Higher diversity bonus wins over lower when skill gaps are equal', () => {
    fc.assert(
      fc.property(
        // Generate how many opponent pairs to mark as "seen" for the low-diversity group
        // At least 1 pair must be seen so that the two groups have different diversity bonuses
        fc.integer({ min: 1, max: 6 }),
        // Generate queue position offsets to vary groupings
        fc.integer({ min: 0, max: 3 }),
        (seenPairCount, queueOffset) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create 8 players all with the same rating (1000) so skill gap is 0 for all groupings
          // BUT we need ratings != 1000 to avoid the random selection code path
          const rating = 1500;
          const playerIds: string[] = [];
          for (let i = 0; i < 8; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Group A: players [0,1,2,3] - HIGH diversity (no opponent history = all fresh)
          // Group B: players [4,5,6,7] - LOW diversity (some pairs have opponent history)

          // Add opponent history for group B players so their diversity bonus is lower
          // seenPairCount pairs in group B will have previous opponent encounters
          const groupBPairs: [number, number][] = [
            [4, 5], [4, 6], [4, 7], [5, 6], [5, 7], [6, 7],
          ];

          const pairsToMark = groupBPairs.slice(0, seenPairCount);
          for (const [i, j] of pairsToMark) {
            const [p1, p2] = playerIds[i] < playerIds[j]
              ? [playerIds[i], playerIds[j]]
              : [playerIds[j], playerIds[i]];
            repo.upsertPairingHistory({
              session_id: sessionId,
              player1_id: p1,
              player2_id: p2,
              times_as_teammates: 0,
              times_as_opponents: 1,
            });
          }

          // Build candidate pool: all 8 players with same rating (non-default to avoid random path)
          const candidatePool: PairingCandidate[] = playerIds.map((id, idx) => ({
            playerId: id,
            rating,
            queuePosition: idx + 1 + queueOffset,
            isPair: false,
            pairId: null,
            pairedPlayerIds: null,
          }));

          const input: PairingInput = {
            candidatePool,
            teammateHistory: new Map(),
            opponentHistory: new Map(),
            matchConfigHistory: new Set(),
            sessionId,
            pairingMode: 'smart',
          };

          const result = selectPairing(input);
          const resultPlayerIds = [...result.team1, ...result.team2].sort();

          // Group A (players 0-3) has diversity bonus = 6/6 = 1.0 (all fresh)
          // Group B (players 4-7) has diversity bonus = (6 - seenPairCount)/6 < 1.0
          // Since skill gaps are all 0, the algorithm should prefer group A
          const groupAIds = playerIds.slice(0, 4).sort();

          // The selected grouping should be group A (all fresh pairings = highest diversity bonus)
          expect(resultPlayerIds).toEqual(groupAIds);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7b: Equal diversity bonus falls through to teammate frequency sum', () => {
    fc.assert(
      fc.property(
        // Generate teammate frequency for the "high frequency" group (1–5)
        fc.integer({ min: 1, max: 5 }),
        // Generate a small offset for queue positions
        fc.integer({ min: 0, max: 2 }),
        (highFrequency, queueOffset) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create exactly 8 players with same non-default rating
          const rating = 1500;
          const playerIds: string[] = [];
          for (let i = 0; i < 8; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Both groups have EQUAL diversity bonus (all fresh, no opponent history)
          // Group A: players [0,1,2,3] - LOW teammate frequency sum (0)
          // Group B: players [4,5,6,7] - HIGH teammate frequency sum

          // Add teammate history for group B players so their teammate frequency is higher
          // We add teammate history for the pairs that will be on the same team
          // Since all 3 splits of group B are possible, we mark ALL pairs in group B with
          // teammate history so any split of group B has higher frequency sum

          // For group B: mark pairs (4,5), (4,6), (4,7), (5,6), (5,7), (6,7) as teammates
          const groupBPairs: [number, number][] = [
            [4, 5], [4, 6], [4, 7], [5, 6], [5, 7], [6, 7],
          ];

          const teammateHistory = new Map<string, Map<string, number>>();

          for (const [i, j] of groupBPairs) {
            const pi = playerIds[i];
            const pj = playerIds[j];

            if (!teammateHistory.has(pi)) teammateHistory.set(pi, new Map());
            if (!teammateHistory.has(pj)) teammateHistory.set(pj, new Map());
            teammateHistory.get(pi)!.set(pj, highFrequency);
            teammateHistory.get(pj)!.set(pi, highFrequency);
          }

          // Build candidate pool
          const candidatePool: PairingCandidate[] = playerIds.map((id, idx) => ({
            playerId: id,
            rating,
            queuePosition: idx + 1 + queueOffset,
            isPair: false,
            pairId: null,
            pairedPlayerIds: null,
          }));

          const input: PairingInput = {
            candidatePool,
            teammateHistory,
            opponentHistory: new Map(),
            matchConfigHistory: new Set(),
            sessionId,
            pairingMode: 'smart',
          };

          const result = selectPairing(input);
          const resultPlayerIds = [...result.team1, ...result.team2].sort();

          // Both groups have diversity bonus = 1.0 (all fresh, no opponent history)
          // Group A has teammate frequency sum = 0 (no teammate history)
          // Group B has teammate frequency sum > 0 (marked teammate pairs)
          // Algorithm should prefer group A (lower teammate frequency sum)
          const groupAIds = playerIds.slice(0, 4).sort();

          expect(resultPlayerIds).toEqual(groupAIds);
        }
      ),
      { numRuns: 100 }
    );
  });
});
