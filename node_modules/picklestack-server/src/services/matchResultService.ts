import { v4 as uuidv4 } from 'uuid';
import { MatchResult, PlayerStats, StarRating, ratingToStar } from '../types';
import { NotFoundError, ValidationError } from '../errors';
import {
  createMatchResult as createMatchResultRow,
  getMatchResultByMatchId,
  getMatchResultsBySession,
  updateMatchResult as updateMatchResultRow,
  getMatchById,
  getMatchesByPlayerId,
  incrementTeammateCount,
  incrementOpponentCount,
  MatchResultRow,
  MatchRow,
  getPlayersBySession,
  getPlayerRatingsBySession,
} from '../repository';
import {
  applyMatchResult as applyRatingResult,
  calculateWinRate,
} from './ratingService';

// ============================================================
// Public Interface
// ============================================================

export interface MatchResultInput {
  matchId: string;
  sessionId: string;
  winningTeam: 'team1' | 'team2';
  team1Score?: number;
  team2Score?: number;
}

// ============================================================
// Score Validation & Formatting
// ============================================================

/**
 * Validates match scores.
 * Both must be non-negative integers and not equal.
 * Returns the winning team derived from the higher score, or an error.
 */
export function validateScores(
  team1Score: number,
  team2Score: number
): { valid: true; winner: 'team1' | 'team2' } | { valid: false; error: string } {
  if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score)) {
    return { valid: false, error: 'Scores must be non-negative integers' };
  }
  if (team1Score < 0 || team2Score < 0) {
    return { valid: false, error: 'Scores must be non-negative integers' };
  }
  if (team1Score === team2Score) {
    return { valid: false, error: 'Scores cannot be tied' };
  }
  const winner: 'team1' | 'team2' = team1Score > team2Score ? 'team1' : 'team2';
  return { valid: true, winner };
}

/**
 * Formats a match score for display.
 * Returns "11-7" format (higher score first) or "No Score" if scores are null.
 */
export function formatMatchScore(
  team1Score: number | null,
  team2Score: number | null
): string {
  if (team1Score === null || team2Score === null) {
    return 'No Score';
  }
  const high = Math.max(team1Score, team2Score);
  const low = Math.min(team1Score, team2Score);
  return `${high}-${low}`;
}

/**
 * Records a match result: persists the result, updates player ratings,
 * and updates pairing history (teammate/opponent counts).
 *
 * For doubles: team1 = match.playerIds[0,1], team2 = match.playerIds[2,3]
 * For singles: team1 = match.playerIds[0], team2 = match.playerIds[1]
 *
 * When scores are provided:
 * - Derives winning team from higher score
 * - Calculates score margin and passes to rating service for multiplier
 * - Persists scores alongside the result
 *
 * When scores are NOT provided:
 * - Uses the provided winningTeam (existing behavior, no margin)
 */
export function recordMatchResult(input: MatchResultInput): MatchResult {
  const { matchId, sessionId, team1Score, team2Score } = input;
  let { winningTeam } = input;

  // Retrieve the match to get player IDs
  const matchRow = getMatchById(matchId);
  if (!matchRow) {
    throw new NotFoundError('Match not found');
  }

  const playerIds: string[] = JSON.parse(matchRow.player_ids);

  // Determine team composition based on player count (singles vs doubles)
  const isSingles = playerIds.length === 2;
  let winnerIds: string[];
  let loserIds: string[];

  // When scores are provided, validate and derive winner from scores
  let scoreMargin: number | undefined;
  let persistTeam1Score: number | null = null;
  let persistTeam2Score: number | null = null;

  if (team1Score !== undefined && team2Score !== undefined) {
    const validation = validateScores(team1Score, team2Score);
    if (!validation.valid) {
      throw new ValidationError(validation.error, ['team1Score', 'team2Score']);
    }
    winningTeam = validation.winner;
    scoreMargin = Math.abs(team1Score - team2Score);
    persistTeam1Score = team1Score;
    persistTeam2Score = team2Score;
  }

  if (isSingles) {
    // Singles: 1 player per team
    const team1 = [playerIds[0]];
    const team2 = [playerIds[1]];
    winnerIds = winningTeam === 'team1' ? team1 : team2;
    loserIds = winningTeam === 'team1' ? team2 : team1;
  } else {
    // Doubles: 2 players per team
    const team1: [string, string] = [playerIds[0], playerIds[1]];
    const team2: [string, string] = [playerIds[2], playerIds[3]];
    winnerIds = winningTeam === 'team1' ? team1 : team2;
    loserIds = winningTeam === 'team1' ? team2 : team1;
  }

  const now = new Date().toISOString();
  const resultRow: MatchResultRow = {
    id: uuidv4(),
    match_id: matchId,
    session_id: sessionId,
    winner_player_ids: JSON.stringify(winnerIds),
    loser_player_ids: JSON.stringify(loserIds),
    team1_score: persistTeam1Score,
    team2_score: persistTeam2Score,
    recorded_at: now,
    updated_at: now,
  };

  // Persist the match result
  createMatchResultRow(resultRow);

  // Update player ratings (with optional score margin for multiplier)
  applyRatingResult(sessionId, winnerIds, loserIds, scoreMargin);

  // Update pairing history
  if (isSingles) {
    // For singles: no teammates (1-player teams), only opponents
    updatePairingHistorySingles(sessionId, winnerIds[0], loserIds[0]);
  } else {
    updatePairingHistory(
      sessionId,
      winnerIds as [string, string],
      loserIds as [string, string]
    );
  }

  return toMatchResult(resultRow);
}

