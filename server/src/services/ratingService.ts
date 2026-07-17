import { StarRating, STAR_TO_RATING, ratingToStar } from '../types';
import {
  getPlayerRating as getPlayerRatingRow,
  getPlayerRatingsBySession,
  upsertPlayerRating,
  updatePlayerRatingValues,
  PlayerRatingRow,
} from '../repository';

/** Minimum allowed rating */
const MIN_RATING = 100;
/** Maximum allowed rating */
const MAX_RATING = 3000;
/** Default rating for players with no star rating specified */
const DEFAULT_RATING = 1000;
/** Base points for rating adjustment */
const BASE_POINTS = 16;

/**
 * Clamps a value between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculates the score margin multiplier for rating adjustment.
 * Formula: min(1 + scoreMargin / 20, 2.0)
 * scoreMargin = abs(team1Score - team2Score)
 *
 * This is a pure function — no side effects.
 */
export function calculateMarginMultiplier(scoreMargin: number): number {
  return Math.min(1 + scoreMargin / 20, 2.0);
}

/**
 * Calculates the rating adjustment for a match result.
 * This is a pure function — no side effects.
 *
 * Formula:
 *   scaleFactor = clamp(1.0 - (winnerAvg - loserAvg) / 400, 0.5, 1.5)
 *   marginMultiplier = min(1 + scoreMargin / 20, 2.0)  // only if scoreMargin provided
 *   adjustment = round(basePoints * scaleFactor * marginMultiplier)
 *
 * When a lower-rated team wins: scaleFactor > 1.0 → larger gain (underdog bonus)
 * When a higher-rated team wins: scaleFactor < 1.0 → smaller gain
 * Equal teams: scaleFactor = 1.0 → exactly basePoints exchanged
 * When scoreMargin is provided: larger margins increase the adjustment (up to 2x)
 */
export function calculateRatingAdjustment(
  winnerAvgRating: number,
  loserAvgRating: number,
  basePoints: number = BASE_POINTS,
  scoreMargin?: number
): { winnerGain: number; loserLoss: number } {
  const ratingDiff = (winnerAvgRating - loserAvgRating) / 400;
  const scaleFactor = clamp(1.0 - ratingDiff, 0.5, 1.5);
  const marginMultiplier = scoreMargin !== undefined ? calculateMarginMultiplier(scoreMargin) : 1.0;
  const adjustment = Math.round(basePoints * scaleFactor * marginMultiplier);

  return {
    winnerGain: adjustment,
    loserLoss: adjustment,
  };
}

/**
 * Applies a match result by updating ratings for all players involved.
 *
 * - Calculates the average rating for each team
 * - Computes the adjustment using calculateRatingAdjustment
 * - Updates each winner's rating (gain) and each loser's rating (loss)
 * - Clamps all ratings to [100, 3000]
 * - Updates win/loss counts and matches played
 * - Recalculates star ratings based on new numeric rating
 *
 * When scoreMargin is provided, the adjustment is scaled by the margin multiplier.
 */
export function applyMatchResult(
  sessionId: string,
  winnerIds: string[],
  loserIds: string[],
  scoreMargin?: number
): void {
  // Get current ratings for all players
  const winnerRatings = winnerIds.map((id) => getPlayerRatingValue(sessionId, id));
  const loserRatings = loserIds.map((id) => getPlayerRatingValue(sessionId, id));

  // Calculate team averages
  const winnerAvg = winnerRatings.reduce((sum, r) => sum + r, 0) / winnerRatings.length;
  const loserAvg = loserRatings.reduce((sum, r) => sum + r, 0) / loserRatings.length;

  // Calculate adjustment (with optional score margin multiplier)
  const { winnerGain, loserLoss } = calculateRatingAdjustment(winnerAvg, loserAvg, BASE_POINTS, scoreMargin);

  // Update winners
  for (const playerId of winnerIds) {
    const current = getPlayerRatingRowOrDefault(sessionId, playerId);
    const newRating = clamp(current.rating + winnerGain, MIN_RATING, MAX_RATING);
    const newWins = current.wins + 1;
    const newMatchesPlayed = current.matches_played + 1;
    const newStarRating = ratingToStar(newRating);

    updatePlayerRatingValues(playerId, sessionId, {
      rating: newRating,
      matches_played: newMatchesPlayed,
      wins: newWins,
      losses: current.losses,
      star_rating: newStarRating,
    });
  }

  // Update losers
  for (const playerId of loserIds) {
    const current = getPlayerRatingRowOrDefault(sessionId, playerId);
    const newRating = clamp(current.rating - loserLoss, MIN_RATING, MAX_RATING);
    const newLosses = current.losses + 1;
    const newMatchesPlayed = current.matches_played + 1;
    const newStarRating = ratingToStar(newRating);

    updatePlayerRatingValues(playerId, sessionId, {
      rating: newRating,
      matches_played: newMatchesPlayed,
      wins: current.wins,
      losses: newLosses,
      star_rating: newStarRating,
    });
  }
}

/**
 * Gets a player's current rating in a session.
 * Returns the default rating (1000) if the player has no rating record.
 */
export function getPlayerRating(sessionId: string, playerId: string): number {
  const row = getPlayerRatingRow(playerId, sessionId);
  return row ? row.rating : DEFAULT_RATING;
}

/**
 * Gets all player ratings for a session.
 * Returns a Map of playerId → rating value.
 */
export function getSessionRatings(sessionId: string): Map<string, number> {
  const rows = getPlayerRatingsBySession(sessionId);
  const ratings = new Map<string, number>();
  for (const row of rows) {
    ratings.set(row.player_id, row.rating);
  }
  return ratings;
}

/**
 * Initializes a player's rating in a session based on their self-assessed star rating.
 *
 * Star-to-rating mapping:
 *   1 → 400, 2 → 700, 3 → 1000, 4 → 1300, 5 → 1600
 *
 * If no star rating is provided, defaults to 3 stars (1000).
 */
export function initializePlayerRating(
  sessionId: string,
  playerId: string,
  starRating?: StarRating
): void {
  const star: StarRating = starRating ?? 3;
  const initialRating = STAR_TO_RATING[star];

  upsertPlayerRating({
    player_id: playerId,
    session_id: sessionId,
    rating: initialRating,
    matches_played: 0,
    wins: 0,
    losses: 0,
    star_rating: star,
    last_match_result: null,
  });
}

/**
 * Calculates the win rate for a player given their wins and losses.
 * This is a pure function — no side effects.
 *
 * Formula: W / (W + L) × 100, rounded to one decimal place.
 * Returns 0.0 if the player has no matches (W + L = 0).
 */
export function calculateWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0.0;
  return Math.round((wins / total) * 1000) / 10;
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Gets the numeric rating value for a player, defaulting to 1000 if no record exists.
 */
function getPlayerRatingValue(sessionId: string, playerId: string): number {
  const row = getPlayerRatingRow(playerId, sessionId);
  return row ? row.rating : DEFAULT_RATING;
}

/**
 * Gets the full player rating row, or returns a default row if none exists.
 * Ensures the player has a rating record before updating.
 */
function getPlayerRatingRowOrDefault(sessionId: string, playerId: string): PlayerRatingRow {
  const row = getPlayerRatingRow(playerId, sessionId);
  if (row) return row;

  // Initialize with default rating if no record exists
  const defaultRow: PlayerRatingRow = {
    player_id: playerId,
    session_id: sessionId,
    rating: DEFAULT_RATING,
    matches_played: 0,
    wins: 0,
    losses: 0,
    star_rating: 3,
    last_match_result: null,
  };
  upsertPlayerRating(defaultRow);
  return defaultRow;
}
