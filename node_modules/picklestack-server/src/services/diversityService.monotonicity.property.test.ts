import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computeDiversityPercentage } from './diversityService';
import fs from 'fs';
import path from 'path';

/**
 * Property 2: Diversity percentage monotonically non-decreasing with new unique opponents/teammates
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * For any player in a session, after completing a match that includes at least one new unique
 * opponent or teammate, the player's diversity percentage SHALL be greater than or equal to
 * their previous diversity percentage.
 */

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

describe('diversityService - Property 2: Monotonicity', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('diversity percentage never decreases when a new unique opponent is added', () => {
    fc.assert(
      fc.property(
        // Generate session size between 3 and 20 players
        fc.integer({ min: 3, max: 20 }),
        (numPlayers) => {
          // Clean state for each iteration
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create all players
          const playerIds: string[] = [];
          for (let i = 0; i < numPlayers; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Target player is the first one
          const targetPlayerId = playerIds[0];

          // Track diversity percentage after each new unique opponent addition
          let previousPercentage = computeDiversityPercentage(sessionId, targetPlayerId);

          // Progressively add unique opponents for the target player
          for (let i = 1; i < numPlayers; i++) {
            const opponentId = playerIds[i];
            // Ensure consistent ordering for pairing_history
            const [p1, p2] = targetPlayerId < opponentId
              ? [targetPlayerId, opponentId]
              : [opponentId, targetPlayerId];

            repo.upsertPairingHistory({
              session_id: sessionId,
              player1_id: p1,
              player2_id: p2,
              times_as_teammates: 0,
              times_as_opponents: 1,
            });

            const currentPercentage = computeDiversityPercentage(sessionId, targetPlayerId);

            // Diversity should never decrease when adding a new unique opponent
            expect(currentPercentage).toBeGreaterThanOrEqual(previousPercentage);
            previousPercentage = currentPercentage;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('diversity percentage never decreases when a new unique teammate is added', () => {
    fc.assert(
      fc.property(
        // Generate session size between 3 and 20 players
        fc.integer({ min: 3, max: 20 }),
        (numPlayers) => {
          // Clean state for each iteration
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create all players
          const playerIds: string[] = [];
          for (let i = 0; i < numPlayers; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Target player is the first one
          const targetPlayerId = playerIds[0];

          // Track diversity percentage after each new unique teammate addition
          let previousPercentage = computeDiversityPercentage(sessionId, targetPlayerId);

          // Progressively add unique teammates for the target player
          for (let i = 1; i < numPlayers; i++) {
            const teammateId = playerIds[i];
            // Ensure consistent ordering for pairing_history
            const [p1, p2] = targetPlayerId < teammateId
              ? [targetPlayerId, teammateId]
              : [teammateId, targetPlayerId];

            repo.upsertPairingHistory({
              session_id: sessionId,
              player1_id: p1,
              player2_id: p2,
              times_as_teammates: 1,
              times_as_opponents: 0,
            });

            const currentPercentage = computeDiversityPercentage(sessionId, targetPlayerId);

            // Diversity should never decrease when adding a new unique teammate
            expect(currentPercentage).toBeGreaterThanOrEqual(previousPercentage);
            previousPercentage = currentPercentage;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('diversity percentage never decreases with mixed opponent and teammate additions', () => {
    fc.assert(
      fc.property(
        // Generate session size between 3 and 20 players
        fc.integer({ min: 3, max: 20 }),
        // Generate a random sequence of "opponent" or "teammate" additions
        fc.array(fc.boolean(), { minLength: 2, maxLength: 19 }),
        (numPlayers, addAsOpponent) => {
          // Clean state for each iteration
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create all players
          const playerIds: string[] = [];
          for (let i = 0; i < numPlayers; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Target player is the first one
          const targetPlayerId = playerIds[0];

          // Track diversity percentage after each new unique pairing
          let previousPercentage = computeDiversityPercentage(sessionId, targetPlayerId);

          // Progressively add unique pairings, alternating between opponent and teammate
          const otherPlayers = playerIds.slice(1);
          const iterations = Math.min(otherPlayers.length, addAsOpponent.length);

          for (let i = 0; i < iterations; i++) {
            const otherId = otherPlayers[i];
            const [p1, p2] = targetPlayerId < otherId
              ? [targetPlayerId, otherId]
              : [otherId, targetPlayerId];

            if (addAsOpponent[i]) {
              repo.upsertPairingHistory({
                session_id: sessionId,
                player1_id: p1,
                player2_id: p2,
                times_as_teammates: 0,
                times_as_opponents: 1,
              });
            } else {
              repo.upsertPairingHistory({
                session_id: sessionId,
                player1_id: p1,
                player2_id: p2,
                times_as_teammates: 1,
                times_as_opponents: 0,
              });
            }

            const currentPercentage = computeDiversityPercentage(sessionId, targetPlayerId);

            // Diversity should never decrease when adding a new unique pairing
            expect(currentPercentage).toBeGreaterThanOrEqual(previousPercentage);
            previousPercentage = currentPercentage;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
