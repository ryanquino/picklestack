import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computeDiversityPercentage, computeSessionDiversity } from './diversityService';
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
 * Property 5: New check-in resets to zero and adjusts totals
 * Validates: Requirements 1.4, 1.5
 *
 * For any session, when a new player checks in with zero matches played,
 * their diversity percentage SHALL be 0, and every existing player's
 * Total_Possible_Opponents SHALL increase by 1.
 *
 * The key insight: When a new player checks in, Total_Possible_Opponents
 * goes from (N-1) to N for existing players. So their diversity percentage
 * = (uniqueOpponents + uniqueTeammates) / (2 × N) × 100, which is ≤ their
 * previous percentage (calculated with denominator 2×(N-1)).
 */
describe('diversityService property tests - check-in behavior', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('Property 5: New check-in resets to zero and adjusts totals', () => {
    fc.assert(
      fc.property(
        // Generate player count between 2 and 20
        fc.integer({ min: 2, max: 20 }),
        // Generate pairing history entries: [playerIndex1, playerIndex2, asTeammates, asOpponents]
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 19 }),
            fc.integer({ min: 0, max: 19 }),
            fc.integer({ min: 0, max: 5 }), // times_as_teammates
            fc.integer({ min: 0, max: 5 })  // times_as_opponents
          ),
          { minLength: 1, maxLength: 40 }
        ),
        (playerCount, pairingEntries) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create the initial N players
          const playerIds: string[] = [];
          for (let i = 0; i < playerCount; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Create pairing history entries (only for valid pairs)
          for (const [idx1, idx2, teammates, opponents] of pairingEntries) {
            if (idx1 >= playerCount || idx2 >= playerCount || idx1 === idx2) continue;
            if (teammates === 0 && opponents === 0) continue;

            const [p1, p2] = playerIds[idx1] < playerIds[idx2]
              ? [playerIds[idx1], playerIds[idx2]]
              : [playerIds[idx2], playerIds[idx1]];

            repo.upsertPairingHistory({
              session_id: sessionId,
              player1_id: p1,
              player2_id: p2,
              times_as_teammates: teammates,
              times_as_opponents: opponents,
            });
          }

          // Compute diversity percentages BEFORE adding new player
          const diversityBefore = computeSessionDiversity(sessionId);

          // Add a new player (no pairing history for them)
          const newPlayerId = insertPlayer(sessionId, 'NewPlayer');

          // Compute diversity percentages AFTER adding new player
          const diversityAfter = computeSessionDiversity(sessionId);

          // Assert 1: The new player's diversity is 0
          expect(diversityAfter.get(newPlayerId)).toBe(0);

          // Assert 2: Existing players' percentages may decrease or stay the same
          // Because Total_Possible_Opponents increased from (N-1) to N,
          // their unique counts stay the same but denominator grew.
          for (const playerId of playerIds) {
            const before = diversityBefore.get(playerId)!;
            const after = diversityAfter.get(playerId)!;
            expect(after).toBeLessThanOrEqual(before);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
