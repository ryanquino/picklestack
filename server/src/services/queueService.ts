import { v4 as uuidv4 } from 'uuid';
import { Player } from '../types';
import { ValidationError } from '../errors';
import {
  createPlayer,
  findPlayerByNameCaseInsensitive,
  createQueueEntry,
  getQueueBySession,
  getSessionById,
  getQueueEntryByPlayerId,
  updateQueueEntryPosition,
  deleteQueueEntry,
  getPlayerById,
  getActiveMatchesBySession,
  getFixedPairById,
  getFixedPairByPlayerId,
  getQueueEntryByPairId,
  deleteFixedPair,
  PlayerRow,
} from '../repository';

export { ValidationError } from '../errors';

/**
 * Validates a player name meets requirements:
 * - Must be at most 30 characters in total length
 * - Must contain at least 1 non-whitespace character
 */
function validatePlayerName(name: string): void {
  if (name.length === 0 || name.length > 30) {
    throw new ValidationError(
      'Player name must be 1-30 characters with at least one non-whitespace character',
      ['playerName']
    );
  }

  if (name.trim().length === 0) {
    throw new ValidationError(
      'Player name must be 1-30 characters with at least one non-whitespace character',
      ['playerName']
    );
  }
}

/**
 * Converts a PlayerRow from the database into a Player domain object.
 */
function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    checkedInAt: new Date(row.checked_in_at),
  };
}

/**
 * Adds a player to a session's queue.
 *
 * Validates:
 * 1. Session exists and is active
 * 2. Player name is 1-30 chars with at least 1 non-whitespace character
 * 3. No duplicate name (case-insensitive) in the session
 *
 * Then creates the player record and appends them to the end of the queue.
 *
 * @returns The created Player
 */
export function addPlayer(sessionId: string, playerName: string): Player {
  // 1. Validate session exists and is active
  const session = getSessionById(sessionId);
  if (!session) {
    throw new ValidationError('Session not found', ['sessionId']);
  }
  if (session.status === 'ended') {
    throw new ValidationError('Session has ended, no new check-ins accepted', ['sessionId']);
  }

  // 2. Validate player name
  validatePlayerName(playerName);

  // 3. Check for case-insensitive duplicate names
  const existing = findPlayerByNameCaseInsensitive(sessionId, playerName);
  if (existing) {
    throw new ValidationError(
      'A player with this name already exists in the session',
      ['playerName']
    );
  }

  // 4. Create the player record
  const now = new Date().toISOString();
  const playerRow = createPlayer({
    id: uuidv4(),
    session_id: sessionId,
    name: playerName,
    checked_in_at: now,
  });

  // 5. Get current queue length to determine position
  const currentQueue = getQueueBySession(sessionId);
  const position = currentQueue.length;

  // 6. Create queue entry at that position
  createQueueEntry({
    player_id: playerRow.id,
    session_id: sessionId,
    position,
  });

  // 7. Return the created player
  return toPlayer(playerRow);
}

/**
 * Adds a player to a session WITHOUT adding them to the queue (bench player).
 * Same validation as addPlayer but skips queue entry creation.
 */
export function addPlayerToSession(sessionId: string, playerName: string): Player {
  const session = getSessionById(sessionId);
  if (!session) {
    throw new ValidationError('Session not found', ['sessionId']);
  }
  if (session.status === 'ended') {
    throw new ValidationError('Session has ended, no new check-ins accepted', ['sessionId']);
  }

  validatePlayerName(playerName);

  const existing = findPlayerByNameCaseInsensitive(sessionId, playerName);
  if (existing) {
    throw new ValidationError('A player with this name already exists in the session', ['playerName']);
  }

  const now = new Date().toISOString();
  const playerRow = createPlayer({
    id: uuidv4(),
    session_id: sessionId,
    name: playerName,
    checked_in_at: now,
  });

  return toPlayer(playerRow);
}

/**
 * Moves an existing bench player (not in queue) into the queue at the end.
 * If the player is part of a fixed pair and their partner is also not in the queue,
 * both are added as a single pair slot.
 */
export function addPlayerToQueue(sessionId: string, playerId: string): void {
  const session = getSessionById(sessionId);
  if (!session) {
    throw new ValidationError('Session not found', ['sessionId']);
  }
  if (session.status === 'ended') {
    throw new ValidationError('Session has ended', ['sessionId']);
  }

  const player = getPlayerById(playerId);
  if (!player || player.session_id !== sessionId) {
    throw new ValidationError('Player not found in this session', ['playerId']);
  }

  // Check if already in queue
  const existingEntry = getQueueEntryByPlayerId(playerId);
  if (existingEntry) {
    throw new ValidationError('Player is already in the queue', ['playerId']);
  }

  const currentQueue = getQueueBySession(sessionId);
  const position = currentQueue.length;

  // Check if player is part of a fixed pair
  const fixedPair = getFixedPairByPlayerId(sessionId, playerId);
  if (fixedPair) {
    // Check if pair is already in queue (either player's entry with pair_id)
    const anchorId = fixedPair.player1_id;
    const anchorInQueue = getQueueEntryByPlayerId(anchorId);
    const partnerId = fixedPair.player1_id === playerId ? fixedPair.player2_id : fixedPair.player1_id;
    const partnerInQueue = getQueueEntryByPlayerId(partnerId);

    if (anchorInQueue || partnerInQueue) {
      // Pair is already represented in queue — skip
      return;
    }

    // Add as a pair slot using player1_id as anchor
    createQueueEntry({
      player_id: fixedPair.player1_id,
      session_id: sessionId,
      position,
      pair_id: fixedPair.id,
    });
  } else {
    createQueueEntry({
      player_id: playerId,
      session_id: sessionId,
      position,
    });
  }
}

