import { v4 as uuidv4 } from 'uuid';
import { Achievement, AchievementKind } from '../types';
import {
  createAchievement,
  getAchievementsByPlayer,
  getAchievementsBySession,
  deleteAchievement,
  getPlayerRatingsBySession,
  getMatchResultsBySession,
  getPairingHistoryBySession,
  getMatchResultByMatchId,
  PlayerAchievementRow,
  MatchResultRow,
  PairingHistoryRow,
} from '../repository';

// ============================================================
// Achievement Evaluation
// ============================================================

/**
 * Evaluates all achievement criteria after a match result is recorded.
 * Checks each achievement type and awards/transfers as appropriate.
 */
export function evaluateAchievements(sessionId: string, matchId: string): void {
  const matchResult = getMatchResultByMatchId(matchId);
  if (!matchResult) return;

  const allResults = getMatchResultsBySession(sessionId);
  const pairingHistory = getPairingHistoryBySession(sessionId);
  const playerRatings = getPlayerRatingsBySession(sessionId);

  // Get all player IDs involved in this match
  const winnerIds: string[] = JSON.parse(matchResult.winner_player_ids);
  const loserIds: string[] = JSON.parse(matchResult.loser_player_ids);
  const matchPlayerIds = [...winnerIds, ...loserIds];

  // Evaluate each achievement for relevant players
  evaluateIronPlayer(sessionId, playerRatings);
  evaluateUndefeated(sessionId, matchPlayerIds, playerRatings, allResults);
  evaluateHotStreak(sessionId, matchPlayerIds, allResults);
  evaluateComebackKing(sessionId, winnerIds, allResults);
  evaluateSocialButterfly(sessionId, matchPlayerIds, pairingHistory);
}

// ============================================================
// Iron Player — most matches played (min 5), can transfer
// ============================================================

/**
 * Iron Player is awarded to the player with the most matches played (minimum 5).
 * This achievement can transfer: if another player surpasses the current holder's
 * match count, the achievement is removed from the old holder and awarded to the new one.
 */
function evaluateIronPlayer(
  sessionId: string,
  playerRatings: { player_id: string; matches_played: number }[]
): void {
  const MIN_MATCHES = 5;

  // Find the player with the most matches played
  let maxMatches = 0;
  let topPlayerId: string | null = null;

  for (const rating of playerRatings) {
    if (rating.matches_played > maxMatches) {
      maxMatches = rating.matches_played;
      topPlayerId = rating.player_id;
    }
  }

  // Must have at least 5 matches
  if (maxMatches < MIN_MATCHES || !topPlayerId) return;

  // Check current holder
  const currentAchievements = getAchievementsBySession(sessionId);
  const currentHolder = currentAchievements.find(
    (a) => a.kind === AchievementKind.IronPlayer
  );

  if (currentHolder) {
    if (currentHolder.player_id === topPlayerId) {
      // Same holder, no change needed
      return;
    }
    // Transfer: remove from old holder, award to new
    deleteAchievement(sessionId, currentHolder.player_id, AchievementKind.IronPlayer);
  }

  // Award to new top player
  createAchievement({
    id: uuidv4(),
    player_id: topPlayerId,
    session_id: sessionId,
    kind: AchievementKind.IronPlayer,
    awarded_at: new Date().toISOString(),
  });
}

// ============================================================
// Undefeated — all wins with 3+ matches
// ============================================================

/**
 * Undefeated is awarded to any player who has won all of their matches
 * and played at least 3 matches.
 */
function evaluateUndefeated(
  sessionId: string,
  matchPlayerIds: string[],
  playerRatings: { player_id: string; wins: number; losses: number; matches_played: number }[],
  allResults: MatchResultRow[]
): void {
  const MIN_MATCHES = 3;

  for (const playerId of matchPlayerIds) {
    const rating = playerRatings.find((r) => r.player_id === playerId);
    if (!rating) continue;

    // Must have at least 3 matches and zero losses
    if (rating.matches_played >= MIN_MATCHES && rating.losses === 0 && rating.wins > 0) {
      awardAchievement(sessionId, playerId, AchievementKind.Undefeated);
    }
  }
}

// ============================================================
// Hot Streak — 5+ consecutive wins
// ============================================================

/**
 * Hot Streak is awarded to any player who achieves 5 or more consecutive wins.
 * Looks at match results in chronological order for the player.
 */
function evaluateHotStreak(
  sessionId: string,
  matchPlayerIds: string[],
  allResults: MatchResultRow[]
): void {
  const STREAK_THRESHOLD = 5;

  for (const playerId of matchPlayerIds) {
    const streak = calculateCurrentWinStreak(playerId, allResults);
    if (streak >= STREAK_THRESHOLD) {
      awardAchievement(sessionId, playerId, AchievementKind.HotStreak);
    }
  }
}

