import { LeaderboardEntry, AchievementKind } from '../types';
import { getPlayerStats } from './matchResultService';
import { getSessionAchievementsAll } from './achievementsService';

// ============================================================
// Leaderboard Generation
// ============================================================

/**
 * Generates a full leaderboard for a session.
 *
 * Sorting: Win_Rate descending → matches played descending → point differential descending.
 * Tied players share the same rank (dense ranking).
 * Includes all players (even those with 0 matches).
 * Formats win rate to one decimal place.
 * Highlights MVP, Iron Player, and Undefeated players.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.6, 12.5
 */
export function generateLeaderboard(sessionId: string): LeaderboardEntry[] {
  // Get base stats for all players in the session (includes 0-match players)
  const stats = getPlayerStats(sessionId);

  // Get all achievements for the session
  const achievements = getSessionAchievementsAll(sessionId);

  // Determine MVP: highest win rate among players with 3+ matches
  const mvpPlayerId = determineMvp(stats);

  // Sort: winRate desc → matchesPlayed desc → pointDifferential desc
  const sorted = [...stats].sort((a, b) => {
    // Primary: win rate descending
    if (b.winRate !== a.winRate) {
      return b.winRate - a.winRate;
    }
    // Secondary: matches played descending
    if (b.matchesPlayed !== a.matchesPlayed) {
      return b.matchesPlayed - a.matchesPlayed;
    }
    // Tertiary: point differential descending
    return b.pointDifferential - a.pointDifferential;
  });

  // Dense ranking: tied players share the same rank, next rank increments by 1
  let currentRank = 1;
  return sorted.map((playerStats, index) => {
    if (index > 0) {
      const prev = sorted[index - 1];
      const isTied =
        playerStats.winRate === prev.winRate &&
        playerStats.matchesPlayed === prev.matchesPlayed &&
        playerStats.pointDifferential === prev.pointDifferential;
      if (!isTied) {
        currentRank = currentRank + 1;
      }
    }

    const playerAchievements = achievements.filter(
      (a) => a.playerId === playerStats.playerId
    );

    return {
      ...playerStats,
      rank: currentRank,
      isMvp: playerStats.playerId === mvpPlayerId,
      achievements: playerAchievements,
    };
  });
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Determines the MVP for the session.
 * MVP is the player with the highest win rate among players with 3+ matches.
 * If no player has 3+ matches, returns null (no MVP).
 * If multiple players tie for highest win rate with 3+ matches,
 * the one with more matches played wins; further ties broken by point differential.
 * If still tied, the first player encountered wins (arbitrary among equals).
 */
function determineMvp(
  stats: { playerId: string; playerName: string; winRate: number; matchesPlayed: number; pointDifferential: number }[]
): string | null {
  const eligible = stats.filter((s) => s.matchesPlayed >= 3);
  if (eligible.length === 0) return null;

  // Sort eligible by winRate desc, then matchesPlayed desc, then pointDifferential desc
  const sorted = [...eligible].sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
    return b.pointDifferential - a.pointDifferential;
  });

  return sorted[0].playerId;
}

/** Public re-export for use by other modules */
export { determineMvp };
