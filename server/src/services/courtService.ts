import { v4 as uuidv4 } from 'uuid';
import { Match, Court } from '../types';
import { ValidationError, NotFoundError } from '../errors';
import {
  getSessionById,
  getActiveMatchByCourt,
  getQueueBySession,
  createMatch,
  createQueueEntry,
  deleteQueueEntry,
  updateQueueEntryPosition,
  updateMatch,
  updateSession,
  getPlayerById,
  getPlayersBySession,
  getPairingHistoryBySession,
  getMatchResultsBySession,
  getFixedPairById,
  getFixedPairByPlayerId,
  getPlayerRatingsBySession,
  MatchRow,
  QueueEntryRow,
} from '../repository';
import { getSessionRatings } from './ratingService';
import { selectPairing, selectFifoPairing, PairingInput, PairingCandidate } from './pairingService';
import { calculateCombinedRating } from './fixedPairService';
import { recordMatchResult } from './matchResultService';
import { evaluateAchievements } from './achievementsService';
import { updateMatchPlayers } from '../repository';

type GameMode = 'doubles' | 'singles';

/**
 * Converts a MatchRow from the database into a Match domain object.
 */
function toMatch(row: MatchRow): Match {
  return {
    id: row.id,
    sessionId: row.session_id,
    courtNumber: row.court_number,
    playerIds: JSON.parse(row.player_ids),
    status: row.status as 'active' | 'completed',
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}

/**
 * Starts a match on the specified court by assigning players from the queue.
 *
 * Validates:
 * 1. Session exists and is active
 * 2. Court number is between 1 and session.court_count
 * 3. No active match exists on that court
 * 4. Queue has enough players (2 for singles, 4 for doubles)
 *
 * Then:
 * 5. Checks session's game_mode and pairing_mode:
 *    - For doubles + smart: builds PairingInput, calls selectPairing (4 players)
 *    - For doubles + queue: calls selectFifoPairing (4 players, strict FIFO)
 *    - For singles + smart: picks 2 players from candidate pool with minimum skill gap
 *    - For singles + queue: picks first 2 from queue (strict FIFO)
 * 6. Creates a match record with those player IDs, status 'active'
 * 7. Removes those players' queue entries
 * 8. Re-numbers remaining queue positions from 0
 * 9. Updates session's updated_at timestamp
 * 10. Returns the created Match domain object
 *
 * @throws ValidationError if any validation fails
 */
export function startMatch(sessionId: string, courtNumber: number): Match {
  // 1. Validate session exists and is active
  const session = getSessionById(sessionId);
  if (!session) {
    throw new ValidationError('Session not found', ['sessionId']);
  }
  if (session.status === 'ended') {
    throw new ValidationError('Session has ended', ['sessionId']);
  }

  // 2. Validate court number is within range
  if (courtNumber < 1 || courtNumber > session.court_count) {
    throw new ValidationError(
      `Court number must be between 1 and ${session.court_count}`,
      ['courtNumber']
    );
  }

  // 3. Check no active match exists on that court
  const activeMatch = getActiveMatchByCourt(sessionId, courtNumber);
  if (activeMatch) {
    throw new ValidationError(
      'Court is already occupied with an active match',
      ['courtNumber']
    );
  }

  // Determine game mode and required player count
  const gameMode = (session.game_mode || 'doubles') as GameMode;

  // 4. Check queue has enough team slots
  const queue = getQueueBySession(sessionId);

  if (gameMode === 'singles') {
    // Singles: need at least 2 individual players
    if (queue.length < 2) {
      throw new ValidationError(
        `Not enough players in queue to start a match (minimum 2 required)`,
        ['queue']
      );
    }
  } else {
    // Doubles: need at least 2 team slots (4 total players across all slots)
    // A Fixed_Pair counts as one team slot (2 players), an individual counts as one team slot (1 player)
    let totalPlayers = 0;
    let teamSlots = 0;
    for (const entry of queue) {
      teamSlots++;
      if (entry.pair_id) {
        totalPlayers += 2; // pair contributes 2 players
      } else {
        totalPlayers += 1; // individual contributes 1 player
      }
    }
    if (teamSlots < 2 || totalPlayers < 4) {
      throw new ValidationError(
        `Not enough players in queue to start a match (minimum 4 required)`,
        ['queue']
      );
    }
  }

  // 5. Select players based on game mode and pairing mode
  let playerIds: string[];
  let candidatePool: PairingCandidate[] | undefined;

  if (gameMode === 'singles') {
    playerIds = selectSinglesPlayers(sessionId, queue, session.pairing_mode);
  } else {
    // Doubles mode
    if (session.pairing_mode === 'smart') {
      const pairingInput = buildPairingInput(sessionId, queue);
      candidatePool = pairingInput.candidatePool;
      const result = selectPairing(pairingInput);
      // Expand pair candidates into their constituent player IDs
      const team1Expanded = expandTeamPlayerIds(result.team1, candidatePool);
      const team2Expanded = expandTeamPlayerIds(result.team2, candidatePool);
      playerIds = [...team1Expanded, ...team2Expanded];
    } else {
      candidatePool = buildCandidatePool(sessionId, queue, gameMode);
      const result = selectFifoPairing(candidatePool);
      // Expand pair candidates into their constituent player IDs
      const team1Expanded = expandTeamPlayerIds(result.team1, candidatePool);
      const team2Expanded = expandTeamPlayerIds(result.team2, candidatePool);
      playerIds = [...team1Expanded, ...team2Expanded];
    }
  }

  // 6. Create a match record
  const now = new Date().toISOString();
  const matchRow: MatchRow = {
    id: uuidv4(),
    session_id: sessionId,
    court_number: courtNumber,
    player_ids: JSON.stringify(playerIds),
    status: 'active',
    started_at: now,
    completed_at: null,
  };
  createMatch(matchRow);

  // 7. Remove selected players' queue entries (by anchor player_id for pair slots)
  const selectedCandidateIds = getSelectedCandidateIds(playerIds, candidatePool);
  for (const entry of queue) {
    if (selectedCandidateIds.has(entry.player_id)) {
      deleteQueueEntry(entry.player_id);
    }
  }

  // 8. Re-number remaining queue positions from 0
  const remainingQueue = getQueueBySession(sessionId);
  remainingQueue.forEach((entry, index) => {
    if (entry.position !== index) {
      updateQueueEntryPosition(entry.player_id, index);
    }
  });

  // 9. Update session's updated_at timestamp
  updateSession(sessionId, { updated_at: now });

  // 10. Return the created Match domain object
  return toMatch(matchRow);
}

/**
 * Replace a player in an active match on a court with another player.
 * Validates session, active match, and that the old player is in the match and
 * the new player belongs to the same session. If the new player is currently
 * in the queue, their queue entry will be removed.
 */
export function replacePlayerInMatch(sessionId: string, courtNumber: number, oldPlayerId: string, newPlayerId: string): Match {
  const session = getSessionById(sessionId);
  if (!session) {
    throw new ValidationError('Session not found', ['sessionId']);
  }

  const matchRow = getActiveMatchByCourt(sessionId, courtNumber);
  if (!matchRow) {
    throw new ValidationError('No active match on the specified court', ['courtNumber']);
  }

  const currentPlayerIds: string[] = JSON.parse(matchRow.player_ids);

  // Ensure old player is present
  const oldIndex = currentPlayerIds.indexOf(oldPlayerId);
  if (oldIndex === -1) {
    throw new ValidationError('Player to replace is not part of the active match', ['oldPlayerId']);
  }

  // Ensure new player exists in same session
  const newPlayer = getPlayerById(newPlayerId);
  if (!newPlayer || newPlayer.session_id !== sessionId) {
    throw new ValidationError('Replacement player not found in this session', ['newPlayerId']);
  }

  // Prevent duplicate players in match
  if (currentPlayerIds.includes(newPlayerId)) {
    throw new ValidationError('Replacement player is already part of the match', ['newPlayerId']);
  }

  // Replace the player id
  currentPlayerIds[oldIndex] = newPlayerId;

  // Persist the updated player list
  updateMatchPlayers(matchRow.id, currentPlayerIds);

  // Remove the replacement player from the queue if present
  const replacementEntry = getQueueBySession(sessionId).find((q) => q.player_id === newPlayerId);
  if (replacementEntry) {
    deleteQueueEntry(newPlayerId);
  }

  // Put the replaced player at the bottom of the queue.
  // This preserves the player's existence in the session and moves them into the queue.
  const oldQueueEntry = getQueueBySession(sessionId).find((q) => q.player_id === oldPlayerId);
  if (oldQueueEntry) {
    deleteQueueEntry(oldPlayerId);
  }

  const updatedQueue = getQueueBySession(sessionId);
  createQueueEntry({
    player_id: oldPlayerId,
    session_id: sessionId,
    position: updatedQueue.length,
    pair_id: null,
  });

  // Re-index queue positions to keep them sequential
  const finalQueue = getQueueBySession(sessionId);
  finalQueue.forEach((entry, index) => {
    if (entry.position !== index) {
      updateQueueEntryPosition(entry.player_id, index);
    }
  });

  // Update session timestamp
  updateSession(sessionId, { updated_at: new Date().toISOString() });

  // Return the updated match domain object
  const updatedMatchRow = getActiveMatchByCourt(sessionId, courtNumber)!;
  return toMatch(updatedMatchRow);
}

/**
 * Builds the candidate pool array from queue entries and session ratings.
 * For doubles: returns the top min(N, dynamicPoolSize) team slots.
 * Pool size scales with session size for better diversity in large sessions.
 * For singles: returns the top min(N, 4) team slots.
 *
 * Fixed pairs are included as single candidates with their combined rating
 * (average of both players' ratings). A pair counts as one team slot.
 */
function buildCandidatePool(
  sessionId: string,
  queue: QueueEntryRow[],
  gameMode: GameMode = 'doubles'
): PairingCandidate[] {
  const ratings = getSessionRatings(sessionId);
  const ratingRows = getPlayerRatingsBySession(sessionId);
  const matchesPlayedMap = new Map<string, number>();
  for (const row of ratingRows) {
    matchesPlayedMap.set(row.player_id, row.matches_played);
  }

  let maxPoolSize: number;
  if (gameMode === 'singles') {
    maxPoolSize = 4;
  } else {
    // Scale pool size with total players in session for better diversity
    const totalPlayers = getPlayersBySession(sessionId).length;
    if (totalPlayers >= 31) {
      maxPoolSize = 16;
    } else if (totalPlayers >= 17) {
      maxPoolSize = 12;
    } else if (totalPlayers >= 9) {
      maxPoolSize = 10;
    } else {
      maxPoolSize = 8;
    }
  }

  const poolSize = Math.min(queue.length, maxPoolSize);
  const pool = queue.slice(0, poolSize);

  return pool.map((entry): PairingCandidate => {
    if (entry.pair_id) {
      // This is a pair slot — look up the pair record and compute combined rating
      const pair = getFixedPairById(entry.pair_id);
      if (pair) {
        const player1Rating = ratings.get(pair.player1_id) ?? 1000;
        const player2Rating = ratings.get(pair.player2_id) ?? 1000;
        const combinedRating = calculateCombinedRating(player1Rating, player2Rating);
        const p1Matches = matchesPlayedMap.get(pair.player1_id) ?? 0;
        const p2Matches = matchesPlayedMap.get(pair.player2_id) ?? 0;
        return {
          playerId: entry.player_id,
          rating: combinedRating,
          queuePosition: entry.position,
          isPair: true,
          pairId: entry.pair_id,
          pairedPlayerIds: [pair.player1_id, pair.player2_id],
          matchesPlayed: Math.round((p1Matches + p2Matches) / 2),
        };
      }
    }

    // Individual player
    return {
      playerId: entry.player_id,
      rating: ratings.get(entry.player_id) ?? 1000,
      queuePosition: entry.position,
      isPair: false,
      pairId: null,
      pairedPlayerIds: null,
      matchesPlayed: matchesPlayedMap.get(entry.player_id) ?? 0,
    };
  });
}

/**
 * Expands a team array from the pairing result into actual player IDs.
 * If a team member is a pair candidate (has pairedPlayerIds), replaces the
 * single candidate ID with both player IDs from the pair.
 * This ensures both players of a pair end up on the same team.
 * Handles the case where a pair team is represented as [pairId, pairId].
 */
function expandTeamPlayerIds(
  team: [string, string],
  candidatePool: PairingCandidate[]
): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();

  for (const playerId of team) {
    if (seen.has(playerId)) continue; // Skip duplicate (pair team format [id, id])
    seen.add(playerId);

    const candidate = candidatePool.find(c => c.playerId === playerId);
    if (candidate && candidate.isPair && candidate.pairedPlayerIds) {
      // Expand pair into both constituent player IDs
      expanded.push(...candidate.pairedPlayerIds);
    } else {
      expanded.push(playerId);
    }
  }
  return expanded;
}

