import { PaceMetrics } from '../types';
import {
  getSessionById,
  getMatchesBySession,
  getPlayersBySession,
  MatchRow,
} from '../repository';

// ============================================================
// Constants
// ============================================================

/** Default session duration in minutes */
const SESSION_DURATION_MINUTES = 240;

/** Minimum games per player threshold for warning */
const MIN_GAMES_WARNING_THRESHOLD = 6;

// ============================================================
// Public Interface
// ============================================================

/**
 * Computes session pace metrics for the organizer dashboard.
 *
 * Calculates:
 * - Average match duration from completed matches
 * - Pacing projection: estimated games per player for the rest of the session
 * - Warning messages when pace is too slow or time has expired
 *
 * Edge cases:
 * - Zero players checked in: displays "No players checked in"
 * - Fewer than 2 completed matches: displays "Not enough data yet"
 * - Zero or negative remaining time: projection = 0 with warning
 * - Projection < 6 games: warning about slow pace
 *
 * @param sessionId - The session to compute pace metrics for
 * @returns PaceMetrics object with projection and messaging
 */
export function computePaceMetrics(sessionId: string): PaceMetrics {
  const session = getSessionById(sessionId);
  if (!session) {
    return {
      averageMatchDurationSeconds: null,
      pacingProjection: null,
      remainingMinutes: 0,
      warningMessage: null,
      displayMessage: 'Session not found',
    };
  }

  // Calculate remaining time
  const sessionCreatedAt = new Date(session.created_at);
  const sessionEndTime = new Date(sessionCreatedAt.getTime() + SESSION_DURATION_MINUTES * 60 * 1000);
  const now = new Date();
  const remainingMs = sessionEndTime.getTime() - now.getTime();
  const remainingMinutes = Math.max(0, remainingMs / (60 * 1000));

  // Get all checked-in players (Queue_Depth = total checked-in players including those on court)
  const players = getPlayersBySession(sessionId);
  const totalPlayers = players.length;

  // Edge case: no players checked in
  if (totalPlayers === 0) {
    return {
      averageMatchDurationSeconds: null,
      pacingProjection: null,
      remainingMinutes: Math.round(remainingMinutes),
      warningMessage: null,
      displayMessage: 'No players checked in',
    };
  }

  // Get completed matches
  const allMatches = getMatchesBySession(sessionId);
  const completedMatches = allMatches.filter(
    (m: MatchRow) => m.status === 'completed' && m.completed_at != null && m.started_at != null
  );

  // Edge case: fewer than 2 completed matches
  if (completedMatches.length < 2) {
    return {
      averageMatchDurationSeconds: null,
      pacingProjection: null,
      remainingMinutes: Math.round(remainingMinutes),
      warningMessage: null,
      displayMessage: 'Not enough data yet',
    };
  }

  // Calculate average match duration in seconds
  const totalDurationMs = completedMatches.reduce((sum: number, match: MatchRow) => {
    const startedAt = new Date(match.started_at).getTime();
    const completedAt = new Date(match.completed_at!).getTime();
    return sum + (completedAt - startedAt);
  }, 0);
  const averageMatchDurationMs = totalDurationMs / completedMatches.length;
  const averageMatchDurationSeconds = Math.round(averageMatchDurationMs / 1000);
  const averageMatchDurationMinutes = averageMatchDurationMs / (60 * 1000);

  // Edge case: zero or negative remaining time
  if (remainingMs <= 0) {
    return {
      averageMatchDurationSeconds,
      pacingProjection: 0,
      remainingMinutes: 0,
      warningMessage: '⚠️ Session time has expired.',
      displayMessage: 'At current pace, each player will get ~0 games',
    };
  }

  // Calculate pacing projection
  // Formula: remaining_time / avgDuration × courtCount / ceil(totalPlayers / playersPerMatch)
  const courtCount = session.court_count;
  const playersPerMatch = session.game_mode === 'singles' ? 2 : 4;
  const rotationGroups = Math.ceil(totalPlayers / playersPerMatch);

  // Cap projection at a reasonable maximum to avoid displaying unrealistic numbers
  // (e.g., when matches are force-completed instantly, avg duration is near-zero)
  const rawProjection = (remainingMinutes / averageMatchDurationMinutes) * courtCount / rotationGroups;
  const projection = Math.min(Math.round(rawProjection), 99);

  // Generate warning if projection < 6 games per player
  let warningMessage: string | null = null;
  if (projection < MIN_GAMES_WARNING_THRESHOLD) {
    warningMessage = `⚠️ Games are running long — players may only get ${projection} games at this rate.`;
  }

  return {
    averageMatchDurationSeconds,
    pacingProjection: projection,
    remainingMinutes: Math.round(remainingMinutes),
    warningMessage,
    displayMessage: `At current pace, each player will get ~${projection} games`,
  };
}
