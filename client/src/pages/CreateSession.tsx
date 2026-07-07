import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PendingPlayer, SessionType, GameMode, MatchingMode, StarRating } from '../types';
import { STAR_RATING_LABELS } from '../types';
import { validateSessionForm, validatePlayerName } from './createSessionValidation';
import type { ValidationErrors } from './createSessionValidation';
import { createSession, updateSessionSettings, addPlayer, createFixedPair } from '../api';
import Navbar from '../components/Navbar';

interface PendingPair {
  id: string;
  player1LocalId: string;
  player2LocalId: string;
}

function CreateSession() {
  const navigate = useNavigate();

  // Basic Info
  const [name, setName] = useState('');
  const [courtName, setCourtName] = useState('');
  const [courtCount, setCourtCount] = useState(2);

  // Game Settings
  const [sessionType, setSessionType] = useState<SessionType>('open_play');
  const [gameMode, setGameMode] = useState<GameMode>('doubles');
  const [matchingMode, setMatchingMode] = useState<MatchingMode>('balanced');
  const [sessionDurationHours, setSessionDurationHours] = useState(4);

  // Player Check-In
  const [pendingPlayers, setPendingPlayers] = useState<PendingPlayer[]>([]);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [playerStarRatingInput, setPlayerStarRatingInput] = useState<StarRating>(3);

  // Bulk Import
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');

  // Pairing
  const [pendingPairs, setPendingPairs] = useState<PendingPair[]>([]);
  const [pairSelection, setPairSelection] = useState<string[]>([]); // localIds of selected players for pairing

  // UI State
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [playerNameError, setPlayerNameError] = useState<string | null>(null);

  function handleAddPlayer() {
    const error = validatePlayerName(playerNameInput);
    if (error) {
      setPlayerNameError(error);
      return;
    }
    setPlayerNameError(null);

    const newPlayer: PendingPlayer = {
      localId: crypto.randomUUID(),
      name: playerNameInput.trim(),
      starRating: playerStarRatingInput,
      checkedIn: false,
    };

    setPendingPlayers((prev) => [...prev, newPlayer]);
    setPlayerNameInput('');
    setPlayerStarRatingInput(3);
  }

  function handleRemovePlayer(localId: string) {
    setPendingPlayers((prev) => prev.filter((p) => p.localId !== localId));
    // Also remove any pairs involving this player
    setPendingPairs((prev) => prev.filter((p) => p.player1LocalId !== localId && p.player2LocalId !== localId));
    // Remove from pair selection if selected
    setPairSelection((prev) => prev.filter((id) => id !== localId));
  }

  function handleToggleCheckIn(localId: string) {
    setPendingPlayers((prev) =>
      prev.map((p) => (p.localId === localId ? { ...p, checkedIn: !p.checkedIn } : p))
    );
    // If un-checking a player, remove from pair selection and any existing pairs
    const player = pendingPlayers.find((p) => p.localId === localId);
    if (player?.checkedIn) {
      // Player is going from checked-in to unchecked
      setPairSelection((prev) => prev.filter((id) => id !== localId));
      setPendingPairs((prev) => prev.filter((p) => p.player1LocalId !== localId && p.player2LocalId !== localId));
    }
  }

  function handleTogglePairSelection(localId: string) {
    setPairSelection((prev) => {
      if (prev.includes(localId)) {
        return prev.filter((id) => id !== localId);
      }
      if (prev.length >= 2) {
        // Replace the first selection
        return [prev[1], localId];
      }
      return [...prev, localId];
    });
  }

  function handleCreatePair() {
    if (pairSelection.length !== 2) return;
    const [p1, p2] = pairSelection;
    const newPair: PendingPair = {
      id: crypto.randomUUID(),
      player1LocalId: p1,
      player2LocalId: p2,
    };
    setPendingPairs((prev) => [...prev, newPair]);
    setPairSelection([]);
  }

  function handleRemovePair(pairId: string) {
    setPendingPairs((prev) => prev.filter((p) => p.id !== pairId));
  }

  function isPlayerPaired(localId: string): boolean {
    return pendingPairs.some((p) => p.player1LocalId === localId || p.player2LocalId === localId);
  }

  function handleBulkImport() {
    const lines = bulkImportText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const newPlayers: PendingPlayer[] = [];
    for (const line of lines) {
      // Remove leading numbers, dots, dashes (e.g., "1. Player Name" or "- Player Name")
      const cleaned = line.replace(/^[\d]+[.\-)\s]+/, '').replace(/^[-•]\s*/, '').trim();
      if (cleaned.length === 0 || cleaned.length > 30) continue;

      // Skip header-like lines
      if (/^participants/i.test(cleaned) || /^players/i.test(cleaned) || /^names/i.test(cleaned)) continue;

      // Check for duplicates
      const alreadyExists = pendingPlayers.some(p => p.name.toLowerCase() === cleaned.toLowerCase()) ||
        newPlayers.some(p => p.name.toLowerCase() === cleaned.toLowerCase());
      if (alreadyExists) continue;

      newPlayers.push({
        localId: crypto.randomUUID(),
        name: cleaned,
        starRating: 3,
        checkedIn: false,
      });
    }

    if (newPlayers.length > 0) {
      setPendingPlayers(prev => [...prev, ...newPlayers]);
    }
    setBulkImportText('');
    setShowBulkImport(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const errors = validateSessionForm({ name, courtName, courtCount });
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Create session
      const session = await createSession(name.trim(), courtCount);

      // 2. Update session settings
      await updateSessionSettings(session.id, {
        name: name.trim(),
        courtCount,
        courtName: courtName.trim(),
        sessionType,
        gameMode,
        matchingMode,
        sessionDurationHours,
      });

      // 3. Check in all pending players that are checked in (collect failures, don't abort)
      const failures: string[] = [];
      const localIdToServerId = new Map<string, string>();
      const checkedInPlayers = pendingPlayers.filter((p) => p.checkedIn);
      for (const player of checkedInPlayers) {
        try {
          const created = await addPlayer(session.id, player.name, player.starRating);
          localIdToServerId.set(player.localId, created.id);
        } catch {
          failures.push(player.name);
        }
      }

      // 4. Create fixed pairs for successfully checked-in players
      for (const pair of pendingPairs) {
        const p1Id = localIdToServerId.get(pair.player1LocalId);
        const p2Id = localIdToServerId.get(pair.player2LocalId);
        if (p1Id && p2Id) {
          try {
            await createFixedPair(session.id, p1Id, p2Id);
          } catch {
            // Pair creation failed — not critical, continue
          }
        }
      }

      // 5. Navigate to dashboard
      navigate(`/session/${session.id}`, {
        state: failures.length > 0 ? { checkInWarnings: failures } : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  function renderStars(rating: StarRating): string {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  return (
    <div className="page">
      <Navbar />
      <h1>Create Open Play</h1>
      <p className="text-secondary">Set up your pickleball open play in a few steps</p>

      <form onSubmit={handleSubmit} noValidate>
        {submitError && (
          <div role="alert" className="create-session__error">
            {submitError}
          </div>
        )}

        {/* Basic Info Card */}
        <div className="card create-session__card">
          <h2 className="create-session__card-title">Basic Info</h2>
          <p className="create-session__card-description">Name your session and configure your courts</p>

          <div className="create-session__field">
            <label htmlFor="session-name">Open Play Name</label>
            <input
              id="session-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby="session-name-helper session-name-error"
              aria-invalid={validationErrors.name ? true : undefined}
              className="create-session__input"
            />
            <p id="session-name-helper" className="create-session__helper">
              Give your open play a name so players can find it easily
            </p>
            {validationErrors.name && (
              <p id="session-name-error" role="alert" className="create-session__field-error">
                {validationErrors.name}
              </p>
            )}
          </div>

          <div className="create-session__field">
            <label htmlFor="court-name">Court Name</label>
            <input
              id="court-name"
              type="text"
              value={courtName}
              onChange={(e) => setCourtName(e.target.value)}
              aria-describedby="court-name-helper court-name-error"
              aria-invalid={validationErrors.courtName ? true : undefined}
              className="create-session__input"
            />
            <p id="court-name-helper" className="create-session__helper">
              Optionally name your court area (e.g. Main Gym, Outdoor Courts)
            </p>
            {validationErrors.courtName && (
              <p id="court-name-error" role="alert" className="create-session__field-error">
                {validationErrors.courtName}
              </p>
            )}
          </div>

          <div className="create-session__field">
            <label htmlFor="court-count">Number of Courts</label>
            <input
              id="court-count"
              type="number"
              min={1}
              max={12}
              value={courtCount}
              onChange={(e) => setCourtCount(Number(e.target.value))}
              aria-describedby="court-count-helper court-count-error"
              aria-invalid={validationErrors.courtCount ? true : undefined}
              className="create-session__input"
            />
            <p id="court-count-helper" className="create-session__helper">
              How many courts are available for play? Players will be assigned across courts.
            </p>
            {validationErrors.courtCount && (
              <p id="court-count-error" role="alert" className="create-session__field-error">
                {validationErrors.courtCount}
              </p>
            )}
          </div>

          <div className="create-session__field">
            <label htmlFor="session-duration">Session Duration (hours)</label>
            <input
              id="session-duration"
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={sessionDurationHours}
              onChange={(e) => setSessionDurationHours(Number(e.target.value))}
              aria-describedby="session-duration-helper"
              className="create-session__input"
            />
            <p id="session-duration-helper" className="create-session__helper">
              How long is this session? Used to calculate pacing projections.
            </p>
          </div>
        </div>

        {/* Game Settings Card */}
        <div className="card create-session__card">
          <h2 className="create-session__card-title">Game Settings</h2>
          <p className="create-session__card-description">Choose how matches are organized</p>

          <div className="create-session__field">
            <label htmlFor="session-type">Play Type</label>
            <select
              id="session-type"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as SessionType)}
              aria-describedby="session-type-helper"
              className="create-session__input"
            >
              <option value="open_play">Open Play</option>
              <option value="tournament">Tournament</option>
            </select>
            <p id="session-type-helper" className="create-session__helper">
              Open Play for casual rotation, Tournament for bracket-style play
            </p>
          </div>

          <div className="create-session__field">
            <label htmlFor="game-mode">Game Mode</label>
            <select
              id="game-mode"
              value={gameMode}
              onChange={(e) => setGameMode(e.target.value as GameMode)}
              aria-describedby="game-mode-helper"
              className="create-session__input"
            >
              <option value="doubles">Doubles</option>
              <option value="singles">Singles</option>
            </select>
            <p id="game-mode-helper" className="create-session__helper">
              Doubles = teams of 2, Singles = 1v1 matches
            </p>
          </div>

          <div className="create-session__field">
            <label>Match Making Mode</label>
            <p className="create-session__helper" style={{ marginBottom: '0.75rem' }}>
              Controls how the system selects and pairs players for each match. Choose the style that best fits the energy of your session.
            </p>
            <div role="radiogroup" aria-label="Match making mode" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {([
                { value: 'casual', label: 'Casual', badge: null, desc: 'Every player faces a fresh opponent each round. Perfect for social sessions where variety and fun matter more than competition.' },
                { value: 'balanced', label: 'Smart', badge: 'RECOMMENDED', desc: 'Equal court time for everyone with skill-balanced teams. The algorithm ensures fair play while keeping matches competitive. Best for most open play sessions.' },
                { value: 'competitive', label: 'Competitive', badge: null, desc: 'Skill rating drives all matchups. Players are grouped by ability for the tightest possible games. Repeat opponents may occur.' },
                { value: 'queue', label: 'Queue', badge: null, desc: 'Players are matched in the order they checked in — first in, first on court. Simple and transparent.' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMatchingMode(option.value)}
                  aria-pressed={matchingMode === option.value}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '0.75rem 1rem',
                    border: matchingMode === option.value ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
                    borderRadius: '8px',
                    background: matchingMode === option.value ? 'rgba(22, 163, 106, 0.1)' : 'var(--color-surface)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    boxSizing: 'border-box',
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
        </div>

        {/* Player Check-In Card */}
        <div className="card create-session__card">
          <h2 className="create-session__card-title">Player Check-In</h2>
          <p className="create-session__card-description">
            Add players who are here and ready to play. You can also add more from the dashboard.
          </p>

          {/* Bulk Import Button */}
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            style={{
              marginBottom: '1rem',
              padding: '0.5rem 1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              background: '#fff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            📋 Bulk Import Players
          </button>

          <div className="create-session__player-input-row">
            <div className="create-session__field create-session__field--inline">
              <label htmlFor="player-name">Player Name</label>
              <input
                id="player-name"
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                aria-describedby="player-name-helper player-name-error"
                aria-invalid={playerNameError ? true : undefined}
                className="create-session__input"
                placeholder="Player name"
              />
            </div>

            <div className="create-session__field create-session__field--inline">
              <label htmlFor="player-star-rating">Skill Level</label>
              <select
                id="player-star-rating"
                value={playerStarRatingInput}
                onChange={(e) => setPlayerStarRatingInput(Number(e.target.value) as StarRating)}
                className="create-session__input"
              >
                {([1, 2, 3, 4, 5] as StarRating[]).map((r) => (
                  <option key={r} value={r}>
                    {'★'.repeat(r)} {STAR_RATING_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleAddPlayer}
              className="create-session__add-btn"
              aria-label="Add player"
            >
              Add
            </button>
          </div>

          <p id="player-name-helper" className="create-session__helper">
            Enter each player's name and skill level
          </p>
          {playerNameError && (
            <p id="player-name-error" role="alert" className="create-session__field-error">
              {playerNameError}
            </p>
          )}

          {pendingPlayers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {pendingPlayers.filter((p) => p.checkedIn).length} of {pendingPlayers.length} checked in
              </span>
              {pendingPlayers.some((p) => !p.checkedIn) && (
                <button
                  type="button"
                  onClick={() => setPendingPlayers((prev) => prev.map((p) => ({ ...p, checkedIn: true })))}
                  style={{
                    padding: '0.25rem 0.75rem',
                    border: '1px solid #16a34a',
                    borderRadius: '4px',
                    background: '#f0fdf4',
                    color: '#16a34a',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  ✓ Check All In
                </button>
              )}
            </div>
          )}

          {pendingPlayers.length > 0 && (
            <ul className="create-session__player-list" aria-label="Pending players">
              {pendingPlayers.map((player) => (
                <li key={player.localId} className="create-session__player-item" style={{ opacity: player.checkedIn ? 1 : 0.7 }}>
                  {/* Check-in toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleCheckIn(player.localId)}
                    aria-label={player.checkedIn ? `${player.name} checked in` : `Check in ${player.name}`}
                    aria-pressed={player.checkedIn}
                    title={player.checkedIn ? 'Checked in' : 'Tap to check in'}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      border: player.checkedIn ? '2px solid #16a34a' : '2px solid #d1d5db',
                      background: player.checkedIn ? '#dcfce7' : '#f9fafb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontSize: '0.9rem',
                    }}
                  >
                    {player.checkedIn ? '✓' : ''}
                  </button>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, cursor: 'pointer' }}>
                    {gameMode === 'doubles' && !isPlayerPaired(player.localId) && (
                      <span
                        role="checkbox"
                        aria-checked={pairSelection.includes(player.localId)}
                        aria-disabled={!player.checkedIn}
                        aria-label={`Select ${player.name} for pairing`}
                        tabIndex={player.checkedIn ? 0 : -1}
                        onClick={() => { if (player.checkedIn) handleTogglePairSelection(player.localId); }}
                        onKeyDown={(e) => { if (player.checkedIn && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); handleTogglePairSelection(player.localId); }}}
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: pairSelection.includes(player.localId) ? '2px solid #16a34a' : '2px solid #d1d5db',
                          background: !player.checkedIn ? '#e5e7eb' : pairSelection.includes(player.localId) ? '#16a34a' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.15s',
                          cursor: player.checkedIn ? 'pointer' : 'not-allowed',
                          opacity: player.checkedIn ? 1 : 0.5,
                        }}
                      >
                        {pairSelection.includes(player.localId) && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                    )}
                    {isPlayerPaired(player.localId) && (
                      <span style={{ fontSize: '0.8rem', color: '#7c3aed' }} aria-label="Paired">🔗</span>
                    )}
                    <span className="create-session__player-name">{player.name}</span>
                    {!player.checkedIn && (
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic' }}>
                        not checked in
                      </span>
                    )}
                  </label>
                  <span className="create-session__player-stars" aria-label={`${player.starRating} star rating`}>
                    {([1, 2, 3, 4, 5] as const).map((star) => (
                      <span
                        key={star}
                        onClick={() => setPendingPlayers(prev => prev.map(p =>
                          p.localId === player.localId ? { ...p, starRating: star as StarRating } : p
                        ))}
                        style={{
                          cursor: 'pointer',
                          color: star <= player.starRating ? '#f59e0b' : '#d1d5db',
                          fontSize: '1rem',
                        }}
                      >
                        ★
                      </span>
                    ))}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePlayer(player.localId)}
                    className="create-session__remove-btn"
                    aria-label={`Remove ${player.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Pair selected players button */}
          {gameMode === 'doubles' && pairSelection.length === 2 && (
            <button
              type="button"
              onClick={handleCreatePair}
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '6px',
                background: '#16a34a',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
              aria-label="Pair selected players"
            >
              🔗 Pair Selected Players
            </button>
          )}

          {/* Pending pairs list */}
          {pendingPairs.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#374151' }}>
                Fixed Pairs ({pendingPairs.length})
              </h4>
              <ul className="create-session__player-list" aria-label="Pending pairs">
                {pendingPairs.map((pair) => {
                  const p1 = pendingPlayers.find((p) => p.localId === pair.player1LocalId);
                  const p2 = pendingPlayers.find((p) => p.localId === pair.player2LocalId);
                  return (
                    <li key={pair.id} className="create-session__player-item">
                      <span style={{ flex: 1 }}>
                        🔗 {p1?.name ?? '?'} &amp; {p2?.name ?? '?'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePair(pair.id)}
                        className="create-session__remove-btn"
                        aria-label={`Remove pair ${p1?.name} and ${p2?.name}`}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <button type="submit" disabled={submitting} className="create-session__submit-btn">
          {submitting ? 'Creating...' : 'Create Open Play'}
        </button>
      </form>

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) setShowBulkImport(false); }}
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-import-title"
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 id="bulk-import-title" style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>
                Bulk Import Players
              </h3>
              <button
                type="button"
                onClick={() => setShowBulkImport(false)}
                aria-label="Close"
                style={{ border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6b7280' }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
              Paste a list of player names below, one per line.
            </p>
            <textarea
              value={bulkImportText}
              onChange={(e) => setBulkImportText(e.target.value)}
              placeholder={"Example:\n1. Alice\n2. Bob\n3. Charlie\n..."}
              rows={10}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '0.9rem',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleBulkImport}
                disabled={bulkImportText.trim().length === 0}
                style={{
                  padding: '0.5rem 1.25rem',
                  border: 'none',
                  borderRadius: '6px',
                  background: bulkImportText.trim().length === 0 ? '#9ca3af' : '#16a34a',
                  color: '#fff',
                  cursor: bulkImportText.trim().length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              >
                Import Players
              </button>
              <button
                type="button"
                onClick={() => setShowBulkImport(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  background: '#fff',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateSession;