/**
 * Updates an existing match result's winning team designation.
 * Reverses the previous rating changes and applies new ones.
 */
export function updateMatchResult(matchId: string, winningTeam: 'team1' | 'team2'): MatchResult {
  // Get the existing result
  const existingRow = getMatchResultByMatchId(matchId);
  if (!existingRow) {
    throw new NotFoundError('No result recorded for this match');
  }

  // Get the match to determine teams
  const matchRow = getMatchById(matchId);
  if (!matchRow) {
    throw new NotFoundError('Match not found');
  }

  const playerIds: string[] = JSON.parse(matchRow.player_ids);
  const isSingles = playerIds.length === 2;

  let newWinnerIds: string[];
  let newLoserIds: string[];

  if (isSingles) {
    const team1 = [playerIds[0]];
    const team2 = [playerIds[1]];
    newWinnerIds = winningTeam === 'team1' ? team1 : team2;
    newLoserIds = winningTeam === 'team1' ? team2 : team1;
  } else {
    const team1: [string, string] = [playerIds[0], playerIds[1]];
    const team2: [string, string] = [playerIds[2], playerIds[3]];
    newWinnerIds = winningTeam === 'team1' ? team1 : team2;
    newLoserIds = winningTeam === 'team1' ? team2 : team1;
  }

  // Reverse the previous result's rating changes
  const prevWinnerIds = JSON.parse(existingRow.winner_player_ids) as string[];
  const prevLoserIds = JSON.parse(existingRow.loser_player_ids) as string[];
  reverseRatingResult(existingRow.session_id, prevWinnerIds, prevLoserIds);

  // Apply the new result's rating changes
  applyRatingResult(existingRow.session_id, newWinnerIds, newLoserIds);

  // Update the persisted result
  const now = new Date().toISOString();
  updateMatchResultRow(matchId, {
    winner_player_ids: JSON.stringify(newWinnerIds),
    loser_player_ids: JSON.stringify(newLoserIds),
    updated_at: now,
  });

  // Return the updated result
  const updatedRow = getMatchResultByMatchId(matchId)!;
  return toMatchResult(updatedRow);
}

/**
 * Retrieves a single match result by match ID.
 */
export function getMatchResult(matchId: string): MatchResult | null {
  const row = getMatchResultByMatchId(matchId);
  if (!row) return null;
  return toMatchResult(row);
}

/**
 * Retrieves all match results for a session.
 */
export function getSessionMatchResults(sessionId: string): MatchResult[] {
  const rows = getMatchResultsBySession(sessionId);
  return rows.map(toMatchResult);
}

/**
 * Computes PlayerStats[] for all players in a session.
 * Includes win rate, streak, and star rating for each player.
 */
