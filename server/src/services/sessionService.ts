import { v4 as uuidv4 } from 'uuid';
import { Session, SessionSettings, SessionSummary, SessionType, GameMode, MatchingMode } from '../types';
import { ValidationError, NotFoundError } from '../errors';
import * as repository from '../repository';
import { SessionRow } from '../repository';
import { dissolveAllPairs } from './fixedPairService';

/**
 * Validates session creation inputs.
 * Throws ValidationError with descriptive message and field names if invalid.
 */
function validateSessionInputs(name: string, courtCount: number): void {
  const errors: string[] = [];
  const fields: string[] = [];

  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 50) {
    errors.push('Session name must be 1-50 characters');
    fields.push('name');
  }

  if (!Number.isInteger(courtCount) || courtCount < 1 || courtCount > 12) {
    errors.push('Court count must be between 1 and 12');
    fields.push('courtCount');
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join('; '), fields);
  }
}

/**
 * Converts a SessionRow (raw DB row with string dates) to a Session domain object.
 */
function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    name: row.name,
    courtCount: row.court_count,
    status: row.status as 'active' | 'ended',
    liveViewUrl: row.live_view_url,
    courtName: row.court_name,
    sessionType: row.session_type as Session['sessionType'],
    gameMode: row.game_mode as Session['gameMode'],
    matchingMode: row.matching_mode as Session['matchingMode'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Creates a new session with the given name and court count.
 * Validates inputs, generates a unique ID and live view URL,
 * persists to the database, and returns the created session.
 *
 * @throws ValidationError if name or courtCount are invalid
 */
export function createSession(name: string, courtCount: number): Session {
  validateSessionInputs(name, courtCount);

  const id = uuidv4();
  const liveViewId = uuidv4();
  const now = new Date().toISOString();

  const row: SessionRow = {
    id,
    name: name.trim(),
    court_count: courtCount,
    status: 'active',
    pairing_mode: 'balanced',
    court_name: '',
    session_type: 'open_play',
    game_mode: 'doubles',
    matching_mode: 'smart',
    live_view_url: `/live/${liveViewId}`,
    created_at: now,
    updated_at: now,
  };

  repository.createSession(row);

  return toSession(row);
}

/**
 * Retrieves a session by its ID.
 * Returns the Session domain object or null if not found.
 */
export function getSession(sessionId: string): Session | null {
  const row = repository.getSessionById(sessionId);
  if (!row) return null;
  return toSession(row);
}

/**
 * Ends an active session:
 * 1. Verifies session exists and is active
 * 2. Force-completes all active matches (sets status='completed', completed_at=now)
 * 3. Clears all queue entries for the session
 * 4. Updates session status to 'ended' and updated_at to now
 * 5. Returns a SessionSummary with total players and total completed matches
 *
 * @throws ValidationError if session not found or already ended
 */
export function endSession(sessionId: string): SessionSummary {
  const row = repository.getSessionById(sessionId);

  if (!row) {
    throw new ValidationError('Session not found', ['sessionId']);
  }

  if (row.status === 'ended') {
    throw new ValidationError('Session has already ended', ['sessionId']);
  }

  const now = new Date().toISOString();

  // Force-complete all active matches
  const activeMatches = repository.getActiveMatchesBySession(sessionId);
  for (const match of activeMatches) {
    repository.updateMatch(match.id, { status: 'completed', completed_at: now });
  }

  // Clear all queue entries first (they may reference fixed pairs via pair_id FK)
  repository.deleteQueueEntriesBySession(sessionId);

  // Dissolve all fixed pairs (safe now that queue entries are gone)
  dissolveAllPairs(sessionId);

  // Update session status to ended
  repository.updateSession(sessionId, { status: 'ended', updated_at: now });

  // Count total players (all players ever checked in)
  const players = repository.getPlayersBySession(sessionId);
  const totalPlayersCheckedIn = players.length;

  // Count total completed matches (including the ones just force-completed)
  const totalMatchesCompleted = repository.getCompletedMatchCountBySession(sessionId);

  return {
    totalPlayersCheckedIn,
    totalMatchesCompleted,
  };
}

// ============================================================
// Valid enum values for session settings
// ============================================================

const VALID_SESSION_TYPES: SessionType[] = ['tournament', 'open_play'];
const VALID_GAME_MODES: GameMode[] = ['doubles', 'singles'];
const VALID_MATCHING_MODES: MatchingMode[] = ['casual', 'balanced', 'competitive', 'queue'];

// ============================================================
// Session Settings Validation & Management
// ============================================================

/**
 * Validates session settings fields.
 * Returns { valid: true } or { valid: false, errors: Record<string, string> }
 *
 * Validation rules:
 * - name: 1-50 characters after trimming
 * - courtCount: integer between 1 and 12 inclusive
 * - courtName: 0-50 characters (empty string allowed)
 * - sessionType: must be 'tournament' or 'open_play'
 * - gameMode: must be 'doubles' or 'singles'
 * - matchingMode: must be 'queue', 'smart', 'tournament', or 'skill_courts'
 */
export function validateSessionSettings(
  settings: SessionSettings
): { valid: true } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const trimmedName = settings.name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 50) {
    errors.name = 'Session name must be 1-50 characters';
  }

  if (!Number.isInteger(settings.courtCount) || settings.courtCount < 1 || settings.courtCount > 12) {
    errors.courtCount = 'Court count must be between 1 and 12';
  }

  if (settings.courtName.length > 50) {
    errors.courtName = 'Court name must be 0-50 characters';
  }

  if (!VALID_SESSION_TYPES.includes(settings.sessionType)) {
    errors.sessionType = 'Session type must be tournament or open_play';
  }

  if (!VALID_GAME_MODES.includes(settings.gameMode)) {
    errors.gameMode = 'Game mode must be doubles or singles';
  }

  if (!VALID_MATCHING_MODES.includes(settings.matchingMode)) {
    errors.matchingMode = 'Matching mode must be casual, balanced, competitive, or queue';
  }

  if (typeof settings.sessionDurationHours !== 'number' || settings.sessionDurationHours < 0.5 || settings.sessionDurationHours > 12) {
    errors.sessionDurationHours = 'Session duration must be between 0.5 and 12 hours';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Updates session settings for an active session.
 * Validates all settings fields and ensures the session is active.
 *
 * @throws NotFoundError if session does not exist
 * @throws ValidationError with 403-mappable message if session has ended
 * @throws ValidationError with 400-mappable message if settings are invalid
 */
export function updateSessionSettings(sessionId: string, settings: SessionSettings): void {
  const row = repository.getSessionById(sessionId);

  if (!row) {
    throw new NotFoundError('Session not found');
  }

  if (row.status === 'ended') {
    throw new ValidationError('Cannot update settings after session has ended', ['sessionId']);
  }

  const validationResult = validateSessionSettings(settings);
  if (!validationResult.valid) {
    const result = validationResult as { valid: false; errors: Record<string, string> };
    const errorMessages = Object.values(result.errors);
    const errorFields = Object.keys(result.errors);
    throw new ValidationError(errorMessages.join('; '), errorFields);
  }

  const now = new Date().toISOString();

  repository.updateSessionSettings(sessionId, {
    name: settings.name.trim(),
    court_count: settings.courtCount,
    court_name: settings.courtName,
    session_type: settings.sessionType,
    game_mode: settings.gameMode,
    matching_mode: settings.matchingMode,
    session_duration_hours: settings.sessionDurationHours,
    updated_at: now,
  });
}

/**
 * Retrieves session settings for a given session.
 *
 * @throws NotFoundError if session does not exist
 */
export function getSessionSettings(sessionId: string): SessionSettings {
  const row = repository.getSessionSettings(sessionId);

  if (!row) {
    throw new NotFoundError('Session not found');
  }

  return {
    name: row.name,
    courtCount: row.court_count,
    courtName: row.court_name,
    sessionType: row.session_type as SessionType,
    gameMode: row.game_mode as GameMode,
    matchingMode: row.matching_mode as MatchingMode,
    sessionDurationHours: row.session_duration_hours,
  };
}
