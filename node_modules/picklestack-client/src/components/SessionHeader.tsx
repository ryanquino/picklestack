import type { PairingMode } from '../types';

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
          className={`session-header__btn session-header__btn--pairing${pairingMode === 'smart' ? ' session-header__btn--active' : ''}`}
          onClick={onTogglePairingMode}
          aria-label={`Pairing mode: ${pairingMode === 'smart' ? 'Smart' : 'Queue'}. Click to toggle.`}
          title={pairingMode === 'smart' ? 'Smart Pairing' : 'Queue Order'}
        >
          <span className="session-header__btn-icon" aria-hidden="true">🧠</span>
          <span className="session-header__btn-label">
            {pairingMode === 'smart' ? 'Smart' : 'Queue'}
          </span>
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
