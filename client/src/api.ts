import type { Session, Player, QueueEntry, FixedPair, SessionSummary, SessionSettings } from './types';

export type WinningTeam = 'team1' | 'team2';
export type PairingMode = 'smart' | 'queue';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Performs a fetch request and handles error responses by throwing
 * with the error message from the response body.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return res.json() as Promise<T>;
}

/** Create a new session */
export function createSession(name: string, courtCount: number): Promise<Session> {
  return request<Session>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ name, courtCount }),
  });
}

/** Get full session state for organizer */
export function getSession(sessionId: string): Promise<{
  session: Session;
  queue: QueueEntry[];
  courts: { sessionId: string; courtNumber: number; status: 'available' | 'active' }[];
  activeMatches: {
    id: string;
    sessionId: string;
    courtNumber: number;
    playerIds: string[];
    players: { id: string; name: string }[];
    status: string;
    startedAt: string;
    completedAt?: string;
  }[];
}> {
  return request(`/sessions/${sessionId}`);
}

/** Get session state for live view */
export function getSessionLive(sessionId: string): Promise<{
  session: { id: string; name: string; status: string; courtCount: number };
  queue: { playerId: string; playerName: string; position: number; isUpNext: boolean }[];
  courts: { sessionId: string; courtNumber: number; status: 'available' | 'active' }[];
  activeMatches: {
    id: string;
    courtNumber: number;
    players: { id: string; name: string }[];
    status: string;
    startedAt: string;
  }[];
}> {
  return request(`/sessions/${sessionId}/live`);
}

/** Check in a player to a session */
export function addPlayer(sessionId: string, name: string, starRating?: number): Promise<Player> {
  return request<Player>(`/sessions/${sessionId}/players`, {
    method: 'POST',
    body: JSON.stringify({ name, ...(starRating !== undefined && { starRating }) }),
  });
}

/** Remove a player from a session */
export function removePlayer(sessionId: string, playerId: string): Promise<void> {
  return request<void>(`/sessions/${sessionId}/players/${playerId}`, {
    method: 'DELETE',
  });
}

/** Move a player up or down in the queue */
export function movePlayer(
  sessionId: string,
  playerId: string,
  direction: 'up' | 'down'
): Promise<QueueEntry[]> {
  return request<QueueEntry[]>(`/sessions/${sessionId}/queue/move`, {
    method: 'PUT',
    body: JSON.stringify({ playerId, direction }),
  });
}

/** Start a match on a court */
export function startMatch(sessionId: string, courtNumber: number): Promise<{
  id: string;
  sessionId: string;
  courtNumber: number;
  playerIds: string[];
  status: string;
  startedAt: string;
}> {
  return request(`/sessions/${sessionId}/courts/${courtNumber}/start`, {
    method: 'POST',
  });
}

/** Complete a match on a court */
export function completeMatch(sessionId: string, courtNumber: number): Promise<void> {
  return request<void>(`/sessions/${sessionId}/courts/${courtNumber}/complete`, {
    method: 'POST',
  });
}

/** End a session */
export function endSession(sessionId: string): Promise<SessionSummary> {
  return request<SessionSummary>(`/sessions/${sessionId}/end`, {
    method: 'POST',
  });
}

