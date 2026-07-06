import { getDb } from '../db';
import { MatchQuality, MatchQualityRow, SessionQualityMetrics } from '../types';
import { MatchRow, MatchResultRow, PlayerRatingRow } from '../repository';

// ============================================================
// Constants
// ============================================================

const DEFAULT_RATING = 1000;

// ============================================================
// Public Interface
// ============================================================

/**
 * Computes and persists the quality rating for a completed match.
 * Uses Score_Closeness (40%), Rating_Balance (35%), Freshness (25%) when scores present.
 * Uses Rating_Balance (60%) + Freshness (40%) when no scores recorded.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
export function computeMatchQuality(matchId: string, sessionId: string): MatchQuality {
  const db = getDb();

  // Get the match details
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
  if (!match) {
    throw new Error(`Match not found: ${matchId}`);
  }

  const playerIds: string[] = JSON.parse(match.player_ids);

  // Get match result (scores)
  const result = db.prepare(
    'SELECT * FROM match_results WHERE match_id = ?'
  ).get(matchId) as MatchResultRow | undefined;

  const hasScores = result !== undefined && result.team1_score !== null && result.team2_score !== null;

  // Compute Score Closeness Score
  let scoreClosenessScore = 0;
  if (hasScores) {
    const scoreDifference = Math.abs(result.team1_score! - result.team2_score!);
    scoreClosenessScore = Math.max(0, 100 - scoreDifference * 10);
  }

  // Compute Rating Balance Score
  const ratingBalanceScore = computeRatingBalance(playerIds, sessionId);

  // Compute Freshness Score
  const freshnessScore = computeFreshness(playerIds, matchId, sessionId);

  // Compute Match Quality Rating
  let matchQualityRating: number;
  if (hasScores) {
    matchQualityRating = scoreClosenessScore * 0.40 + ratingBalanceScore * 0.35 + freshnessScore * 0.25;
  } else {
    matchQualityRating = ratingBalanceScore * 0.60 + freshnessScore * 0.40;
  }

  // Clamp to [0, 100] and round to integer
  matchQualityRating = Math.round(Math.max(0, Math.min(100, matchQualityRating)));

  // Persist to match_quality_scores table
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO match_quality_scores (match_id, session_id, score_closeness_score, rating_balance_score, freshness_score, match_quality_rating, has_scores, computed_at)
    VALUES (@match_id, @session_id, @score_closeness_score, @rating_balance_score, @freshness_score, @match_quality_rating, @has_scores, @computed_at)
    ON CONFLICT(match_id) DO UPDATE SET
      score_closeness_score = @score_closeness_score,
      rating_balance_score = @rating_balance_score,
      freshness_score = @freshness_score,
      match_quality_rating = @match_quality_rating,
      has_scores = @has_scores,
      computed_at = @computed_at
  `).run({
    match_id: matchId,
    session_id: sessionId,
    score_closeness_score: Math.round(scoreClosenessScore),
    rating_balance_score: Math.round(ratingBalanceScore),
    freshness_score: freshnessScore,
    match_quality_rating: matchQualityRating,
    has_scores: hasScores ? 1 : 0,
    computed_at: now,
  });

  return {
    matchId,
    courtNumber: match.court_number,
    scoreClosenessScore: Math.round(scoreClosenessScore),
    ratingBalanceScore: Math.round(ratingBalanceScore),
    freshnessScore,
    matchQualityRating,
    hasScores,
  };
}

/**
 * Retrieves aggregate session quality metrics.
 * Returns session quality score (mean of all ratings), recent match ratings, and total count.
 *
 * Requirements: 8.1, 8.7
 */
