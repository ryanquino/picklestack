import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { calculateDiversityBonus } from './diversityService';
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
 * Property 6: Diversity bonus bounded [0, 1]
 * Validates: Requirements 3.2
 *
 * For any candidate grouping of players in a session, the diversity bonus
 * SHALL be a value between 0.0 and 1.0 inclusive, computed as fresh opponent
 * pairings divided by maximum possible fresh pairings.
 */
describe('diversityService bonus property tests', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('Property 6: Diversity bonus bounded [0, 1]', () => {
    fc.assert(
      fc.property(
        // Generate player count between 2 and 20
        fc.integer({ min: 2, max: 20 }),
        // Generate group size: 2 (singles) or 4 (doubles)
        fc.constantFrom(2, 4),
        // Generate pairing history entries: [playerIdx1, playerIdx2, timesAsOpponents]
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 19 }),
            fc.integer({ min: 0, max: 19 }),
            fc.integer({ min: 1, max: 10 }) // times_as_opponents (at least 1 to be meaningful)
          ),
          { minLength: 0, maxLength: 30 }
        ),
        // Generate indices for the candidate grouping
        fc.array(fc.integer({ min: 0, max: 19 }), { minLength: 4, maxLength: 4 }),
        (playerCount, groupSize, pairingEntries, groupIndices) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create players
          const playerIds: string[] = [];
          for (let i = 0; i < playerCount; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Create pairing history (some players have opponent history)
          for (const [idx1, idx2, opponents] of pairingEntries) {
            if (idx1 >= playerCount || idx2 >= playerCount || idx1 === idx2) continue;

            const [p1, p2] = playerIds[idx1] < playerIds[idx2]
              ? [playerIds[idx1], playerIds[idx2]]
              : [playerIds[idx2], playerIds[idx1]];

            repo.upsertPairingHistory({
              session_id: sessionId,
              player1_id: p1,
              player2_id: p2,
              times_as_teammates: 0,
              times_as_opponents: opponents,
            });
          }

          // Build candidate grouping from valid, distinct indices
          const validIndices = groupIndices
            .filter((idx) => idx < playerCount);
          const uniqueIndices = [...new Set(validIndices)].slice(0, groupSize);

          // Only test if we have enough distinct players for the group
          if (uniqueIndices.length < groupSize) return;

          const candidatePlayerIds = uniqueIndices.map((idx) => playerIds[idx]);

          // Call calculateDiversityBonus
          const bonus = calculateDiversityBonus(candidatePlayerIds, sessionId);

          // Assert the bonus is in [0.0, 1.0]
          expect(bonus).toBeGreaterThanOrEqual(0.0);
          expect(bonus).toBeLessThanOrEqual(1.0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