// ============================================================
// Comeback King — win after 2+ consecutive losses
// ============================================================

/**
 * Comeback King is awarded to any player who wins a match after losing
 * 2 or more consecutive matches.
 */
function evaluateComebackKing(
  sessionId: string,
  winnerIds: string[],
  allResults: MatchResultRow[]
): void {
  for (const playerId of winnerIds) {
    // Get the player's results in chronological order
    const playerResults = getPlayerResultsChronological(playerId, allResults);

    // Need at least 3 results (2 losses + 1 win)
    if (playerResults.length < 3) continue;

    // Check if the most recent result is a win preceded by 2+ losses
    // The most recent result is the last in chronological order
    const lastIndex = playerResults.length - 1;
    if (playerResults[lastIndex] !== 'win') continue;

    // Count consecutive losses before this win
    let lossCount = 0;
    for (let i = lastIndex - 1; i >= 0; i--) {
      if (playerResults[i] === 'loss') {
        lossCount++;
      } else {
        break;
      }
    }

    if (lossCount >= 2) {
      awardAchievement(sessionId, playerId, AchievementKind.ComebackKing);
    }
  }
}

// ============================================================
// Social Butterfly — teammates with 6+ different players
// ============================================================

/**
 * Social Butterfly is awarded to any player who has been teammates
 * with at least 6 different players during the session.
 */
function evaluateSocialButterfly(
  sessionId: string,
  matchPlayerIds: string[],
  pairingHistory: PairingHistoryRow[]
): void {
  const TEAMMATE_THRESHOLD = 6;

  for (const playerId of matchPlayerIds) {
    const distinctTeammates = countDistinctTeammates(playerId, pairingHistory);
    if (distinctTeammates >= TEAMMATE_THRESHOLD) {
      awardAchievement(sessionId, playerId, AchievementKind.SocialButterfly);
    }
  }
}

// ============================================================
// Public Query Functions
// ============================================================

/**
 * Returns all achievements earned by a specific player in a session.
 */
export function getPlayerAchievements(sessionId: string, playerId: string): Achievement[] {
  const rows = getAchievementsByPlayer(sessionId, playerId);
  return rows.map(rowToAchievement);
}

/**
 * Returns all achievements for a session.
 */
export function getSessionAchievementsAll(sessionId: string): Achievement[] {
  const rows = getAchievementsBySession(sessionId);
  return rows.map(rowToAchievement);
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Awards an achievement to a player if they don't already have it.
 * Uses ON CONFLICT DO NOTHING to handle duplicates gracefully.
 */
function awardAchievement(sessionId: string, playerId: string, kind: AchievementKind): void {
  createAchievement({
    id: uuidv4(),
    player_id: playerId,
    session_id: sessionId,
    kind,
    awarded_at: new Date().toISOString(),
  });
}

/**
 * Calculates the current win streak for a player from match results.
 * Results are processed in chronological order (by recorded_at).
 * Counts consecutive wins from the most recent match backwards.
 */
function calculateCurrentWinStreak(playerId: string, allResults: MatchResultRow[]): number {
  const playerResults = getPlayerResultsChronological(playerId, allResults);

  let streak = 0;
  for (let i = playerResults.length - 1; i >= 0; i--) {
    if (playerResults[i] === 'win') {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Gets a player's results in chronological order (oldest first).
 * Returns an array of 'win' or 'loss' strings.
 */
function getPlayerResultsChronological(
  playerId: string,
  allResults: MatchResultRow[]
): ('win' | 'loss')[] {
  // allResults is already ordered by recorded_at (from repository)
  const results: ('win' | 'loss')[] = [];

  for (const result of allResults) {
    const winners: string[] = JSON.parse(result.winner_player_ids);
    const losers: string[] = JSON.parse(result.loser_player_ids);

    if (winners.includes(playerId)) {
      results.push('win');
    } else if (losers.includes(playerId)) {
      results.push('loss');
    }
  }

  return results;
}

/**
 * Counts the number of distinct teammates a player has had.
 * A teammate is any player who appears in pairing history with times_as_teammates > 0.
 */
function countDistinctTeammates(playerId: string, pairingHistory: PairingHistoryRow[]): number {
  const teammates = new Set<string>();

  for (const entry of pairingHistory) {
    if (entry.times_as_teammates > 0) {
      if (entry.player1_id === playerId) {
        teammates.add(entry.player2_id);
      } else if (entry.player2_id === playerId) {
        teammates.add(entry.player1_id);
      }
    }
  }

  return teammates.size;
}

/**
 * Converts a database row to an Achievement domain object.
 */
function rowToAchievement(row: PlayerAchievementRow): Achievement {
  return {
    playerId: row.player_id,
    sessionId: row.session_id,
    kind: row.kind as AchievementKind,
    awardedAt: new Date(row.awarded_at),
  };
}
