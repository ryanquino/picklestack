/**
 * Session history stored in localStorage for "resume session" functionality.
 * Stores the last 10 sessions the organizer has created or visited.
 */

export interface SessionHistoryEntry {
  sessionId: string;
  name: string;
  createdAt: string;
  lastVisited: string;
  courtCount: number;
  status: 'active' | 'ended';
}

const STORAGE_KEY = 'pickld_session_history';
const MAX_ENTRIES = 10;

export function getSessionHistory(): SessionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const entries: SessionHistoryEntry[] = JSON.parse(raw);
    // Filter out entries older than 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return entries.filter(e => new Date(e.lastVisited).getTime() > cutoff);
  } catch {
    return [];
  }
}

export function addSessionToHistory(entry: Omit<SessionHistoryEntry, 'lastVisited'>): void {
  try {
    const history = getSessionHistory();
    const existing = history.findIndex(e => e.sessionId === entry.sessionId);
    const newEntry: SessionHistoryEntry = {
      ...entry,
      lastVisited: new Date().toISOString(),
    };

    if (existing >= 0) {
      history[existing] = { ...history[existing], ...newEntry };
    } else {
      history.unshift(newEntry);
    }

    // Keep only the most recent entries
    const trimmed = history.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage unavailable — silently fail
  }
}

/**
 * Check if the current browser is the organizer (creator) of this session.
 */
export function isSessionOrganizer(sessionId: string): boolean {
  const history = getSessionHistory();
  return history.some(e => e.sessionId === sessionId);
}

export function updateSessionStatus(sessionId: string, status: 'active' | 'ended'): void {
  try {
    const history = getSessionHistory();
    const entry = history.find(e => e.sessionId === sessionId);
    if (entry) {
      entry.status = status;
      entry.lastVisited = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }
  } catch {
    // silently fail
  }
}

export function removeSessionFromHistory(sessionId: string): void {
  try {
    const history = getSessionHistory().filter(e => e.sessionId !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // silently fail
  }
}
