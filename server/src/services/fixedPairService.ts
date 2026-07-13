import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../errors';
import {
  getSessionById,
  getPlayerById,
  getQueueEntryByPlayerId,
  getQueueBySession,
  getActiveMatchesBySession,
  getFixedPairByPlayerId as repoGetFixedPairByPlayerId,
  getFixedPairsBySession as repoGetFixedPairsBySession,
  createFixedPair as repoCreateFixedPair,
  deleteFixedPair as repoDeleteFixedPair,
  deleteFixedPairsBySession as repoDeleteFixedPairsBySession,
  deleteQueueEntry,
  createQueueEntry,
  updateQueueEntryPosition,
  getQueueEntryByPairId,
  getFixedPairById,
  FixedPairRow,
} from '../repository';

export interface FixedPair {
  id: string;
  sessionId: string;
  player1Id: string;
  player2Id: string;
  createdAt: string;
}

/**
 * Converts a FixedPairRow from the database into a FixedPair domain object.
 */
function toFixedPair(row: FixedPairRow): FixedPair {
  return {
    id: row.id,
    sessionId: row.session_id,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    createdAt: row.created_at,
  };
}

/**
 * Checks if a player is currently in an active match for the given session.
 */
function isPlayerInActiveMatch(sessionId: string, playerId: string): boolean {
  const activeMatches = getActiveMatchesBySession(sessionId);
  for (const match of activeMatches) {
    const playerIds: string[] = JSON.parse(match.player_ids);
    if (playerIds.includes(playerId)) {
      return true;
    }
  }
  return false;
}

/**
 * Creates a fixed pair from two queued players.
 *
 * Validates:
 * 1. player1Id !== player2Id (cannot pair with self)
 * 2. Session exists and is active (Req 1.6)
 * 3. Both players exist and are in the session (Req 5.2)
 * 4. Both players are in the queue, not in an active match (Req 1.5)
 * 5. Neither player is already part of a fixed pair (Req 1.4)
 *
 * Then:
 * 6. Removes both individual queue entries
 * 7. Creates the fixed_pairs record
 * 8. Inserts a single pair slot at min(position1, position2) with pair_id set
 * 9. Re-numbers all queue positions from 0
 *
 * @returns The created FixedPair
 */
export function createFixedPair(sessionId: string, player1Id: string, player2Id: string): FixedPair {
  // 1. Cannot pair a player with themselves
  if (player1Id === player2Id) {
    throw new ValidationError('Cannot pair a player with themselves', ['player1Id', 'player2Id']);
  }

  // 2. Validate session exists and is active
  const session = getSessionById(sessionId);
  if (!session) {
    throw new ValidationError('Session not found', ['sessionId']);
  }
  if (session.status === 'ended') {
    throw new ValidationError('Session has ended', ['sessionId']);
  }

  // 3. Validate both players exist and are in the session
  const player1 = getPlayerById(player1Id);
  if (!player1 || player1.session_id !== sessionId) {
    throw new ValidationError('Player not found in this session', ['player1Id']);
  }

  const player2 = getPlayerById(player2Id);
  if (!player2 || player2.session_id !== sessionId) {
    throw new ValidationError('Player not found in this session', ['player2Id']);
  }

  // 4. Validate both players are in the queue (not in active match)
  if (isPlayerInActiveMatch(sessionId, player1Id)) {
    throw new ValidationError('Player is currently in an active match', ['player1Id']);
  }
  if (isPlayerInActiveMatch(sessionId, player2Id)) {
    throw new ValidationError('Player is currently in an active match', ['player2Id']);
  }

  const queueEntry1 = getQueueEntryByPlayerId(player1Id);
  if (!queueEntry1) {
    throw new ValidationError('Player is not in the queue', ['player1Id']);
  }

  const queueEntry2 = getQueueEntryByPlayerId(player2Id);
  if (!queueEntry2) {
    throw new ValidationError('Player is not in the queue', ['player2Id']);
  }

  // 5. Validate neither player is already part of a fixed pair
  const existingPair1 = repoGetFixedPairByPlayerId(sessionId, player1Id);
  if (existingPair1) {
    throw new ValidationError('Player is already part of a fixed pair', ['player1Id']);
  }

  const existingPair2 = repoGetFixedPairByPlayerId(sessionId, player2Id);
  if (existingPair2) {
    throw new ValidationError('Player is already part of a fixed pair', ['player2Id']);
  }

  // 6. Determine the earlier position and the anchor player
  const minPosition = Math.min(queueEntry1.position, queueEntry2.position);
  const anchorPlayerId = queueEntry1.position <= queueEntry2.position ? player1Id : player2Id;

  // Preserve the earlier queued_at from the two players
  const earlierQueuedAt = (queueEntry1.queued_at && queueEntry2.queued_at)
    ? (queueEntry1.queued_at <= queueEntry2.queued_at ? queueEntry1.queued_at : queueEntry2.queued_at)
    : (queueEntry1.queued_at || queueEntry2.queued_at || '');

  // 7. Remove both individual queue entries
  deleteQueueEntry(player1Id);
  deleteQueueEntry(player2Id);

  // 8. Create the fixed_pairs record
  const now = new Date().toISOString();
  const pairId = uuidv4();
  const pairRow: FixedPairRow = {
    id: pairId,
    session_id: sessionId,
    player1_id: player1Id,
    player2_id: player2Id,
    created_at: now,
  };
  repoCreateFixedPair(pairRow);

  // 9. Insert a single pair slot at minPosition with pair_id set, preserving original queued_at
  createQueueEntry({
    player_id: anchorPlayerId,
    session_id: sessionId,
    position: minPosition,
    pair_id: pairId,
    queued_at: earlierQueuedAt,
  });

  // 10. Re-number all queue positions from 0 preserving relative order
  const remainingQueue = getQueueBySession(sessionId);
  remainingQueue.forEach((entry, index) => {
    if (entry.position !== index) {
      updateQueueEntryPosition(entry.player_id, index);
    }
  });

  return toFixedPair(pairRow);
}