/** Return type for getQueue, includes player name for display */
export interface QueueEntryWithName {
  playerId: string;
  sessionId: string;
  position: number;
  playerName: string;
  isPairSlot: boolean;
  pairId: string | null;
  partnerPlayerId: string | null;
  partnerPlayerName: string | null;
  queuedAt: string;
}

/**
 * Returns the queue for a session, ordered by position, with player names.
 * For pair slots (entries with a non-null pair_id), includes partner player info.
 */
export function getQueue(sessionId: string): QueueEntryWithName[] {
  const queue = getQueueBySession(sessionId);
  return queue.map((entry) => {
    const player = getPlayerById(entry.player_id);
    const playerName = player ? player.name : '';

    // If this entry has a pair_id, look up the pair to find the partner
    if (entry.pair_id) {
      const pair = getFixedPairById(entry.pair_id);
      if (pair) {
        const partnerPlayerId =
          pair.player1_id === entry.player_id ? pair.player2_id : pair.player1_id;
        const partnerPlayer = getPlayerById(partnerPlayerId);
        return {
          playerId: entry.player_id,
          sessionId: entry.session_id,
          position: entry.position,
          playerName,
          isPairSlot: true,
          pairId: entry.pair_id,
          partnerPlayerId,
          partnerPlayerName: partnerPlayer ? partnerPlayer.name : '',
          queuedAt: entry.queued_at || '',
        };
      }
    }

    // Individual (non-pair) entry
    return {
      playerId: entry.player_id,
      sessionId: entry.session_id,
      position: entry.position,
      playerName,
      isPairSlot: false,
      pairId: null,
      partnerPlayerId: null,
      partnerPlayerName: null,
      queuedAt: entry.queued_at || '',
    };
  });
}

/**
 * Moves a player up or down in the queue by swapping with the adjacent player.
 * No-op if the player is already at the boundary (first for 'up', last for 'down').
 *
 * @returns The updated queue
 */
export function movePlayer(
  sessionId: string,
  playerId: string,
  direction: 'up' | 'down'
): QueueEntryWithName[] {
  const queue = getQueueBySession(sessionId);

  // Find the player's index in the queue
  const playerIndex = queue.findIndex((entry) => entry.player_id === playerId);
  if (playerIndex === -1) {
    return getQueue(sessionId);
  }

  const currentPosition = queue[playerIndex].position;

  if (direction === 'up' && currentPosition === 0) {
    // Already at top, no-op
    return getQueue(sessionId);
  }

  if (direction === 'down' && currentPosition === queue.length - 1) {
    // Already at bottom, no-op
    return getQueue(sessionId);
  }

  // Find the adjacent player to swap with
  const swapIndex = direction === 'up' ? playerIndex - 1 : playerIndex + 1;
  const swapEntry = queue[swapIndex];

  // Swap positions
  updateQueueEntryPosition(playerId, swapEntry.position);
  updateQueueEntryPosition(swapEntry.player_id, currentPosition);

  return getQueue(sessionId);
}

/**
 * Removes a player from the queue (sends them to bench).
 *
 * - If the player is part of a Fixed_Pair, dissolves the pair and places the
 *   remaining partner as an individual queue entry at the original Pair_Slot position
 * - If the player is in the queue, removes their queue entry
 * - Does NOT delete the player record — they remain in the session (on bench)
 * - Their stats, ratings, and match history are preserved
 * - Re-numbers remaining queue positions from 0 preserving relative order
 */
export function removePlayer(sessionId: string, playerId: string): void {
  // Check if the player is part of a fixed pair
  const fixedPair = getFixedPairByPlayerId(sessionId, playerId);

  if (fixedPair) {
    // Determine the remaining partner
    const partnerPlayerId =
      fixedPair.player1_id === playerId ? fixedPair.player2_id : fixedPair.player1_id;

    // Find the pair slot in the queue and note its position
    const pairSlot = getQueueEntryByPairId(fixedPair.id);

    if (pairSlot) {
      const originalPosition = pairSlot.position;

      // Remove the pair slot from the queue
      deleteQueueEntry(pairSlot.player_id);

      // Insert the remaining partner as an individual queue entry at the original pair slot position
      createQueueEntry({
        player_id: partnerPlayerId,
        session_id: sessionId,
        position: originalPosition,
      });
    }

    // Delete the fixed_pairs record
    deleteFixedPair(fixedPair.id);
  } else {
    // Not part of a pair — remove queue entry if present
    const queueEntry = getQueueEntryByPlayerId(playerId);
    if (queueEntry) {
      deleteQueueEntry(playerId);
    }
  }

  // Re-number remaining queue positions from 0
  const remainingQueue = getQueueBySession(sessionId);
  remainingQueue.forEach((entry, index) => {
    if (entry.position !== index) {
      updateQueueEntryPosition(entry.player_id, index);
    }
  });
}