/**
 * Gets the set of candidate IDs (anchor player_ids) that should be removed from the queue.
 * For pair candidates, the queue entry uses the anchor player_id, not the individual paired player IDs.
 * For individual candidates, the queue entry uses the player_id directly.
 */
function getSelectedCandidateIds(
  expandedPlayerIds: string[],
  candidatePool: PairingCandidate[] | undefined
): Set<string> {
  if (!candidatePool) {
    // No candidate pool (singles mode) — use expanded IDs directly
    return new Set(expandedPlayerIds);
  }

  const selectedIds = new Set<string>();
  for (const candidate of candidatePool) {
    if (candidate.isPair && candidate.pairedPlayerIds) {
      // Check if any of the pair's player IDs are in the expanded list
      const pairInMatch = candidate.pairedPlayerIds.some(id => expandedPlayerIds.includes(id));
      if (pairInMatch) {
        // Remove by the anchor player_id (which is the queue entry's player_id)
        selectedIds.add(candidate.playerId);
      }
    } else {
      // Individual player — check if they're in the expanded list
      if (expandedPlayerIds.includes(candidate.playerId)) {
        selectedIds.add(candidate.playerId);
      }
    }
  }
  return selectedIds;
}

/**
 * Selects 2 players for a singles match.
 *
 * - Queue mode: picks the first 2 players from the queue (strict FIFO).
 * - Smart mode: builds a candidate pool of min(N, 4) players, then picks
 *   the pair with the minimum skill gap (closest ratings). Ties broken by
 *   earliest queue position.
 */
