import { useState, useEffect, useRef, useCallback } from 'react';
import { completeMatchWithResult, completeMatchSkipScore } from '../api';
import PlayerAvatar from './PlayerAvatar';

interface Player {
  id: string;
  name: string;
}

interface MatchCompleteDialogProps {
  sessionId: string;
  courtNumber: number;
  players: Player[];
  matchStartedAt?: string;
  initialWinner?: 'team1' | 'team2' | null;
  onClose: () => void;
  onComplete: () => void;
}

/** Calculate elapsed duration in minutes from a startedAt timestamp */
function getElapsedMinutes(startedAt: string): number {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 60000));
}

function MatchCompleteDialog({
  sessionId,
  courtNumber,
  players,
  matchStartedAt,
  initialWinner,
  onClose,
  onComplete,
}: MatchCompleteDialogProps) {
  const [team1Score, setTeam1Score] = useState<string>('');
  const [team2Score, setTeam2Score] = useState<string>('');
  const [selectedWinner, setSelectedWinner] = useState<'team1' | 'team2' | null>(initialWinner ?? null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const team1 = players.slice(0, 2);
  const team2 = players.slice(2, 4);

  const handleClose = useCallback(() => {
    if (!submitting) {
      onClose();
    }
  }, [submitting, onClose]);

  // Focus trap and escape key handling
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  }, [handleClose]);

  // Focus the dialog on mount
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Auto-determine winner from scores
  useEffect(() => {
    const s1 = team1Score === '' ? NaN : Number(team1Score);
    const s2 = team2Score === '' ? NaN : Number(team2Score);
    if (!isNaN(s1) && !isNaN(s2) && s1 >= 0 && s2 >= 0 && s1 !== s2) {
      setSelectedWinner(s1 > s2 ? 'team1' : 'team2');
    }
  }, [team1Score, team2Score]);

  function handleTeam1ScoreChange(value: string) {
    setTeam1Score(value);
    setValidationError(null);
  }

  function handleTeam2ScoreChange(value: string) {
    setTeam2Score(value);
    setValidationError(null);
  }

  function handleSelectWinner(team: 'team1' | 'team2') {
    if (submitting) return;
    setSelectedWinner(team);
    setValidationError(null);
  }

  function validateSubmission(): string | null {
    if (!selectedWinner) {
      return 'Please select the winning team.';
    }

    // If scores are provided, validate them
    if (team1Score !== '' || team2Score !== '') {
      if (team1Score === '' || team2Score === '') {
        return 'Please enter scores for both teams or leave both empty.';
      }
      const s1 = Number(team1Score);
      const s2 = Number(team2Score);
      if (!Number.isInteger(s1) || !Number.isInteger(s2)) {
        return 'Scores must be non-negative integers.';
      }
      if (s1 < 0 || s2 < 0) {
        return 'Scores must be non-negative integers.';
      }
      if (s1 === s2) {
        return 'Scores cannot be tied.';
      }
    }

    return null;
  }

  async function handleSubmit() {
    const validationErr = validateSubmission();
    if (validationErr) {
      setValidationError(validationErr);
      return;
    }

    setSubmitting(true);
    setError(null);
    setValidationError(null);

    try {
      const s1 = team1Score !== '' ? Number(team1Score) : undefined;
      const s2 = team2Score !== '' ? Number(team2Score) : undefined;
      await completeMatchWithResult(sessionId, courtNumber, selectedWinner!, s1, s2);
      onComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete match';
      setError(message);
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    setError(null);
    setValidationError(null);

    try {
      await completeMatchSkipScore(sessionId, courtNumber);
      onComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to skip match';
      setError(message);
      setSubmitting(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  const duration = matchStartedAt ? getElapsedMinutes(matchStartedAt) : null;

  return (
    <div
      className="match-dialog"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="match-dialog__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-complete-title"
        aria-describedby={error || validationError ? 'match-complete-error' : undefined}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="match-dialog__header">
          <h2 id="match-complete-title" className="match-dialog__title">
            Court {courtNumber}
          </h2>
          {duration !== null && (
            <span className="match-dialog__duration">{duration}m</span>
          )}
        </div>

        {/* Team Cards */}
        <div className="match-dialog__teams">
          {/* Team 1 Card */}
          <div
            className={`match-dialog__team-card${selectedWinner === 'team1' ? ' match-dialog__team-card--selected' : ''}`}
            onClick={() => handleSelectWinner('team1')}
            role="radio"
            aria-checked={selectedWinner === 'team1'}
            aria-label={`Select Team 1 as winner: ${team1.map((p) => p.name).join(' and ')}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectWinner('team1');
              }
            }}
          >
            <div className="match-dialog__team-label">Team 1</div>
            <div className="match-dialog__team-players">
              {team1.map((player) => (
                <div key={player.id} className="match-dialog__player">
                  <span className="match-dialog__player-avatar"><PlayerAvatar name={player.name} size={32} /></span>
                  <span className="match-dialog__player-name">{player.name}</span>
                </div>
              ))}
            </div>
            {selectedWinner === 'team1' && (
              <div className="match-dialog__winner-badge">Winner</div>
            )}
          </div>

          {/* Team 2 Card */}
          <div
            className={`match-dialog__team-card${selectedWinner === 'team2' ? ' match-dialog__team-card--selected' : ''}`}
            onClick={() => handleSelectWinner('team2')}
            role="radio"
            aria-checked={selectedWinner === 'team2'}
            aria-label={`Select Team 2 as winner: ${team2.map((p) => p.name).join(' and ')}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelectWinner('team2');
              }
            }}
          >
            <div className="match-dialog__team-label">Team 2</div>
            <div className="match-dialog__team-players">
              {team2.map((player) => (
                <div key={player.id} className="match-dialog__player">
                  <span className="match-dialog__player-avatar"><PlayerAvatar name={player.name} size={32} /></span>
                  <span className="match-dialog__player-name">{player.name}</span>
                </div>
              ))}
            </div>
            {selectedWinner === 'team2' && (
              <div className="match-dialog__winner-badge">Winner</div>
            )}
          </div>
        </div>

        {/* Score Inputs */}
        <div className="match-dialog__scores">
          <div className="match-dialog__score-field">
            <label htmlFor="team1-score" className="match-dialog__score-label">
              Team 1 Score
            </label>
            <input
              id="team1-score"
              type="number"
              min={0}
              value={team1Score}
              onChange={(e) => handleTeam1ScoreChange(e.target.value)}
              disabled={submitting}
              placeholder="0"
              className="match-dialog__score-input"
              aria-label={`Score for Team 1: ${team1.map((p) => p.name).join(' and ')}`}
            />
          </div>
          <div className="match-dialog__score-field">
            <label htmlFor="team2-score" className="match-dialog__score-label">
              Team 2 Score
            </label>
            <input
              id="team2-score"
              type="number"
              min={0}
              value={team2Score}
              onChange={(e) => handleTeam2ScoreChange(e.target.value)}
              disabled={submitting}
              placeholder="0"
              className="match-dialog__score-input"
              aria-label={`Score for Team 2: ${team2.map((p) => p.name).join(' and ')}`}
            />
          </div>
        </div>

        {/* Validation error */}
        {validationError && (
          <p
            id="match-complete-error"
            role="alert"
            className="match-dialog__error"
          >
            {validationError}
          </p>
        )}

        {/* API error message */}
        {error && !validationError && (
          <p
            id="match-complete-error"
            role="alert"
            className="match-dialog__error"
          >
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="match-dialog__footer">
          <button
            onClick={handleSkip}
            disabled={submitting}
            className="match-dialog__btn match-dialog__btn--secondary"
            aria-label="Skip match without recording result"
          >
            Skip Match
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="match-dialog__btn match-dialog__btn--primary"
            aria-label="Confirm match result"
          >
            {submitting ? 'Submitting...' : 'Confirm Result'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MatchCompleteDialog;