/** Complete a match on a court with a winning team designation or numeric scores */
export function completeMatchWithResult(
  sessionId: string,
  courtNumber: number,
  winningTeam: WinningTeam,
  team1Score?: number,
  team2Score?: number
): Promise<void> {
  const body =
    team1Score !== undefined && team2Score !== undefined
      ? { team1Score, team2Score }
      : { winningTeam };
  return request<void>(`/sessions/${sessionId}/courts/${courtNumber}/complete`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Complete a match on a court without recording a score */
export function completeMatchSkipScore(sessionId: string, courtNumber: number): Promise<void> {
  return request<void>(`/sessions/${sessionId}/courts/${courtNumber}/complete`, {
    method: 'POST',
    body: JSON.stringify({ skip: true }),
  });
}

/** Replace a player in an active match on a court */
export function replacePlayer(
  sessionId: string,
  courtNumber: number,
  oldPlayerId: string,
  newPlayerId: string
): Promise<void> {
  return request<void>(`/sessions/${sessionId}/courts/${courtNumber}/replace`, {
    method: 'POST',
    body: JSON.stringify({ oldPlayerId, newPlayerId }),
  });
}

/** Update the winning team for a previously recorded match result */
export function updateMatchResult(
  sessionId: string,
  matchId: string,
  winningTeam: WinningTeam
): Promise<void> {
  return request<void>(`/sessions/${sessionId}/matches/${matchId}/result`, {
    method: 'PUT',
    body: JSON.stringify({ winningTeam }),
  });
}

/** Get player statistics for a session */
export function getSessionStats(sessionId: string): Promise<import('./types').PlayerStats[]> {
  return request<import('./types').PlayerStats[]>(`/sessions/${sessionId}/stats`);
}

/** Set the pairing mode for a session */
export function setPairingMode(sessionId: string, mode: PairingMode): Promise<void> {
  return request<void>(`/sessions/${sessionId}/pairing-mode`, {
    method: 'PUT',
    body: JSON.stringify({ mode }),
  });
}

/** Update session settings */
export function updateSessionSettings(sessionId: string, settings: SessionSettings): Promise<void> {
  return request<void>(`/sessions/${sessionId}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

/** Get session settings */
export function getSessionSettings(sessionId: string): Promise<SessionSettings> {
  return request<SessionSettings>(`/sessions/${sessionId}/settings`);
}

/** Rename a court */
export function renameCourtName(sessionId: string, courtNumber: number, name: string): Promise<{ success: boolean; courtNames: Record<string, string> }> {
  return request<{ success: boolean; courtNames: Record<string, string> }>(`/sessions/${sessionId}/courts/${courtNumber}/name`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

/** Get the leaderboard for a session */
export function getLeaderboard(sessionId: string): Promise<import('./types').LeaderboardEntry[]> {
  return request<import('./types').LeaderboardEntry[]>(`/sessions/${sessionId}/leaderboard`);
}

/** Get match history for a player in a session */
export function getPlayerHistory(sessionId: string, playerId: string): Promise<import('./types').MatchHistoryEntry[]> {
  return request<import('./types').MatchHistoryEntry[]>(`/sessions/${sessionId}/players/${playerId}/history`);
}

/** Get head-to-head records for a player in a session */
export function getPlayerHeadToHead(sessionId: string, playerId: string): Promise<import('./types').HeadToHeadRecord[]> {
  return request<import('./types').HeadToHeadRecord[]>(`/sessions/${sessionId}/players/${playerId}/head-to-head`);
}

/** Get full player profile for a player in a session */
export function getPlayerProfile(sessionId: string, playerId: string): Promise<import('./types').PlayerProfile> {
  return request<import('./types').PlayerProfile>(`/sessions/${sessionId}/players/${playerId}/profile`);
}

/** Get all achievements for a session */
export function getSessionAchievements(sessionId: string): Promise<import('./types').Achievement[]> {
  return request<import('./types').Achievement[]>(`/sessions/${sessionId}/achievements`);
}

/** Create a fixed pair from two queued players */
export function createFixedPair(sessionId: string, player1Id: string, player2Id: string): Promise<FixedPair> {
  return request<FixedPair>(`/sessions/${sessionId}/pairs`, {
    method: 'POST',
    body: JSON.stringify({ player1Id, player2Id }),
  });
}

/** Dissolve a fixed pair, returning both players as individual queue entries */
export function dissolveFixedPair(sessionId: string, pairId: string): Promise<void> {
  return request<void>(`/sessions/${sessionId}/pairs/${pairId}`, {
    method: 'DELETE',
  });
}

/** Get all fixed pairs for a session */
export function getFixedPairs(sessionId: string): Promise<FixedPair[]> {
  return request<FixedPair[]>(`/sessions/${sessionId}/pairs`);
}