function selectSinglesPlayers(
  sessionId: string,
  queue: QueueEntryRow[],
  pairingMode: string
): string[] {
  if (pairingMode === 'smart') {
    const candidatePool = buildCandidatePool(sessionId, queue, 'singles');

    // If all candidates have default rating (1000), just pick first 2 by queue position
    const allDefault = candidatePool.every(p => p.rating === 1000);
    if (allDefault) {
      const sorted = [...candidatePool].sort((a, b) => a.queuePosition - b.queuePosition);
      return [sorted[0].playerId, sorted[1].playerId];
    }

    // Pick the pair with minimum skill gap from the candidate pool
    let bestPair: [string, string] | null = null;
    let bestGap = Infinity;
    let bestEarliestPos = Infinity;

    for (let i = 0; i < candidatePool.length; i++) {
      for (let j = i + 1; j < candidatePool.length; j++) {
        const gap = Math.abs(candidatePool[i].rating - candidatePool[j].rating);
        const earliestPos = Math.min(candidatePool[i].queuePosition, candidatePool[j].queuePosition);

        if (gap < bestGap || (gap === bestGap && earliestPos < bestEarliestPos)) {
          bestGap = gap;
          bestEarliestPos = earliestPos;
          bestPair = [candidatePool[i].playerId, candidatePool[j].playerId];
        }
      }
    }

    return bestPair!;
  } else {
    // Queue mode: strict FIFO, pick first 2
    const sorted = [...queue].sort((a, b) => a.position - b.position);
    return [sorted[0].player_id, sorted[1].player_id];
  }
}

