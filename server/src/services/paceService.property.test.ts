import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computePaceMetrics } from './paceService';
import fs from 'fs';
import path from 'path';

/**
 * Property 14: Pacing projection formula consistency
 * Validates: Requirements 4.2, 4.3
 *
 * For any active session with at least 2 completed matches, non-zero remaining time,
 * and at least one checked-in player, the Pacing_Projection SHALL equal
 * Math.round(remaining_time_minutes / Average_Match_Duration × Court_Count / ceil(Total_Players / Players_Per_Match))
 */

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
  options: {
    courtCount?: number;
    gameMode?: string;
    createdAt?: string;
  } = {}
) {
  const { courtCount = 4, gameMode = 'doubles', createdAt = new Date().toISOString() } = options;
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
    created_at: createdAt,
    updated_at: createdAt,
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

describe('paceService - Property-Based Tests', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('Property 14: Pacing projection formula consistency', () => {
    /**
     * Validates: Requirements 4.2, 4.3
     *
     * Generate session timing scenarios with varying match counts, court counts,
     * and player counts, then assert the projection matches the specified formula.
     */
    fc.assert(
      fc.property(
        fc.record({
          courtCount: fc.integer({ min: 1, max: 12 }),
          gameMode: fc.constantFrom('doubles', 'singles'),
          playerCount: fc.integer({ min: 2, max: 30 }),
          matchCount: fc.integer({ min: 2, max: 10 }),
          matchDurationMinutes: fc.integer({ min: 5, max: 30 }),
          // How many minutes ago the session was created (so remaining > 0)
          minutesAgo: fc.integer({ min: 30, max: 180 }),
        }),
        ({ courtCount, gameMode, playerCount, matchCount, matchDurationMinutes, minutesAgo }) => {
          // Ensure remaining time is positive:
          // remaining = (createdAt + 240min) - now = 240 - minutesAgo
          const remainingMinutes = 240 - minutesAgo;
          // Skip if remaining time would be <= 0 (handled by a different edge case)
          if (remainingMinutes <= 0) return;

          cleanupDb();

          const sessionId = uuidv4();
          const now = Date.now();
          const createdAt = new Date(now - minutesAgo * 60 * 1000).toISOString();

          insertSession(sessionId, { courtCount, gameMode, createdAt });

          // Create players
          const playerIds: string[] = [];
          for (let i = 0; i < playerCount; i++) {
            playerIds.push(insertPlayer(sessionId, `Player${i}`));
          }

          // Create completed matches with consistent duration
          const matchDurationMs = matchDurationMinutes * 60 * 1000;
          for (let i = 0; i < matchCount; i++) {
            // Spread matches into the past so they're all completed before now
            const matchStart = new Date(now - (matchCount - i) * matchDurationMs - 60000).toISOString();
            const matchEnd = new Date(
              new Date(matchStart).getTime() + matchDurationMs
            ).toISOString();

            // Pick player IDs for the match (cycle through available players)
            const playersPerMatch = gameMode === 'singles' ? 2 : 4;
            const matchPlayers: string[] = [];
            for (let p = 0; p < Math.min(playersPerMatch, playerIds.length); p++) {
              matchPlayers.push(playerIds[(i * playersPerMatch + p) % playerIds.length]);
            }

            insertCompletedMatch(sessionId, matchPlayers, matchStart, matchEnd);
          }

          // Call the service
          const result = computePaceMetrics(sessionId);

          // Compute expected projection using the formula
          const playersPerMatch = gameMode === 'singles' ? 2 : 4;
          const rotationGroups = Math.ceil(playerCount / playersPerMatch);
          const avgDurationMinutes = matchDurationMinutes; // all matches same duration

          const expectedProjection = Math.round(
            (remainingMinutes / avgDurationMinutes) * courtCount / rotationGroups
          );

          // The service computes remaining time dynamically from Date.now(), which may
          // differ slightly from our `remainingMinutes` calculation (by a few ms/seconds).
          // Allow a tolerance of ±1 in the projection.
          expect(result.pacingProjection).not.toBeNull();
          expect(Math.abs(result.pacingProjection! - expectedProjection)).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
