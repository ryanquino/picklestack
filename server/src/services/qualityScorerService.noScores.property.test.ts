import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computeMatchQuality } from './qualityScorerService';
import fs from 'fs';
import path from 'path';

/**
 * Property 12: Match quality without scores uses reduced formula
 * Validates: Requirements 7.6
 *
 * For any completed match without recorded scores (winner-only result),
 * the Match_Quality_Rating SHALL be computed using only Rating_Balance_Score (60% weight)
 * and Freshness_Score (40% weight), clamped to [0, 100].
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

describe('qualityScorerService - Property 12: Match quality without scores uses reduced formula', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('no-scores match uses balance (60%) + freshness (40%) reduced formula', () => {
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

          // Calculate expected Rating_Balance_Score
          const team1Avg = (rating1 + rating2) / 2;
          const team2Avg = (rating3 + rating4) / 2;
          const ratingGap = Math.abs(team1Avg - team2Avg);
          const expectedRatingBalance = Math.max(0, 100 - ratingGap);

          // This is the first match in the session → Freshness_Score = 100 (fresh)
          const expectedFreshness = 100;

          // Expected rating using reduced formula: balance * 0.60 + freshness * 0.40
          const expectedRating = Math.round(
            Math.max(0, Math.min(100, expectedRatingBalance * 0.60 + expectedFreshness * 0.40))
          );

          // Assert the returned matchQualityRating equals expected rating
          expect(result.matchQualityRating).toBe(expectedRating);

          // Assert hasScores is false
          expect(result.hasScores).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
