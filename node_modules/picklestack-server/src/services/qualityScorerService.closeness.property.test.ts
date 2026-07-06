import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computeMatchQuality } from './qualityScorerService';
import fs from 'fs';
import path from 'path';

/**
 * Property 11: Score closeness formula correctness
 * Validates: Requirements 7.2
 *
 * For any completed match with team scores T1 and T2, the Score_Closeness_Score
 * SHALL equal max(0, 100 - |T1 - T2| × 10).
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

function insertCompletedMatch(
  sessionId: string,
  playerIds: string[],
  courtNumber: number = 1
): string {
  const id = uuidv4();
  const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const completedAt = new Date().toISOString();
  repo.createMatch({
    id,
    session_id: sessionId,
    court_number: courtNumber,
    player_ids: JSON.stringify(playerIds),
    status: 'completed',
    started_at: startedAt,
    completed_at: completedAt,
  });
  return id;
}

function insertMatchResult(
  matchId: string,
  sessionId: string,
  winnerIds: string[],
  loserIds: string[],
  team1Score: number,
  team2Score: number
) {
  repo.createMatchResult({
    id: uuidv4(),
    match_id: matchId,
    session_id: sessionId,
    winner_player_ids: JSON.stringify(winnerIds),
    loser_player_ids: JSON.stringify(loserIds),
    team1_score: team1Score,
    team2_score: team2Score,
    recorded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

describe('qualityScorerService - Property 11: Score closeness formula correctness', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('scoreClosenessScore equals max(0, 100 - |T1 - T2| × 10) for any team scores', () => {
    fc.assert(
      fc.property(
        // Generate team scores (0-15 each)
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        (team1Score, team2Score) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create 4 players with default 1000 rating (no rating entries needed,
          // service uses DEFAULT_RATING=1000 when no rating row exists)
          const p1 = insertPlayer(sessionId, 'Player1');
          const p2 = insertPlayer(sessionId, 'Player2');
          const p3 = insertPlayer(sessionId, 'Player3');
          const p4 = insertPlayer(sessionId, 'Player4');

          // All players have rating 1000 (default), so ratingBalance = 100
          // This isolates the scoreClosenessScore for verification

          // Create a completed match
          const playerIds = [p1, p2, p3, p4];
          const matchId = insertCompletedMatch(sessionId, playerIds);

          // Create match result with the generated scores
          const winnerIds = team1Score >= team2Score ? [p1, p2] : [p3, p4];
          const loserIds = team1Score >= team2Score ? [p3, p4] : [p1, p2];
          insertMatchResult(matchId, sessionId, winnerIds, loserIds, team1Score, team2Score);

          // Compute match quality
          const result = computeMatchQuality(matchId, sessionId);

          // Expected closeness per the formula in Requirement 7.2
          const expectedCloseness = Math.max(0, 100 - Math.abs(team1Score - team2Score) * 10);

          // Assert scoreClosenessScore matches the formula
          expect(result.scoreClosenessScore).toBe(expectedCloseness);
        }
      ),
      { numRuns: 100 }
    );
  });
});
