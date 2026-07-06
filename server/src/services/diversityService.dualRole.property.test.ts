import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computeDiversityPercentage } from './diversityService';
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
 * Property 4: Player appears in both sets when both teammate and opponent
 * Validates: Requirements 1.7
 *
 * For any player A and player B in the same session, if A has been B's teammate
 * in one match (times_as_teammates > 0) and B's opponent in another match
 * (times_as_opponents > 0), then B SHALL appear in both A's unique teammate set
 * and A's unique opponent set simultaneously. This means the diversity formula
 * numerator counts B twice (once in each set).
 */
describe('diversityService property tests - dual-role counting', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('Property 4: Player appears in both sets when both teammate and opponent', () => {
    fc.assert(
      fc.property(
        // Generate player count between 4 and 20
        fc.integer({ min: 4, max: 20 }),
        // Generate times_as_teammates for the A-B pair (must be > 0)
        fc.integer({ min: 1, max: 10 }),
        // Generate times_as_opponents for the A-B pair (must be > 0)
        fc.integer({ min: 1, max: 10 }),
        // Generate additional pairing entries for other players with A
        // Each entry: [playerIndex, asTeammates, asOpponents]
        fc.array(
          fc.tuple(
            fc.integer({ min: 2, max: 19 }), // index of other player (skip 0=A, 1=B)
            fc.integer({ min: 0, max: 5 }),   // times_as_teammates
            fc.integer({ min: 0, max: 5 })    // times_as_opponents
          ),
          { minLength: 0, maxLength: 20 }
        ),
        (playerCount, abTeammates, abOpponents, otherPairings) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create players: index 0 = A, index 1 = B, rest are extras
          const playerIds: string[] = [];
          for (let i = 0; i < playerCount; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          const playerA = playerIds[0];
          const playerB = playerIds[1];

          // Set up the key pairing: A and B have BOTH times_as_teammates > 0 AND times_as_opponents > 0
          const [p1, p2] = playerA < playerB ? [playerA, playerB] : [playerB, playerA];
          repo.upsertPairingHistory({
            session_id: sessionId,
            player1_id: p1,
            player2_id: p2,
            times_as_teammates: abTeammates,
            times_as_opponents: abOpponents,
          });

          // Add additional pairing history for A with other players
          for (const [idx, teammates, opponents] of otherPairings) {
            if (idx >= playerCount || idx === 0 || idx === 1) continue;
            if (teammates === 0 && opponents === 0) continue;

            const otherPlayer = playerIds[idx];
            const [op1, op2] = playerA < otherPlayer
              ? [playerA, otherPlayer]
              : [otherPlayer, playerA];

            repo.upsertPairingHistory({
              session_id: sessionId,
              player1_id: op1,
              player2_id: op2,
              times_as_teammates: teammates,
              times_as_opponents: opponents,
            });
          }

          // Compute diversity for player A
          const diversityA = computeDiversityPercentage(sessionId, playerA);

          // The total possible opponents is playerCount - 1
          const totalPossibleOpponents = playerCount - 1;

          // Count unique opponents and teammates for A manually to verify B is in both
          const pairingHistory = repo.getPairingHistoryBySession(sessionId);

          let uniqueOpponents = 0;
          let uniqueTeammates = 0;

          for (const entry of pairingHistory) {
            if (entry.player1_id === playerA || entry.player2_id === playerA) {
              if (entry.times_as_opponents > 0) uniqueOpponents++;
              if (entry.times_as_teammates > 0) uniqueTeammates++;
            }
          }

          // B must be counted in both sets since abTeammates > 0 and abOpponents > 0
          // Verify that uniqueOpponents >= 1 (at least B) and uniqueTeammates >= 1 (at least B)
          expect(uniqueOpponents).toBeGreaterThanOrEqual(1);
          expect(uniqueTeammates).toBeGreaterThanOrEqual(1);

          // The diversity percentage should reflect B being in BOTH sets
          // Expected: ((uniqueOpponents + uniqueTeammates) / (2 * totalPossibleOpponents)) * 100
          const expectedPercentage = Math.round(
            ((uniqueOpponents + uniqueTeammates) / (2 * totalPossibleOpponents)) * 100
          );
          expect(diversityA).toBe(expectedPercentage);

          // Since B is in both sets, the numerator (uniqueOpponents + uniqueTeammates)
          // counts B twice. Verify this by checking that if we had only B as a partner,
          // the diversity would account for both roles.
          // With only B: uniqueOpponents=1, uniqueTeammates=1, so numerator=2
          // This confirms B contributes to both counts.
          expect(uniqueOpponents + uniqueTeammates).toBeGreaterThanOrEqual(2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