/**
 * Builds the full PairingInput for the smart pairing algorithm.
 * Includes candidate pool, teammate history, opponent history, and match config history.
 */
function buildPairingInput(sessionId: string, queue: QueueEntryRow[]): PairingInput {
  const candidatePool = buildCandidatePool(sessionId, queue, 'doubles');

  // Build teammate and opponent history maps from pairing_history table
  const pairingHistoryRows = getPairingHistoryBySession(sessionId);
  const teammateHistory = new Map<string, Map<string, number>>();
  const opponentHistory = new Map<string, Map<string, number>>();

  for (const row of pairingHistoryRows) {
    // Teammate history (bidirectional)
    if (row.times_as_teammates > 0) {
      if (!teammateHistory.has(row.player1_id)) {
        teammateHistory.set(row.player1_id, new Map());
      }
      teammateHistory.get(row.player1_id)!.set(row.player2_id, row.times_as_teammates);

      if (!teammateHistory.has(row.player2_id)) {
        teammateHistory.set(row.player2_id, new Map());
      }
      teammateHistory.get(row.player2_id)!.set(row.player1_id, row.times_as_teammates);
    }

    // Opponent history (bidirectional)
    if (row.times_as_opponents > 0) {
      if (!opponentHistory.has(row.player1_id)) {
        opponentHistory.set(row.player1_id, new Map());
      }
      opponentHistory.get(row.player1_id)!.set(row.player2_id, row.times_as_opponents);

      if (!opponentHistory.has(row.player2_id)) {
        opponentHistory.set(row.player2_id, new Map());
      }
      opponentHistory.get(row.player2_id)!.set(row.player1_id, row.times_as_opponents);
    }
  }

  // Build matchConfigHistory from match results
  const matchResults = getMatchResultsBySession(sessionId);
  const matchConfigHistory = new Set<string>();

  for (const result of matchResults) {
    const winnerIds: string[] = JSON.parse(result.winner_player_ids);
    const loserIds: string[] = JSON.parse(result.loser_player_ids);

    // Handle both doubles (2-player teams) and singles (1-player teams)
    if (winnerIds.length >= 2 && loserIds.length >= 2) {
      // Doubles match — reconstruct team configuration
      const team1 = [winnerIds[0], winnerIds[1]] as [string, string];
      const team2 = [loserIds[0], loserIds[1]] as [string, string];
      const key = serializeMatchConfig(team1, team2);
      matchConfigHistory.add(key);
    }
    // Singles matches (1-player teams) are not added to matchConfigHistory
    // since the doubles pairing algorithm doesn't need them
  }

  return {
    candidatePool,
    teammateHistory,
    opponentHistory,
    matchConfigHistory,
    sessionId,
    pairingMode: 'smart',
  };
}