/**
 * Dissolves a fixed pair, returning both players as individual queue entries.
 *
 * Validates:
 * 1. Pair exists
 * 2. Neither player is in an active match (Req 4.3)
 *
 * Then:
 * 3. Removes the pair slot from the queue
 * 4. Inserts two individual queue entries at consecutive positions starting at original pair slot position
 * 5. Re-numbers queue positions from 0
 * 6. Deletes the fixed_pairs record
 */
export function dissolveFixedPair(sessionId: string, pairId: string): void {
  // 1. Validate pair exists
  const pair = getFixedPairById(pairId);
  if (!pair) {
    throw new ValidationError('Fixed pair not found', ['pairId']);
  }

  // 2. Validate neither player is in an active match
  if (isPlayerInActiveMatch(sessionId, pair.player1_id)) {
    throw new ValidationError('Cannot dissolve pair while players are in an active match', ['pairId']);
  }
  if (isPlayerInActiveMatch(sessionId, pair.player2_id)) {
    throw new ValidationError('Cannot dissolve pair while players are in an active match', ['pairId']);
  }

  // 3. Find and remove the pair slot from the queue
  const pairSlot = getQueueEntryByPairId(pairId);
  if (!pairSlot) {
    // Pair exists but not in queue (e.g., both in match) — just delete the pair record
    repoDeleteFixedPair(pairId);
    return;
  }

  const originalPosition = pairSlot.position;
  deleteQueueEntry(pairSlot.player_id);

  // 4. Shift existing entries at originalPosition or higher up by 1 to make room
  const currentQueue = getQueueBySession(sessionId);
  // Shift from the end to avoid conflicts
  for (let i = currentQueue.length - 1; i >= 0; i--) {
    if (currentQueue[i].position >= originalPosition) {
      updateQueueEntryPosition(currentQueue[i].player_id, currentQueue[i].position + 1);
    }
  }

  // 5. Insert two individual queue entries at consecutive positions
  createQueueEntry({
    player_id: pair.player1_id,
    session_id: sessionId,
    position: originalPosition,
  });
  createQueueEntry({
    player_id: pair.player2_id,
    session_id: sessionId,
    position: originalPosition + 1,
  });

  // 6. Re-number queue positions from 0 preserving relative order
  const remainingQueue = getQueueBySession(sessionId);
  remainingQueue.forEach((entry, index) => {
    if (entry.position !== index) {
      updateQueueEntryPosition(entry.player_id, index);
    }
  });

  // 6. Delete the fixed_pairs record
  repoDeleteFixedPair(pairId);
}

/**
 * Dissolves all fixed pairs in a session (called on session end).
 */
export function dissolveAllPairs(sessionId: string): void {
  repoDeleteFixedPairsBySession(sessionId);
}

/**
 * Gets all fixed pairs for a session.
 */
export function getFixedPairsBySession(sessionId: string): FixedPair[] {
  const rows = repoGetFixedPairsBySession(sessionId);
  return rows.map(toFixedPair);
}

/**
 * Gets the fixed pair a player belongs to, if any.
 */
export function getFixedPairByPlayerId(sessionId: string, playerId: string): FixedPair | undefined {
  const row = repoGetFixedPairByPlayerId(sessionId, playerId);
  return row ? toFixedPair(row) : undefined;
}

/**
 * Calculates the combined rating for a fixed pair.
 * Combined rating = (player1Rating + player2Rating) / 2
 */
export function calculateCombinedRating(player1Rating: number, player2Rating: number): number {
  return (player1Rating + player2Rating) / 2;
}
