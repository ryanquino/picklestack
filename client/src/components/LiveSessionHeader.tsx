import { useState, useEffect } from 'react';

function getTheme(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem('picklestack_theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
}

/**
 * LiveSessionHeader displays the session name with a "LIVE" badge (pulse animation),
 * date/time, active court count, and queued player count for the Live View page.
 * Uses the same layout structure as the dashboard SessionHeader.
 */

interface LiveSessionHeaderProps {
  sessionName: string;
  activeCourts: number;
  queuedPlayers: number;
}

function LiveSessionHeader({
  sessionName,
  activeCourts,
  queuedPlayers,
}: LiveSessionHeaderProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>(getTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('picklestack_theme', theme); } catch { /* ignore */ }
  }, [theme]);

  return (
    <header className="session-header">
      <div className="session-header__info">
        <div className="session-header__title-row">
          <h1 className="session-header__name">{sessionName}</h1>
          <span
            className="live-badge"
            aria-label="Session is live"
          >
            <span className="live-badge__dot" aria-hidden="true" />
            LIVE
          </span>
        </div>
        <div className="session-header__meta">
          <span className="session-header__datetime">{new Date().toLocaleString()}</span>
        </div>
      </div>

      <div className="session-header__actions">
        <span className="live-session-header__stat">
          <span className="live-session-header__stat-icon" aria-hidden="true">🏟️</span>
          <span className="live-session-header__stat-value">{activeCourts}</span>
          <span className="live-session-header__stat-label">
            {activeCourts === 1 ? 'Court' : 'Courts'} Active
          </span>
        </span>
        <span className="live-session-header__stat">
          <span className="live-session-header__stat-icon" aria-hidden="true">👥</span>
          <span className="live-session-header__stat-value">{queuedPlayers}</span>
          <span className="live-session-header__stat-label">
            {queuedPlayers === 1 ? 'Player' : 'Players'} Queued
          </span>
        </span>
        <button
          type="button"
          className="navbar__theme-toggle"
          onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}

export default LiveSessionHeader;
