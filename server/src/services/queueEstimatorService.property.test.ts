import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

function insertSession(
  id: string,
  options: { courtCount?: number; gameMode?: string } = {}
) {
  const { courtCount = 4, gameMode = 'doubles' } = options;
  const now = new Date().toISOString();
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
    created_at: now,
    updated_at: now,
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
 * Property 8: Wait estimate formula consistency
 * Validates: Requirements 5.1, 5.4
 *
 * For any queued player at 0-based position P in a session with C courts,
 * M players per match, and average match duration D (where at least 2 matches
 * completed and D > 0), the estimated wait time in minutes SHALL equal
 * `ceil((P+1) / (C × M)) × D` rounded to the nearest whole minute,
 * with a minimum of 1 minute.
 */
describe('queueEstimatorService - Property Tests', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('Property 8: Wait estimate formula consistency', () => {
    fc.assert(
      fc.property(
        fc.record({
          courtCount: fc.integer({ min: 1, max: 8 }),
          gameMode: fc.constantFrom('doubles', 'singles') as fc.Arbitrary<'doubles' | 'singles'>,
          numCompletedMatches: fc.integer({ min: 2, max: 8 }),
          matchDurationMinutes: fc.integer({ min: 5, max: 25 }),
          numQueuedPlayers: fc.integer({ min: 1, max: 20 }),
        }),
        ({ courtCount, gameMode, numCompletedMatches, matchDurationMinutes, numQueuedPlayers }) => {
          const sessionId = uuidv4();
          insertSession(sessionId, { courtCount, gameMode });

          const playersPerMatch = gameMode === 'doubles' ? 4 : 2;

          // Create enough players for matches + queue
          const allPlayerIds: string[] = [];
          const totalPlayersNeeded = playersPerMatch + numQueuedPlayers;
          for (let i = 0; i < totalPlayersNeeded; i++) {
            allPlayerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Create completed matches with consistent duration
          const baseTime = new Date('2024-06-01T10:00:00Z').getTime();
          for (let i = 0; i < numCompletedMatches; i++) {
            const startedAt = new Date(baseTime + i * matchDurationMinutes * 60 * 1000).toISOString();
            const completedAt = new Date(baseTime + (i + 1) * matchDurationMinutes * 60 * 1000).toISOString();
            // Use available player IDs for matches (cycle through the first batch)
            const matchPlayerIds = allPlayerIds.slice(0, playersPerMatch);
            insertCompletedMatch(sessionId, matchPlayerIds, startedAt, completedAt);
          }

          // Add players to the queue at 0-based positions
          for (let i = 0; i < numQueuedPlayers; i++) {
            const playerId = allPlayerIds[playersPerMatch + i];
            repo.createQueueEntry({
              player_id: playerId,
              session_id: sessionId,
              position: i,
            });
          }

          // Call the service
          const estimates = computeWaitEstimates(sessionId);

          // Compute expected average duration
          const avgDurationMinutes = matchDurationMinutes; // All matches have same duration

          // Verify each queued player's estimate
          expect(estimates.length).toBe(numQueuedPlayers);

          for (let i = 0; i < numQueuedPlayers; i++) {
            const position = i + 1; // 1-based position
            const expected = Math.max(
              1,
              Math.round(
                Math.ceil(position / (courtCount * playersPerMatch)) * avgDurationMinutes
              )
            );

            expect(estimates[i].estimatedMinutes).toBe(expected);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
