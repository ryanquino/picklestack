import { WaitEstimate } from '../types';
import {
  getSessionById,
  getMatchesBySession,
  getQueueBySession,
} from '../repository';

// ============================================================
// Queue Estimator Service
// ============================================================

/**
 * Computes estimated wait time for all queued players in a session.
 *
 * Formula: ceil(position / (courtCount × playersPerMatch)) × avgDuration
 * - position is 1-based queue position
 * - courtCount from session's court_count
 * - playersPerMatch is 4 for doubles, 2 for singles
 * - avgDuration is arithmetic mean of completed match durations in minutes
 *
 * Returns null estimate for all players when:
 * - Fewer than 2 matches have been completed
 * - Average match duration is 0
 *
 * Result is rounded to nearest whole minute, minimum 1 minute.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export function computeWaitEstimates(sessionId: string): WaitEstimate[] {
  const session = getSessionById(sessionId);
  if (!session) {
    return [];
  }

  const queueEntries = getQueueBySession(sessionId);
  if (queueEntries.length === 0) {
    return [];
  }

  // Get all completed matches to compute average duration
  const allMatches = getMatchesBySession(sessionId);
  const completedMatches = allMatches.filter(
    (m) => m.status === 'completed' && m.started_at && m.completed_at
  );

  // Return null estimates if fewer than 2 completed matches
  if (completedMatches.length < 2) {
    return queueEntries.map((entry) => ({
      playerId: entry.player_id,
      estimatedMinutes: null,
    }));
  }

  // Compute average match duration in minutes
  const totalDurationMinutes = completedMatches.reduce((sum, match) => {
    const startedAt = new Date(match.started_at).getTime();
    const completedAt = new Date(match.completed_at!).getTime();
    const durationMinutes = (completedAt - startedAt) / (1000 * 60);
    return sum + durationMinutes;
  }, 0);

  const avgDuration = totalDurationMinutes / completedMatches.length;

  // Return null estimates if average duration is 0 or unrealistically short (< 1 minute)
  // When matches are force-completed instantly, the estimate is meaningless
  if (avgDuration < 1) {
    return queueEntries.map((entry) => ({
      playerId: entry.player_id,
      estimatedMinutes: null,
    }));
  }

  const courtCount = session.court_count;
  const playersPerMatch = session.game_mode === 'singles' ? 2 : 4;

  // Compute wait estimate for each queued player
  return queueEntries.map((entry) => {
    // position is 1-based (queue_entries.position is 0-based, so add 1)
    const position = entry.position + 1;

    // Formula: ceil(position / (courtCount × playersPerMatch)) × avgDuration
    const rawEstimate =
      Math.ceil(position / (courtCount * playersPerMatch)) * avgDuration;

    // Round to nearest whole minute, minimum 1
    const estimatedMinutes = Math.max(1, Math.round(rawEstimate));

    return {
      playerId: entry.player_id,
      estimatedMinutes,
    };
  });
}
