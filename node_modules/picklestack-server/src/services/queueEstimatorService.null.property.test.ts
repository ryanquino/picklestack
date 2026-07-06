import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computeWaitEstimates } from './queueEstimatorService';
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

function insertSession(id: string, options: { courtCount?: number; gameMode?: string } = {}) {
  const { courtCount = 4, gameMode = 'doubles' } = options;
  return repo.createSession({
    id,
    name: 'Test Session',
    court_count: courtCount,
    status: 'active',
    pairing_mode: 'smart',
    court_name: '',
    session_type: 'open_play',
    game_mode: gameMode,
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

function insertQueueEntry(playerId: string, sessionId: string, position: number) {
  repo.createQueueEntry({
    player_id: playerId,
    session_id: sessionId,
    position,
  });
}

function insertCompletedMatch(
  sessionId: string,
  playerIds: string[],
  startedAt: string,
  completedAt: string
): string {
  const id = uuidv4();
  repo.createMatch({
    id,
    session_id: sessionId,
    court_number: 1,
    player_ids: JSON.stringify(playerIds),
    status: 'completed',
    started_at: startedAt,
    completed_at: completedAt,
  });
  return id;
}

/**
 * Property 9: Wait estimate null conditions
 * Validates: Requirements 5.2, 5.5
 *
 * For any session where fewer than 2 matches have been completed OR
 * the average match duration is zero, the wait estimate for every
 * queued player SHALL be null.
 */
describe('queueEstimatorService null conditions property tests', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('Property 9a: Sessions with fewer than 2 completed matches → all estimates null', () => {
    fc.assert(
      fc.property(
        // Number of completed matches: 0 or 1
        fc.integer({ min: 0, max: 1 }),
        // Number of queued players: 1-20
        fc.integer({ min: 1, max: 20 }),
        // Game mode
        fc.constantFrom('doubles', 'singles'),
        // Court count
        fc.integer({ min: 1, max: 8 }),
        (completedMatchCount, queueSize, gameMode, courtCount) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId, { courtCount, gameMode });

          // Create enough players for matches and queue
          const playersPerMatch = gameMode === 'doubles' ? 4 : 2;
          const matchPlayerCount = completedMatchCount * playersPerMatch;
          const totalPlayers = matchPlayerCount + queueSize;

          const allPlayerIds: string[] = [];
          for (let i = 0; i < totalPlayers; i++) {
            allPlayerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Create 0 or 1 completed matches with a non-zero duration
          const baseTime = new Date('2024-06-01T10:00:00Z').getTime();
          for (let m = 0; m < completedMatchCount; m++) {
            const matchPlayers = allPlayerIds.slice(
              m * playersPerMatch,
              (m + 1) * playersPerMatch
            );
            const startedAt = new Date(baseTime + m * 15 * 60 * 1000).toISOString();
            const completedAt = new Date(baseTime + (m + 1) * 15 * 60 * 1000).toISOString();
            insertCompletedMatch(sessionId, matchPlayers, startedAt, completedAt);
          }

          // Create queue entries for remaining players
          for (let q = 0; q < queueSize; q++) {
            const playerId = allPlayerIds[matchPlayerCount + q];
            insertQueueEntry(playerId, sessionId, q);
          }

          // Compute wait estimates
          const estimates = computeWaitEstimates(sessionId);

          // All estimates should be returned and all should be null
          expect(estimates.length).toBe(queueSize);
          for (const estimate of estimates) {
            expect(estimate.estimatedMinutes).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 9b: Sessions with zero average duration → all estimates null', () => {
    fc.assert(
      fc.property(
        // Number of completed matches with zero duration: 2-10
        fc.integer({ min: 2, max: 10 }),
        // Number of queued players: 1-20
        fc.integer({ min: 1, max: 20 }),
        // Game mode
        fc.constantFrom('doubles', 'singles'),
        // Court count
        fc.integer({ min: 1, max: 8 }),
        (matchCount, queueSize, gameMode, courtCount) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId, { courtCount, gameMode });

          // Create enough players for matches and queue
          const playersPerMatch = gameMode === 'doubles' ? 4 : 2;
          const matchPlayerCount = matchCount * playersPerMatch;
          const totalPlayers = matchPlayerCount + queueSize;

          const allPlayerIds: string[] = [];
          for (let i = 0; i < totalPlayers; i++) {
            allPlayerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Create matches where startedAt === completedAt (zero duration)
          const baseTime = new Date('2024-06-01T10:00:00Z').getTime();
          for (let m = 0; m < matchCount; m++) {
            const matchPlayers = allPlayerIds.slice(
              m * playersPerMatch,
              (m + 1) * playersPerMatch
            );
            const timestamp = new Date(baseTime + m * 5 * 60 * 1000).toISOString();
            // started_at === completed_at → zero duration
            insertCompletedMatch(sessionId, matchPlayers, timestamp, timestamp);
          }

          // Create queue entries for remaining players
          for (let q = 0; q < queueSize; q++) {
            const playerId = allPlayerIds[matchPlayerCount + q];
            insertQueueEntry(playerId, sessionId, q);
          }

          // Compute wait estimates
          const estimates = computeWaitEstimates(sessionId);

          // All estimates should be returned and all should be null
          expect(estimates.length).toBe(queueSize);
          for (const estimate of estimates) {
            expect(estimate.estimatedMinutes).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
