import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PendingPlayer, SessionType, GameMode, MatchingMode, StarRating } from '../types';
import { STAR_RATING_LABELS } from '../types';
import { validateSessionForm, validatePlayerName } from './createSessionValidation';
import type { ValidationErrors } from './createSessionValidation';
import { createSession, updateSessionSettings, addPlayer } from '../api';
import Navbar from '../components/Navbar';

function CreateSession() {
  const navigate = useNavigate();

  // Basic Info
  const [name, setName] = useState('');
  const [courtName, setCourtName] = useState('');
  const [courtCount, setCourtCount] = useState(2);

  // Game Settings
  const [sessionType, setSessionType] = useState<SessionType>('open_play');
  const [gameMode, setGameMode] = useState<GameMode>('doubles');
  const [matchingMode, setMatchingMode] = useState<MatchingMode>('smart');
  const [sessionDurationHours, setSessionDurationHours] = useState(4);

  // Player Check-In
  const [pendingPlayers, setPendingPlayers] = useState<PendingPlayer[]>([]);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [playerStarRatingInput, setPlayerStarRatingInput] = useState<StarRating>(3);

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
    };

    setPendingPlayers((prev) => [...prev, newPlayer]);
    setPlayerNameInput('');
    setPlayerStarRatingInput(3);
  }

  function handleRemovePlayer(localId: string) {
    setPendingPlayers((prev) => prev.filter((p) => p.localId !== localId));
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

      // 3. Check in all pending players (collect failures, don't abort)
      const failures: string[] = [];
      for (const player of pendingPlayers) {
        try {
          await addPlayer(session.id, player.name, player.starRating);
        } catch {
          failures.push(player.name);
        }
      }

      // 4. Navigate to dashboard
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
            <label htmlFor="matching-mode">Matching Mode</label>
            <select
              id="matching-mode"
              value={matchingMode}
              onChange={(e) => setMatchingMode(e.target.value as MatchingMode)}
              aria-describedby="matching-mode-helper"
              className="create-session__input"
            >
              <option value="smart">Smart Pairing</option>
              <option value="queue">Queue</option>
            </select>
            <p id="matching-mode-helper" className="create-session__helper">
              Smart Pairing uses skill ratings for balanced matches. Queue uses first-come first-served order.
            </p>
          </div>
        </div>

        {/* Player Check-In Card */}
        <div className="card create-session__card">
          <h2 className="create-session__card-title">Player Check-In</h2>
          <p className="create-session__card-description">
            Add players who are here and ready to play. You can also add more from the dashboard.
          </p>

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
            <ul className="create-session__player-list" aria-label="Pending players">
              {pendingPlayers.map((player) => (
                <li key={player.localId} className="create-session__player-item">
                  <span className="create-session__player-name">{player.name}</span>
                  <span className="create-session__player-stars" aria-label={`${player.starRating} star rating`}>
                    {renderStars(player.starRating)}
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
        </div>

        <button type="submit" disabled={submitting} className="create-session__submit-btn">
          {submitting ? 'Creating...' : 'Create Open Play'}
        </button>
      </form>
    </div>
  );
}

export default CreateSession;