/**
 * Serialize a match configuration into a canonical string key.
 * The key is "sortedTeam1-vs-sortedTeam2" where teams are sorted internally
 * and the two teams are ordered so the lexicographically smaller team comes first.
 */
function serializeMatchConfig(team1: [string, string], team2: [string, string]): string {
  const t1Sorted = [...team1].sort();
  const t2Sorted = [...team2].sort();
  const t1Key = t1Sorted.join(',');
  const t2Key = t2Sorted.join(',');
  if (t1Key <= t2Key) {
    return `${t1Key}-vs-${t2Key}`;
  }
  return `${t2Key}-vs-${t1Key}`;
}

/**
 * Options for completing a match.
 * Either winningTeam or skip must be provided.
 * When team1Score and team2Score are provided, the winning team is derived from scores.
 */
export interface CompleteMatchOptions {
  winningTeam?: 'team1' | 'team2';
  skip?: boolean;
  team1Score?: number;
  team2Score?: number;
}

/**
 * Completes an active match on the specified court.
 *
 * 1. Validates session exists
 * 2. Validates options: must provide winningTeam, scores, or skip
 * 3. Gets active match on that court — if none exists, throws NotFoundError
 * 4. If winningTeam or scores provided: records match result and evaluates achievements
 * 5. Parses player IDs from the match
 * 6. For each player ID in order, checks if the player still exists (removed players excluded)
 * 7. Gets current queue length to determine starting position for returned players
 * 8. Appends each non-removed player to the queue end in their original assignment order
 * 9. Marks the match as completed (status='completed', completed_at=now)
 * 10. Updates session's updated_at timestamp
 *
 * @throws ValidationError if session not found or options invalid
 * @throws NotFoundError if no active match exists on the court
 */
