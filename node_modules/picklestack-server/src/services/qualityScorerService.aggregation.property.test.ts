import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import { closeDb } from '../db';
import * as repo from '../repository';
import { computeMatchQuality, getSessionQualityMetrics } from './qualityScorerService';
import fs from 'fs';
import path from 'path';

/**
 * Property 13: Session quality score is arithmetic mean
 * Validates: Requirements 8.1
 *
 * For any session with N rated matches (N ≥ 1), the Session_Quality_Score SHALL equal
 * the arithmetic mean of all N Match_Quality_Rating values, rounded to the nearest integer.
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

describe('qualityScorerService - Property 13: Session quality score is arithmetic mean', () => {
  beforeEach(() => {
    cleanupDb();
  });

  afterEach(() => {
    cleanupDb();
  });

  it('session quality score equals arithmetic mean of all match quality ratings', () => {
    fc.assert(
      fc.property(
        // Generate number of matches (1–10)
        fc.integer({ min: 1, max: 10 }),
        // Generate an array of score pairs (team1Score, team2Score) for each match
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 15 }),
            fc.integer({ min: 0, max: 15 })
          ),
          { minLength: 10, maxLength: 10 }
        ),
        (numMatches, scorePairs) => {
          cleanupDb();

          const sessionId = uuidv4();
          insertSession(sessionId);

          // Create 4 players (reused across all matches)
          const p1 = insertPlayer(sessionId, 'Player1');
          const p2 = insertPlayer(sessionId, 'Player2');
          const p3 = insertPlayer(sessionId, 'Player3');
          const p4 = insertPlayer(sessionId, 'Player4');
          const playerIds = [p1, p2, p3, p4];

          // Set fixed player ratings to simplify computation
          repo.upsertPlayerRating({ player_id: p1, session_id: sessionId, rating: 1000, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p2, session_id: sessionId, rating: 1000, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p3, session_id: sessionId, rating: 1000, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });
          repo.upsertPlayerRating({ player_id: p4, session_id: sessionId, rating: 1000, matches_played: 1, wins: 0, losses: 0, star_rating: 3 });

          // Create N matches and compute quality for each
          const matchRatings: number[] = [];

          for (let i = 0; i < numMatches; i++) {
            const [team1Score, team2Score] = scorePairs[i];
            const courtNumber = (i % 4) + 1;
            const matchId = insertCompletedMatch(sessionId, playerIds, courtNumber);

            const winnerIds = team1Score >= team2Score ? [p1, p2] : [p3, p4];
            const loserIds = team1Score >= team2Score ? [p3, p4] : [p1, p2];
            insertMatchResult(matchId, sessionId, winnerIds, loserIds, team1Score, team2Score);

            const result = computeMatchQuality(matchId, sessionId);
            matchRatings.push(result.matchQualityRating);
          }

          // Get session quality metrics
          const metrics = getSessionQualityMetrics(sessionId);

          // Compute expected session quality = arithmetic mean rounded to nearest integer
          const expectedScore = Math.round(
            matchRatings.reduce((sum, r) => sum + r, 0) / matchRatings.length
          );

          // Assert session quality score equals expected mean
          expect(metrics.sessionQualityScore).toBe(expectedScore);

          // Assert totalMatchesRated equals N
          expect(metrics.totalMatchesRated).toBe(numMatches);

          // Assert recentMatchRatings has at most 3 entries
          expect(metrics.recentMatchRatings.length).toBeLessThanOrEqual(3);
        }
      ),
      { numRuns: 100 }
    );
  });
});
