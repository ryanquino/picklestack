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
 * Property 1: Diversity percentage bounded 0-100
 * Validates: Requirements 1.1, 1.4, 1.6
 *
 * For any session with one or more players, the computed diversity percentage
 * for every player SHALL be an integer in the range [0, 100] inclusive.
 */
describe('diversityService property tests', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('Property 1: Diversity percentage bounded 0-100', () => {
    fc.assert(
      fc.property(
        // Generate player count between 1 and 30
        fc.integer({ min: 1, max: 30 }),
        // Generate a list of pairing entries: [playerIndex1, playerIndex2, asTeammates, asOpponents]
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 29 }),
            fc.integer({ min: 0, max: 29 }),
            fc.integer({ min: 0, max: 5 }), // times_as_teammates
            fc.integer({ min: 0, max: 5 })  // times_as_opponents
          ),
          { minLength: 0, maxLength: 50 }
        ),
        (playerCount, pairingEntries) => {
          // Set up a fresh DB for each run
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create players
          const playerIds: string[] = [];
          for (let i = 0; i < playerCount; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Create pairing history entries (only for valid pairs)
          for (const [idx1, idx2, teammates, opponents] of pairingEntries) {
            // Skip invalid indices or same-player pairs
            if (idx1 >= playerCount || idx2 >= playerCount || idx1 === idx2) continue;
            // Skip entries with no history
            if (teammates === 0 && opponents === 0) continue;

            // Normalize order: player1_id < player2_id
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

          // Test computeDiversityPercentage for each player
          for (const playerId of playerIds) {
            const percentage = computeDiversityPercentage(sessionId, playerId);
            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeLessThanOrEqual(100);
            expect(Number.isInteger(percentage)).toBe(true);
          }

          // Test computeSessionDiversity
          const sessionDiversity = computeSessionDiversity(sessionId);
          for (const [, percentage] of sessionDiversity) {
            expect(percentage).toBeGreaterThanOrEqual(0);
            expect(percentage).toBeLessThanOrEqual(100);
            expect(Number.isInteger(percentage)).toBe(true);
          }

          // Verify all players are in the session diversity map
          expect(sessionDiversity.size).toBe(playerCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
