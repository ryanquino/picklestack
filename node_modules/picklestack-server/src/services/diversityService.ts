import {
  getPlayersBySession,
  getPairingHistoryBySession,
  PairingHistoryRow,
} from '../repository';

// ============================================================
// Diversity Service
// ============================================================

/**
 * Computes the diversity percentage for a single player in a session.
 *
 * Formula: (Unique_Opponent_Count + Unique_Teammate_Count) / (2 × Total_Possible_Opponents) × 100
 * Rounded to the nearest integer.
 *
 * Edge cases:
 * - If Total_Possible_Opponents is 0 (single player), returns 0 and skips formula.
 * - A new player with no matches returns 0.
 */
export function computeDiversityPercentage(
  sessionId: string,
  playerId: string
): number {
  const players = getPlayersBySession(sessionId);
  const totalPossibleOpponents = players.length - 1;

  // Edge case: only one player in session
  if (totalPossibleOpponents <= 0) {
    return 0;
  }

  const pairingHistory = getPairingHistoryBySession(sessionId);
  const { uniqueOpponents, uniqueTeammates } = countUniquePairings(playerId, pairingHistory);

  const percentage = ((uniqueOpponents + uniqueTeammates) / (2 * totalPossibleOpponents)) * 100;
  return Math.round(percentage);
}

/**
 * Computes diversity percentages for all players in a session.
 * Returns a map of playerId → percentage (integer 0-100).
 */
export function computeSessionDiversity(
  sessionId: string
): Map<string, number> {
  const players = getPlayersBySession(sessionId);
  const totalPossibleOpponents = players.length - 1;
  const result = new Map<string, number>();

  // Edge case: zero or one player
  if (totalPossibleOpponents <= 0) {
    for (const player of players) {
      result.set(player.id, 0);
    }
    return result;
  }

  const pairingHistory = getPairingHistoryBySession(sessionId);

  for (const player of players) {
    const { uniqueOpponents, uniqueTeammates } = countUniquePairings(player.id, pairingHistory);
    const percentage = ((uniqueOpponents + uniqueTeammates) / (2 * totalPossibleOpponents)) * 100;
    result.set(player.id, Math.round(percentage));
  }

  return result;
}

/**
 * Calculates the diversity bonus for a candidate grouping of players.
 *
 * The bonus is the ratio of fresh opponent pairings among the selected players
 * to the maximum possible fresh pairings:
 * - 6 for a 4-player doubles grouping (C(4,2) = 6 possible opponent pairs)
 * - 1 for a 2-player singles grouping
 *
 * Returns a value between 0.0 and 1.0 inclusive.
 *
 * Edge cases:
 * - Single player or empty array returns 0.
 */
export function calculateDiversityBonus(
  playerIds: string[],
  sessionId: string
): number {
  if (playerIds.length <= 1) {
    return 0;
  }

  // Determine max possible fresh pairings based on group size
  // For 4 players: C(4,2) = 6 opponent pairs
  // For 2 players: 1 opponent pair
  const maxFreshPairings = playerIds.length === 2 ? 1 : 6;

  const pairingHistory = getPairingHistoryBySession(sessionId);

  // Count fresh opponent pairings (pairs that have never faced each other)
  let freshPairings = 0;

  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const hasOpponentHistory = hasPreviousOpponentPairing(
        playerIds[i],
        playerIds[j],
        pairingHistory
      );
      if (!hasOpponentHistory) {
        freshPairings++;
      }
    }
  }

  const bonus = freshPairings / maxFreshPairings;
  // Clamp to [0, 1] in case freshPairings exceeds maxFreshPairings (shouldn't normally happen)
  return Math.min(1.0, Math.max(0.0, bonus));
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Counts unique opponents and unique teammates for a player from pairing history.
 * A player can appear in both sets simultaneously (Req 1.7).
 *
 * The pairing_history table stores pairs as (player1_id, player2_id) where
 * player1_id < player2_id for consistent lookups. We need to check both positions.
 */
function countUniquePairings(
  playerId: string,
  pairingHistory: PairingHistoryRow[]
): { uniqueOpponents: number; uniqueTeammates: number } {
  let uniqueOpponents = 0;
  let uniqueTeammates = 0;

  for (const entry of pairingHistory) {
    // Check if this player is involved in this pairing
    if (entry.player1_id === playerId || entry.player2_id === playerId) {
      if (entry.times_as_opponents > 0) {
        uniqueOpponents++;
      }
      if (entry.times_as_teammates > 0) {
        uniqueTeammates++;
      }
    }
  }

  return { uniqueOpponents, uniqueTeammates };
}

/**
 * Checks if two players have previously faced each other as opponents.
 * Handles both orderings since pairing_history uses player1_id < player2_id.
 */
function hasPreviousOpponentPairing(
  player1: string,
  player2: string,
  pairingHistory: PairingHistoryRow[]
): boolean {
  // Normalize order: player1_id < player2_id in the table
  const [p1, p2] = player1 < player2 ? [player1, player2] : [player2, player1];

  for (const entry of pairingHistory) {
    if (entry.player1_id === p1 && entry.player2_id === p2) {
      return entry.times_as_opponents > 0;
    }
  }

  return false;
}