export function getSessionQualityMetrics(sessionId: string): SessionQualityMetrics {
  const db = getDb();

  const rows = db.prepare(
    `SELECT mqs.match_quality_rating, mqs.match_id, m.court_number
     FROM match_quality_scores mqs
     JOIN matches m ON m.id = mqs.match_id
     WHERE mqs.session_id = ?
     ORDER BY mqs.computed_at DESC`
  ).all(sessionId) as Array<{ match_quality_rating: number; match_id: string; court_number: number }>;

  if (rows.length === 0) {
    return {
      sessionQualityScore: null,
      recentMatchRatings: [],
      totalMatchesRated: 0,
    };
  }

  // Session quality score = arithmetic mean of all Match_Quality_Rating values, rounded to integer
  const sum = rows.reduce((acc, row) => acc + row.match_quality_rating, 0);
  const sessionQualityScore = Math.round(sum / rows.length);

  // Up to 3 most recent match quality ratings (court number + score)
  const recentMatchRatings = rows.map((row) => ({
    courtNumber: row.court_number,
    rating: row.match_quality_rating,
  }));

  return {
    sessionQualityScore,
    recentMatchRatings,
    totalMatchesRated: rows.length,
  };
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Computes Rating_Balance_Score = max(0, 100 - ratingGap)
 * where ratingGap = |avg(team1 ratings) - avg(team2 ratings)|
 *
 * For doubles: team1 = playerIds[0,1], team2 = playerIds[2,3]
 * For singles: team1 = playerIds[0], team2 = playerIds[1]
 * Uses default rating (1000) for players without established ratings.
 */
function computeRatingBalance(playerIds: string[], sessionId: string): number {
  const db = getDb();

  // Get ratings for all players
  const ratings = playerIds.map((playerId) => {
    const row = db.prepare(
      'SELECT rating FROM player_ratings WHERE player_id = ? AND session_id = ?'
    ).get(playerId, sessionId) as { rating: number } | undefined;
    return row?.rating ?? DEFAULT_RATING;
  });

  // Determine teams based on player count
  const isSingles = playerIds.length === 2;
  let team1Avg: number;
  let team2Avg: number;

  if (isSingles) {
    team1Avg = ratings[0];
    team2Avg = ratings[1];
  } else {
    team1Avg = (ratings[0] + ratings[1]) / 2;
    team2Avg = (ratings[2] + ratings[3]) / 2;
  }

  const ratingGap = Math.abs(team1Avg - team2Avg);
  return Math.max(0, 100 - ratingGap);
}

/**
 * Computes Freshness_Score:
 * 100 if the exact 4-player team configuration has NOT occurred before in the session
 * 50 if the exact team configuration (same two pairs, regardless of team1/team2 labeling) has occurred before
 *
 * "Same two pairs regardless of team1/team2 labeling" means:
 * Given team A = {p0, p1} and team B = {p2, p3},
 * it matches if any prior match has the same two sets (in either order).
 */
function computeFreshness(playerIds: string[], currentMatchId: string, sessionId: string): number {
  const db = getDb();

  // Get all completed matches in this session (excluding current match)
  const previousMatches = db.prepare(
    `SELECT id, player_ids FROM matches
     WHERE session_id = ? AND status = 'completed' AND id != ?`
  ).all(sessionId, currentMatchId) as Array<{ id: string; player_ids: string }>;

  // Create a normalized representation of the current match's team configuration
  const currentConfig = normalizeTeamConfig(playerIds);

  for (const prevMatch of previousMatches) {
    const prevPlayerIds: string[] = JSON.parse(prevMatch.player_ids);
    const prevConfig = normalizeTeamConfig(prevPlayerIds);

    if (currentConfig === prevConfig) {
      return 50; // Repeated matchup
    }
  }

  return 100; // Fresh matchup
}

/**
 * Normalizes a team configuration for comparison.
 * For doubles: sorts players within each team, then sorts teams, producing a canonical string.
 * For singles: sorts the two players.
 *
 * This ensures that {A,B} vs {C,D} is treated the same as {C,D} vs {A,B}
 * and {B,A} vs {D,C} is treated the same as {A,B} vs {C,D}.
 */
function normalizeTeamConfig(playerIds: string[]): string {
  if (playerIds.length === 2) {
    // Singles: just sort the two players
    const sorted = [...playerIds].sort();
    return sorted.join('|');
  }

  // Doubles: team1 = [0,1], team2 = [2,3]
  const team1 = [playerIds[0], playerIds[1]].sort();
  const team2 = [playerIds[2], playerIds[3]].sort();

  // Sort teams so that {A,B} vs {C,D} == {C,D} vs {A,B}
  const teams = [team1.join(','), team2.join(',')].sort();
  return teams.join('|');
}
