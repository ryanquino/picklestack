import { useState, useEffect } from 'react';
import type { PairingMode } from '../types';

function getTheme(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem('pickld_theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
}

/**
 * Session header bar displayed at the top of the content area when a session is active.
 * Shows session name, live status badge, date/time, court name, and action buttons.
 */

interface SessionHeaderProps {
  sessionName?: string;
  isLive?: boolean;
  courtName?: string;
  dateTime?: string;
  pairingMode?: PairingMode;
  onTogglePairingMode?: () => void;
  onShare?: () => void;
  onOpenSettings?: () => void;
  onEndSession?: () => void;
}

function SessionHeader({
  sessionName = 'Session',
  isLive = true,
  courtName,
  dateTime = new Date().toLocaleString(),
  pairingMode = 'queue',
  onTogglePairingMode,
  onShare,
  onOpenSettings,
  onEndSession,
}: SessionHeaderProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>(getTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('pickld_theme', theme); } catch { /* ignore */ }
  }, [theme]);

  return (
    <header className="session-header">
      <div className="session-header__info">
        <div className="session-header__title-row">
          <h1 className="session-header__name">{sessionName}</h1>
          {isLive && (
            <span className="live-badge" aria-label="Session is live">
              <span className="live-badge__dot" aria-hidden="true" />
              LIVE
            </span>
          )}
        </div>
        <div className="session-header__meta">
          <span className="session-header__datetime">{dateTime}</span>
          {courtName && (
            <span className="session-header__court">{courtName}</span>
          )}
        </div>
      </div>

      <div className="session-header__actions">
        <button
          type="button"
          className="session-header__btn session-header__btn--share"
          onClick={onShare}
          aria-label="Share live view"
          title="Share Live View"
        >
          <span className="session-header__btn-icon" aria-hidden="true">📤</span>
          <span className="session-header__btn-label">Share</span>
        </button>

        <button
          type="button"
          className="session-header__btn session-header__btn--settings"
          onClick={onOpenSettings}
          aria-label="Session Settings"
          title="Session Settings"
        >
          <span className="session-header__btn-icon" aria-hidden="true">⚙️</span>
          <span className="session-header__btn-label">Settings</span>
        </button>

        <button
          type="button"
          className="navbar__theme-toggle"
          onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <button
          type="button"
          className="session-header__btn session-header__btn--end"
          onClick={onEndSession}
          aria-label="End Session"
          title="End Session"
        >
          <span className="session-header__btn-icon" aria-hidden="true">⏹</span>
          <span className="session-header__btn-label">End</span>
        </button>
      </div>
    </header>
  );
}

export default SessionHeader;