export function completeMatch(sessionId: string, courtNumber: number, options?: CompleteMatchOptions): void {
  // 1. Validate session exists
  const session = getSessionById(sessionId);
  if (!session) {
    throw new ValidationError('Session not found', ['sessionId']);
  }

  // 2. Validate options: must provide winningTeam, scores, or skip
  const hasScores = options && options.team1Score !== undefined && options.team2Score !== undefined;
  if (!options || (!options.winningTeam && !options.skip && !hasScores)) {
    throw new ValidationError('Must select a winning team or skip score', ['winningTeam']);
  }

  // 3. Get active match on that court
  const activeMatch = getActiveMatchByCourt(sessionId, courtNumber);
  if (!activeMatch) {
    throw new NotFoundError('No active match on this court');
  }

  // 4. If winningTeam or scores provided: record match result and evaluate achievements
  if (options.winningTeam || hasScores) {
    recordMatchResult({
      matchId: activeMatch.id,
      sessionId,
      winningTeam: options.winningTeam || 'team1', // will be overridden by scores if provided
      team1Score: options.team1Score,
      team2Score: options.team2Score,
    });
    evaluateAchievements(sessionId, activeMatch.id);
  }

  // 5. Parse player IDs from the match
  const playerIds: string[] = JSON.parse(activeMatch.player_ids);

  // 6. Filter to only players that still exist (non-removed)
  const existingPlayerIds = playerIds.filter((playerId) => {
    const player = getPlayerById(playerId);
    return player !== undefined;
  });

  // 7. Get current queue length to determine starting position
  const currentQueue = getQueueBySession(sessionId);
  let nextPosition = currentQueue.length;

  // 8. Append each non-removed player to the queue end in assignment order.
  //    Fixed_Pairs are re-inserted as a single pair slot (not as two individual entries).
  //    After inserting a pair, an extra phantom position is consumed to slow their cycle rate.
  //    This accounts for pairs consuming 2 of 4 match slots — without this, pairs cycle
  //    through the queue at the same slot rate as individuals but get double the player-matches.
  const reinsertedPairIds = new Set<string>();

  for (const playerId of existingPlayerIds) {
    // Check if this player is part of a Fixed_Pair
    const fixedPair = getFixedPairByPlayerId(sessionId, playerId);

    if (fixedPair) {
      // Skip if we already re-inserted this pair
      if (reinsertedPairIds.has(fixedPair.id)) {
        continue;
      }

      // Re-insert the pair as a single pair slot using player1_id as anchor
      createQueueEntry({
        player_id: fixedPair.player1_id,
        session_id: sessionId,
        position: nextPosition,
        pair_id: fixedPair.id,
      });
      nextPosition++; // pair takes 1 queue position like individuals
      reinsertedPairIds.add(fixedPair.id);
    } else {
      // Individual player — insert normally
      createQueueEntry({
        player_id: playerId,
        session_id: sessionId,
        position: nextPosition,
      });
      nextPosition++;
    }
  }

  // 9. Mark the match as completed
  const now = new Date().toISOString();
  updateMatch(activeMatch.id, {
    status: 'completed',
    completed_at: now,
  });

  // 10. Update session's updated_at timestamp
  updateSession(sessionId, { updated_at: now });
}

/**
 * Returns all courts for a session with their current status.
 *
 * 1. Gets the session to know court_count
 * 2. For each court 1..court_count, checks if there's an active match
 * 3. Returns array of Court objects with status 'available' or 'active'
 *
 * @throws ValidationError if session not found
 */
export function getCourts(sessionId: string): Court[] {
  // 1. Get the session to know court_count
  const session = getSessionById(sessionId);
  if (!session) {
    throw new ValidationError('Session not found', ['sessionId']);
  }

  // 2. For each court 1..court_count, check if there's an active match
  const courts: Court[] = [];
  for (let courtNumber = 1; courtNumber <= session.court_count; courtNumber++) {
    const activeMatch = getActiveMatchByCourt(sessionId, courtNumber);
    courts.push({
      sessionId,
      courtNumber,
      status: activeMatch ? 'active' : 'available',
    });
  }

  return courts;
}
