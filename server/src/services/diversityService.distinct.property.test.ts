import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { getDb, closeDb } from '../db';
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

let sessionCounter = 0;

function createSession(): string {
  sessionCounter++;
  const sessionId = `session-${sessionCounter}`;
  repo.createSession({
    id: sessionId,
    name: `Test Session ${sessionCounter}`,
    court_count: 4,
    status: 'active',
    pairing_mode: 'smart',
    court_name: '',
    session_type: 'open_play',
    game_mode: 'doubles',
    matching_mode: 'smart',
    live_view_url: `/live/${sessionId}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return sessionId;
}

function insertPlayer(sessionId: string, name: string): string {
  const id = `player-${sessionCounter}-${name}`;
  repo.createPlayer({
    id,
    session_id: sessionId,
    name,
    checked_in_at: new Date().toISOString(),
  });
  return id;
}

// ============================================================
// Property 3: Diversity counts distinct players exactly once
// ============================================================

/**
 * Property 3: Diversity counts distinct players exactly once
 *
 * For any player who has faced the same opponent N times (N > 1) across
 * different matches, that opponent SHALL be counted exactly once in the
 * unique opponent count; likewise for teammates.
 *
 * **Validates: Requirements 1.2, 1.3**
 */
describe('Feature: session-intelligence, Property 3: Diversity counts distinct players exactly once', () => {
  beforeEach(() => {
    cleanupDb();
    getDb();
    sessionCounter = 0;
  });

  afterEach(() => {
    cleanupDb();
  });

  it('facing the same opponent N > 1 times yields the same diversity as facing them once', () => {
    fc.assert(
      fc.property(
        // Total number of players in the session (3-10)
        fc.integer({ min: 3, max: 10 }),
        // Number of opponents that the target player has faced (1 to totalPlayers-1)
        fc.integer({ min: 1, max: 9 }),
        // times_as_opponents for the repeated opponent (>1 to test distinct counting)
        fc.integer({ min: 2, max: 50 }),
        (totalPlayers, numOpponentsSeed, timesAsOpponents) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const sessionId = createSession();

          // Create players
          const playerIds: string[] = [];
          for (let i = 0; i < totalPlayers; i++) {
            playerIds.push(insertPlayer(sessionId, `p${i}`));
          }

          const targetPlayer = playerIds[0];
          // Ensure numOpponents doesn't exceed available opponents
          const numOpponents = Math.min(numOpponentsSeed, totalPlayers - 1);

          // Set up pairing history: target player has faced numOpponents opponents
          // The FIRST opponent is faced `timesAsOpponents` times (N > 1)
          // All other opponents are faced exactly 1 time
          for (let i = 1; i <= numOpponents; i++) {
            const opponent = playerIds[i];
            const [p1, p2] = targetPlayer < opponent
              ? [targetPlayer, opponent]
              : [opponent, targetPlayer];

            const times = i === 1 ? timesAsOpponents : 1;
            repo.upsertPairingHistory({
              session_id: sessionId,
              player1_id: p1,
              player2_id: p2,
              times_as_teammates: 0,
              times_as_opponents: times,
            });
          }

          // Compute diversity with the repeated opponent (N > 1 times)
          const diversityWithRepeats = computeDiversityPercentage(sessionId, targetPlayer);

          // Now reset the first opponent to times_as_opponents = 1
          const firstOpponent = playerIds[1];
          const [fp1, fp2] = targetPlayer < firstOpponent
            ? [targetPlayer, firstOpponent]
            : [firstOpponent, targetPlayer];

          repo.upsertPairingHistory({
            session_id: sessionId,
            player1_id: fp1,
            player2_id: fp2,
            times_as_teammates: 0,
            times_as_opponents: 1,
          });

          // Compute diversity with opponent faced only once
          const diversityWithSingle = computeDiversityPercentage(sessionId, targetPlayer);

          // Both should be equal — facing opponent N times vs 1 time
          // should yield the same diversity score
          expect(diversityWithRepeats).toBe(diversityWithSingle);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('repeated teammates are also counted exactly once', () => {
    fc.assert(
      fc.property(
        // Total players in session (3-10)
        fc.integer({ min: 3, max: 10 }),
        // Number of teammates the target player has (1 to totalPlayers-1)
        fc.integer({ min: 1, max: 9 }),
        // times_as_teammates for the repeated teammate (>1)
        fc.integer({ min: 2, max: 50 }),
        (totalPlayers, numTeammatesSeed, timesAsTeammates) => {
          cleanupDb();
          getDb();
          sessionCounter++;

          const sessionId = createSession();

          // Create players
          const playerIds: string[] = [];
          for (let i = 0; i < totalPlayers; i++) {
            playerIds.push(insertPlayer(sessionId, `p${i}`));
          }

          const targetPlayer = playerIds[0];
          const numTeammates = Math.min(numTeammatesSeed, totalPlayers - 1);

          // Set up pairing history: first teammate paired N > 1 times
          for (let i = 1; i <= numTeammates; i++) {
            const teammate = playerIds[i];
            const [p1, p2] = targetPlayer < teammate
              ? [targetPlayer, teammate]
              : [teammate, targetPlayer];

            const times = i === 1 ? timesAsTeammates : 1;
            repo.upsertPairingHistory({
              session_id: sessionId,
              player1_id: p1,
              player2_id: p2,
              times_as_teammates: times,
              times_as_opponents: 0,
            });
          }

          // Compute diversity with repeated teammate
          const diversityWithRepeats = computeDiversityPercentage(sessionId, targetPlayer);

          // Reset first teammate to times_as_teammates = 1
          const firstTeammate = playerIds[1];
          const [tp1, tp2] = targetPlayer < firstTeammate
            ? [targetPlayer, firstTeammate]
            : [firstTeammate, targetPlayer];

          repo.upsertPairingHistory({
            session_id: sessionId,
            player1_id: tp1,
            player2_id: tp2,
            times_as_teammates: 1,
            times_as_opponents: 0,
          });

          // Compute diversity with teammate paired only once
          const diversityWithSingle = computeDiversityPercentage(sessionId, targetPlayer);

          // Both should be equal — same unique teammate count
          expect(diversityWithRepeats).toBe(diversityWithSingle);
        }
      ),
      { numRuns: 100 }
    );
  });
});
