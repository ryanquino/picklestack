import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computeMatchQuality } from './qualityScorerService';
import fs from 'fs';
import path from 'path';

/**
 * Property 10: Match quality rating bounded 0-100
 * Validates: Requirements 7.1, 7.5
 *
 * For any completed match with recorded scores, the Match_Quality_Rating SHALL be
 * an integer in the range [0, 100] inclusive.
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
  team1Score: number | null,
  team2Score: number | null
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

describe('qualityScorerService - Property 10: Match quality rating bounded 0-100', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('match quality rating is an integer in [0, 100] for matches with scores', () => {
    fc.assert(
      fc.property(
        // Generate 4 player ratings (100-3000)
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        // Generate team scores (0-15 each)
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        (rating1, rating2, rating3, rating4, team1Score, team2Score) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create 4 players (doubles)
          const p1 = insertPlayer(sessionId, 'Player1');
          const p2 = insertPlayer(sessionId, 'Player2');
          const p3 = insertPlayer(sessionId, 'Player3');
          const p4 = insertPlayer(sessionId, 'Player4');

          // Set player ratings
          repo.upsertPlayerRating({ player_id: p1, session_id: sessionId, rating: rating1, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p2, session_id: sessionId, rating: rating2, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p3, session_id: sessionId, rating: rating3, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p4, session_id: sessionId, rating: rating4, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });

          // Create a completed match
          const playerIds = [p1, p2, p3, p4];
          const matchId = insertCompletedMatch(sessionId, playerIds);

          // Create match result with scores
          const winnerIds = team1Score >= team2Score ? [p1, p2] : [p3, p4];
          const loserIds = team1Score >= team2Score ? [p3, p4] : [p1, p2];
          insertMatchResult(matchId, sessionId, winnerIds, loserIds, team1Score, team2Score);

          // Compute match quality
          const result = computeMatchQuality(matchId, sessionId);

          // Assert rating is an integer in [0, 100]
          expect(result.matchQualityRating).toBeGreaterThanOrEqual(0);
          expect(result.matchQualityRating).toBeLessThanOrEqual(100);
          expect(Number.isInteger(result.matchQualityRating)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('match quality rating is an integer in [0, 100] for matches without scores (no-scores case)', () => {
    fc.assert(
      fc.property(
        // Generate 4 player ratings (100-3000)
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        (rating1, rating2, rating3, rating4) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create 4 players (doubles)
          const p1 = insertPlayer(sessionId, 'Player1');
          const p2 = insertPlayer(sessionId, 'Player2');
          const p3 = insertPlayer(sessionId, 'Player3');
          const p4 = insertPlayer(sessionId, 'Player4');

          // Set player ratings
          repo.upsertPlayerRating({ player_id: p1, session_id: sessionId, rating: rating1, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p2, session_id: sessionId, rating: rating2, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p3, session_id: sessionId, rating: rating3, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p4, session_id: sessionId, rating: rating4, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });

          // Create a completed match
          const playerIds = [p1, p2, p3, p4];
          const matchId = insertCompletedMatch(sessionId, playerIds);

          // Create match result WITHOUT scores (null scores - winner-only result)
          insertMatchResult(matchId, sessionId, [p1, p2], [p3, p4], null, null);

          // Compute match quality
          const result = computeMatchQuality(matchId, sessionId);

          // Assert rating is an integer in [0, 100]
          expect(result.matchQualityRating).toBeGreaterThanOrEqual(0);
          expect(result.matchQualityRating).toBeLessThanOrEqual(100);
          expect(Number.isInteger(result.matchQualityRating)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
