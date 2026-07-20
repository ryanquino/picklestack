import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { updateSessionSettings, addPlayer } from '../api';
import type { SessionSettings, SessionType, GameMode, MatchingMode, StarRating } from '../types';
import { STAR_RATING_LABELS } from '../types';

interface SessionSettingsModalProps {
  sessionId: string;
  initialSettings: { name: string; courtCount: number; matchingMode?: MatchingMode };
  onConfirm: () => void;
  onClose?: () => void;
}

interface CheckedInPlayer {
  id: string;
  name: string;
  starRating?: number;
}

interface ValidationErrors {
  name?: string;
  courtName?: string;
  courtCount?: string;
  sessionDurationHours?: string;
}

function SessionSettingsModal({
  sessionId,
  initialSettings,
  onConfirm,
  onClose,
}: SessionSettingsModalProps) {
  const [name, setName] = useState(initialSettings.name);
  const [courtName, setCourtName] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('open_play');
  const [courtCount, setCourtCount] = useState(initialSettings.courtCount);
  const [sessionDurationHours, setSessionDurationHours] = useState(4);
  const [gameMode, setGameMode] = useState<GameMode>('doubles');
  const [matchingMode, setMatchingMode] = useState<MatchingMode>(initialSettings.matchingMode || 'balanced');

  const [playerName, setPlayerName] = useState('');
  const [playerStarRating, setPlayerStarRating] = useState<StarRating>(3);
  const [checkedInPlayers, setCheckedInPlayers] = useState<CheckedInPlayer[]>([]);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLInputElement>(null);

  function validate(): ValidationErrors {
    const errs: ValidationErrors = {};
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      errs.name = 'Session name must be 1-50 characters';
    }
    if (courtName.length > 50) {
      errs.courtName = 'Court name must be 0-50 characters';
    }
    const count = Number(courtCount);
    if (!Number.isInteger(count) || count < 1 || count > 12) {
      errs.courtCount = 'Court count must be between 1 and 12';
    }
    const duration = Number(sessionDurationHours);
    if (isNaN(duration) || duration < 0.5 || duration > 12) {
      errs.sessionDurationHours = 'Duration must be between 0.5 and 12 hours';
    }
    return errs;
  }

  const handleClose = useCallback(() => {
    if (!submitting && onClose) {
      onClose();
    }
  }, [submitting, onClose]);

  // Focus trap and keyboard handling
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) {
        handleClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, onClose]);

  // Focus first input on mount
  useEffect(() => {
    firstFocusableRef.current?.focus();
  }, []);

  // Prevent body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    const settings: SessionSettings = {
      name: name.trim(),
      courtCount: Number(courtCount),
      courtName,
      sessionType,
      gameMode,
      matchingMode,
      sessionDurationHours: Number(sessionDurationHours),
    };

    try {
      await updateSessionSettings(sessionId, settings);
      onConfirm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  async function handleAddPlayer() {
    setPlayerError(null);
    const trimmed = playerName.trim();

    if (!trimmed || trimmed.length === 0 || trimmed.length > 30) {
      setPlayerError('Player name must be 1-30 characters');
      return;
    }

    setAddingPlayer(true);
    try {
      const player = await addPlayer(sessionId, playerName, playerStarRating);
      setCheckedInPlayers((prev) => [...prev, { id: player.id, name: player.name, starRating: playerStarRating }]);
      setPlayerName('');
      setPlayerStarRating(3);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add player';
      setPlayerError(message);
    } finally {
      setAddingPlayer(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && onClose) {
      handleClose();
    }
  }

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-settings-title"
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '1.5rem',
          maxWidth: '520px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <h2
          id="session-settings-title"
          style={{ margin: '0 0 1rem', fontSize: '1.25rem', color: '#111827' }}
        >
          Session Settings
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* Session Name */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="settings-session-name"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem', color: '#374151' }}
            >
              Session Name
            </label>
            <input
              ref={firstFocusableRef}
              id="settings-session-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: undefined })); }}
              maxLength={50}
              disabled={submitting}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'settings-name-error' : undefined}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: errors.name ? '1px solid #dc2626' : '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
              }}
            />
            {errors.name && (
              <p id="settings-name-error" role="alert" style={{ color: '#dc2626', margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                {errors.name}
              </p>
            )}
          </div>

          {/* Court Name */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="settings-court-name"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem', color: '#374151' }}
            >
              Court Name <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
            </label>
            <input
              id="settings-court-name"
              type="text"
              value={courtName}
              onChange={(e) => { setCourtName(e.target.value); setErrors((prev) => ({ ...prev, courtName: undefined })); }}
              maxLength={50}
              placeholder="e.g. Main Court"
              disabled={submitting}
              aria-invalid={!!errors.courtName}
              aria-describedby={errors.courtName ? 'settings-court-name-error' : undefined}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: errors.courtName ? '1px solid #dc2626' : '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
              }}
            />
            {errors.courtName && (
              <p id="settings-court-name-error" role="alert" style={{ color: '#dc2626', margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                {errors.courtName}
              </p>
            )}
          </div>

          {/* Session Type */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="settings-session-type"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem', color: '#374151' }}
            >
              Session Type
            </label>
            <select
              id="settings-session-type"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as SessionType)}
              disabled={submitting}
              aria-label="Session type"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.95rem',
                background: '#fff',
                boxSizing: 'border-box',
              }}
            >
              <option value="open_play">Open Play</option>
              <option value="tournament">Tournament</option>
            </select>
          </div>

          {/* Court Count */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="settings-court-count"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem', color: '#374151' }}
            >
              Number of Courts
            </label>
            <input
              id="settings-court-count"
              type="number"
              min={1}
              max={12}
              value={courtCount}
              onChange={(e) => { setCourtCount(Number(e.target.value)); setErrors((prev) => ({ ...prev, courtCount: undefined })); }}
              disabled={submitting}
              aria-invalid={!!errors.courtCount}
              aria-describedby={errors.courtCount ? 'settings-court-count-error' : undefined}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: errors.courtCount ? '1px solid #dc2626' : '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
              }}
            />
            {errors.courtCount && (
              <p id="settings-court-count-error" role="alert" style={{ color: '#dc2626', margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                {errors.courtCount}
              </p>
            )}
          </div>

          {/* Session Duration */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="settings-session-duration"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem', color: '#374151' }}
            >
              Session Duration (hours)
            </label>
            <input
              id="settings-session-duration"
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={sessionDurationHours}
              onChange={(e) => { setSessionDurationHours(Number(e.target.value)); setErrors((prev) => ({ ...prev, sessionDurationHours: undefined })); }}
              disabled={submitting}
              aria-invalid={!!errors.sessionDurationHours}
              aria-describedby={errors.sessionDurationHours ? 'settings-duration-error' : undefined}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: errors.sessionDurationHours ? '1px solid #dc2626' : '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.95rem',
                boxSizing: 'border-box',
              }}
            />
            {errors.sessionDurationHours && (
              <p id="settings-duration-error" role="alert" style={{ color: '#dc2626', margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                {errors.sessionDurationHours}
              </p>
            )}
          </div>

          {/* Game Mode */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="settings-game-mode"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.9rem', color: '#374151' }}
            >
              Game Mode
            </label>
            <select
              id="settings-game-mode"
              value={gameMode}
              onChange={(e) => setGameMode(e.target.value as GameMode)}
              disabled={submitting}
              aria-label="Game mode"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.95rem',
                background: '#fff',
                boxSizing: 'border-box',
              }}
            >
              <option value="doubles">Doubles</option>
              <option value="singles">Singles</option>
            </select>
          </div>

          {/* Match Making Mode */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}
            >
              Match Making Mode
            </label>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
              Controls how the system selects and pairs players for each match. Choose the style that best fits the energy of your session.
            </p>
            <div role="radiogroup" aria-label="Match making mode" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {([
                { value: 'casual', label: 'Casual', badge: null, desc: 'Every player faces a fresh opponent each round. Perfect for social sessions where variety and fun matter more than competition.', disabled: false },
                { value: 'comeback', label: 'Comeback', badge: initialSettings.matchingMode === 'comeback' ? 'ACTIVE' : null, desc: 'Winners play winners and losers play losers in alternating brackets. Can only be set during session creation.', disabled: initialSettings.matchingMode === 'comeback' },
                { value: 'club_raid', label: 'Club Raid', badge: 'COMING SOON', desc: 'Multiple clubs compete in round-robin matches. Always cross-club play.', disabled: true },
                { value: 'balanced', label: 'Smart', badge: 'COMING SOON', desc: 'Equal court time for everyone with skill-balanced teams. The algorithm ensures fair play while keeping matches competitive. Best for most open play sessions.', disabled: true },
                { value: 'competitive', label: 'Competitive', badge: 'COMING SOON', desc: 'Skill rating drives all matchups. Players are grouped by ability for the tightest possible games. Repeat opponents may occur.', disabled: true },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { if (!option.disabled) setMatchingMode(option.value); }}
                  disabled={submitting || option.disabled}
                  aria-pressed={matchingMode === option.value}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '0.75rem 1rem',
                    border: matchingMode === option.value ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
                    borderRadius: '8px',
                    background: matchingMode === option.value ? 'rgba(22, 163, 106, 0.1)' : 'var(--color-surface)',
                    cursor: (submitting || option.disabled) ? 'not-allowed' : 'pointer',
                    opacity: option.disabled ? 0.5 : 1,
                    textAlign: 'left',
                    width: '100%',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {matchingMode === option.value && (
                      <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓</span>
                    )}
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>
                      {option.label}
                    </span>
                    {option.badge && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: '#fff',
                        background: 'var(--color-success)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '3px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        {option.badge}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                    {option.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '1.25rem 0' }} />

          {/* Player Check-In Section */}
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: '#111827' }}>
              Player Check-In
            </h3>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <label
                  htmlFor="settings-player-name"
                  style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.85rem', color: '#374151' }}
                >
                  Player Name
                </label>
                <input
                  id="settings-player-name"
                  type="text"
                  value={playerName}
                  onChange={(e) => { setPlayerName(e.target.value); setPlayerError(null); }}
                  placeholder="Enter player name"
                  maxLength={30}
                  disabled={addingPlayer || submitting}
                  aria-invalid={!!playerError}
                  aria-describedby={playerError ? 'settings-player-error' : undefined}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: playerError ? '1px solid #dc2626' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleAddPlayer}
                disabled={addingPlayer || submitting}
                aria-label="Add player"
                style={{
                  marginTop: '1.4rem',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: addingPlayer || submitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  opacity: addingPlayer || submitting ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {addingPlayer ? 'Adding...' : 'Add'}
              </button>
            </div>

            {/* Star Rating for player */}
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>Skill Level: </span>
              <span role="radiogroup" aria-label="Player star rating" style={{ display: 'inline-flex', gap: '0.125rem' }}>
                {([1, 2, 3, 4, 5] as StarRating[]).map((rating) => (
                  <label key={rating} style={{ cursor: addingPlayer || submitting ? 'not-allowed' : 'pointer' }}>
                    <input
                      type="radio"
                      name="settings-player-star-rating"
                      value={rating}
                      checked={playerStarRating === rating}
                      onChange={() => setPlayerStarRating(rating)}
                      disabled={addingPlayer || submitting}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                      aria-label={`${rating} star - ${STAR_RATING_LABELS[rating]}`}
                    />
                    <span
                      style={{
                        fontSize: '1.25rem',
                        color: rating <= playerStarRating ? '#f59e0b' : '#d1d5db',
                        transition: 'color 0.15s',
                      }}
                      aria-hidden="true"
                    >
                      ★
                    </span>
                  </label>
                ))}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                {STAR_RATING_LABELS[playerStarRating]}
              </span>
            </div>

            {playerError && (
              <p id="settings-player-error" role="alert" style={{ color: '#dc2626', margin: '0.25rem 0 0.5rem', fontSize: '0.8rem' }}>
                {playerError}
              </p>
            )}

            {/* Checked-in players list */}
            {checkedInPlayers.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
                  Checked-in Players ({checkedInPlayers.length})
                </p>
                <ul
                  aria-label="Checked-in players"
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    maxHeight: '150px',
                    overflowY: 'auto',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                  }}
                >
                  {checkedInPlayers.map((player) => (
                    <li
                      key={player.id}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderBottom: '1px solid #f3f4f6',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span style={{ color: '#111827' }}>{player.name}</span>
                      {player.starRating && (
                        <span style={{ color: '#f59e0b', fontSize: '0.8rem' }}>
                          {'★'.repeat(player.starRating)}
                          <span style={{ color: '#d1d5db' }}>{'★'.repeat(5 - player.starRating)}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Submit Error */}
          {submitError && (
            <p
              role="alert"
              style={{
                margin: '0 0 1rem',
                padding: '0.5rem 0.75rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626',
                fontSize: '0.85rem',
              }}
            >
              {submitError}
            </p>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            {onClose && (
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                aria-label="Close settings"
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: '#fff',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  color: '#374151',
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              aria-label="Confirm session settings"
              style={{
                padding: '0.5rem 1.25rem',
                border: 'none',
                borderRadius: '6px',
                background: submitting ? '#9ca3af' : '#2563eb',
                color: '#fff',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              {submitting ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SessionSettingsModal;