export function getPlayerStats(sessionId: string): PlayerStats[] {
  const players = getPlayersBySession(sessionId);
  const ratingRows = getPlayerRatingsBySession(sessionId);
  const ratingMap = new Map(ratingRows.map((r) => [r.player_id, r]));

  return players.map((player) => {
    const ratingRow = ratingMap.get(player.id);
    const wins = ratingRow?.wins ?? 0;
    const losses = ratingRow?.losses ?? 0;
    const matchesPlayed = ratingRow?.matches_played ?? 0;
    const rating = ratingRow?.rating ?? 1000;
    const starRating = ratingRow?.star_rating ?? 3;
    const winRate = calculateWinRate(wins, losses);
    const streak = calculateStreak(sessionId, player.id);

    return {
      playerId: player.id,
      playerName: player.name,
      rating,
      starRating: starRating as StarRating,
      wins,
      losses,
      matchesPlayed,
      winRate,
      streak,
    };
  });
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Converts a MatchResultRow from the database into a MatchResult domain object.
 */
function toMatchResult(row: MatchResultRow): MatchResult {
  return {
    id: row.id,
    matchId: row.match_id,
    sessionId: row.session_id,
    winnerPlayerIds: JSON.parse(row.winner_player_ids) as string[],
    loserPlayerIds: JSON.parse(row.loser_player_ids) as string[],
    recordedAt: new Date(row.recorded_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Updates pairing history for teammates and opponents after a match.
 * Ensures player IDs are ordered (player1_id < player2_id) for consistent lookups.
 */
function updatePairingHistory(
  sessionId: string,
  team1: [string, string],
  team2: [string, string]
): void {
  // Teammates: team1[0] & team1[1], team2[0] & team2[1]
  incrementTeammateOrdered(sessionId, team1[0], team1[1]);
  incrementTeammateOrdered(sessionId, team2[0], team2[1]);

  // Opponents: each member of team1 vs each member of team2
  for (const t1Player of team1) {
    for (const t2Player of team2) {
      incrementOpponentOrdered(sessionId, t1Player, t2Player);
    }
  }
}

/**
 * Updates pairing history for a singles match.
 * In singles, there are no teammates — only opponents.
 */
function updatePairingHistorySingles(
  sessionId: string,
  player1: string,
  player2: string
): void {
  incrementOpponentOrdered(sessionId, player1, player2);
}

/**
 * Increments teammate count with ordered player IDs.
 */
function incrementTeammateOrdered(sessionId: string, playerA: string, playerB: string): void {
  const [p1, p2] = playerA < playerB ? [playerA, playerB] : [playerB, playerA];
  incrementTeammateCount(sessionId, p1, p2);
}

/**
 * Increments opponent count with ordered player IDs.
 */
function incrementOpponentOrdered(sessionId: string, playerA: string, playerB: string): void {
  const [p1, p2] = playerA < playerB ? [playerA, playerB] : [playerB, playerA];
  incrementOpponentCount(sessionId, p1, p2);
}

/**
 * Reverses a previous rating result by applying the inverse:
 * previous winners become losers and vice versa.
 */
function reverseRatingResult(
  sessionId: string,
  prevWinnerIds: string[],
  prevLoserIds: string[]
): void {
  // Reverse by treating previous winners as losers and previous losers as winners
  applyRatingResult(sessionId, prevLoserIds, prevWinnerIds);
}

/**
 * Calculates the current streak for a player.
 * Positive = consecutive wins, negative = consecutive losses, 0 = no matches or alternating.
 *
 * Looks at the player's matches in reverse chronological order and counts
 * consecutive wins or losses from the most recent match.
 */
function calculateStreak(sessionId: string, playerId: string): number {
  // Get matches for this player ordered by most recent first
  const matches = getMatchesByPlayerId(sessionId, playerId);
  if (matches.length === 0) return 0;

  // Get match results for this session to determine win/loss per match
  const resultRows = getMatchResultsBySession(sessionId);
  const resultByMatchId = new Map(resultRows.map((r) => [r.match_id, r]));

  let streak = 0;
  let streakType: 'win' | 'loss' | null = null;

  for (const match of matches) {
    const result = resultByMatchId.get(match.id);
    if (!result) {
      // Match was skipped (no result recorded) — skip it for streak calculation
      continue;
    }

    const winnerIds: string[] = JSON.parse(result.winner_player_ids);
    const isWin = winnerIds.includes(playerId);

    if (streakType === null) {
      // First match with a result — start the streak
      streakType = isWin ? 'win' : 'loss';
      streak = isWin ? 1 : -1;
    } else if (isWin && streakType === 'win') {
      streak++;
    } else if (!isWin && streakType === 'loss') {
      streak--;
    } else {
      // Streak broken
      break;
    }
  }

  return streak;
}
