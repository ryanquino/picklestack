/**
 * On Deck queue logic — determines which players are next to be matched.
 *
 * This is a pure function with no database access. It operates on the queue
 * state already fetched and returns the set of player IDs that should be
 * marked as "On Deck".
 */

/**
 * Determines which players are "On Deck" based on queue state, game mode, and matching mode.
 *
 * Rules:
 * - Casual/Balanced/Competitive: first min(N, 8) players (entire candidate pool)
 * - Queue + Doubles: first min(N, 4) players
 * - Queue + Singles: first min(N, 2) players
 *
 * When the queue has fewer players than needed, all players are returned.
 * The queue is assumed to be sorted by position ascending.
 *
 * @param queue - Array of queue entries sorted by position ascending
 * @param gameMode - 'doubles' or 'singles'
 * @param matchingMode - 'casual', 'balanced', 'competitive', or 'queue'
 * @returns Array of player IDs that are "On Deck"
 */
export function getOnDeckPlayerIds(
  queue: { playerId: string; position: number }[],
  gameMode: 'doubles' | 'singles',
  matchingMode: 'casual' | 'balanced' | 'competitive' | 'queue'
): string[] {
  let count: number;

  if (matchingMode === 'queue') {
    count = gameMode === 'doubles' ? Math.min(queue.length, 4) : Math.min(queue.length, 2);
  } else if (matchingMode === 'casual') {
    count = Math.min(queue.length, 6);
  } else {
    count = Math.min(queue.length, 8);
  }

  return queue.slice(0, count).map((entry) => entry.playerId);
}
