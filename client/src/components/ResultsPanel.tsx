import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getCasualMatchResults, updateMatchResult } from '../api';
import type { CasualMatchResult } from '../types';
import PlayerAvatar from './PlayerAvatar';

interface ResultsPanelProps {
  sessionId: string;
  onChanged?: () => void;
}

function formatScore(score: number | null): string {
  return score === null || score === undefined ? '—' : String(score);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ResultsPanel({ sessionId, onChanged }: ResultsPanelProps) {
  const [results, setResults] = useState<CasualMatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CasualMatchResult | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      const data = await getCasualMatchResults(sessionId);
      setResults(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 8000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  async function handleEditSaved() {
    setEditing(null);
    await fetchResults();
    onChanged?.();
  }

  return (
    <div className="results-panel glass-card" style={{ padding: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          Match Results <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>({results.length})</span>
        </h3>
      </div>

      {error && (
        <div className="toast toast--error" style={{ marginBottom: '1rem' }}>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>Loading results...</p>
      ) : results.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>No completed matches yet.</p>
      ) : (
        <div className="results-panel__list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {results.map((r) => {
            const team1Names = r.playerNames.slice(0, 2);
            const team2Names = r.playerNames.slice(2, 4);
            const winnerIsTeam1 = r.winningTeam === 'team1';
            return (
              <div key={r.matchId} className="results-panel__item">
                <div className="results-panel__court">#{r.matchIndex}</div>
                <div className="results-panel__teams">
                  <div className={`results-panel__team${winnerIsTeam1 ? ' results-panel__team--winner' : ''}`}>
                    <span className="results-panel__names">{team1Names.join(' & ')}</span>
                    <span className="results-panel__score">{formatScore(r.team1Score)}</span>
                  </div>
                  <div className="results-panel__vs">vs</div>
                  <div className={`results-panel__team${!winnerIsTeam1 ? ' results-panel__team--winner' : ''}`}>
                    <span className="results-panel__names">{team2Names.join(' & ')}</span>
                    <span className="results-panel__score">{formatScore(r.team2Score)}</span>
                  </div>
                </div>
                <div className="results-panel__meta">{formatTime(r.updatedAt)}</div>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => setEditing(r)}
                >
                  Edit
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing &&
        createPortal(
          <EditScoreModal
            sessionId={sessionId}
            result={editing}
            onClose={() => setEditing(null)}
            onSaved={handleEditSaved}
          />,
          document.body
        )}
    </div>
  );
}

interface EditScoreModalProps {
  sessionId: string;
  result: CasualMatchResult;
  onClose: () => void;
  onSaved: () => void;
}

function EditScoreModal({ sessionId, result, onClose, onSaved }: EditScoreModalProps) {
  const [team1Score, setTeam1Score] = useState<string>(
    result.team1Score === null || result.team1Score === undefined ? '' : String(result.team1Score)
  );
  const [team2Score, setTeam2Score] = useState<string>(
    result.team2Score === null || result.team2Score === undefined ? '' : String(result.team2Score)
  );
  const [selectedWinner, setSelectedWinner] = useState<'team1' | 'team2' | null>(result.winningTeam);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const team1Names = result.playerNames.slice(0, 2);
  const team2Names = result.playerNames.slice(2, 4);

  // Auto-derive winner from scores when both are valid and not tied
  useEffect(() => {
    const s1 = team1Score === '' ? NaN : Number(team1Score);
    const s2 = team2Score === '' ? NaN : Number(team2Score);
    if (!isNaN(s1) && !isNaN(s2) && s1 >= 0 && s2 >= 0 && s1 !== s2) {
      setSelectedWinner(s1 > s2 ? 'team1' : 'team2');
    }
  }, [team1Score, team2Score]);

  function validateSubmission(): string | null {
    if (!selectedWinner) {
      return 'Please select the winning team.';
    }
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
      await updateMatchResult(sessionId, result.matchId, {
        winningTeam: selectedWinner!,
        team1Score: s1,
        team2Score: s2,
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update match');
      setSubmitting(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !submitting) {
      onClose();
    }
  }

  return (
    <div className="match-dialog" role="presentation" onClick={handleBackdropClick}>
      <div
        className="match-dialog__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-score-title"
      >
        <div className="match-dialog__header">
          <h2 id="edit-score-title" className="match-dialog__title">
            Edit Result · Match #{result.matchIndex}
          </h2>
        </div>

        <div className="match-dialog__teams">
          <div
            className={`match-dialog__team-card${selectedWinner === 'team1' ? ' match-dialog__team-card--selected' : ''}`}
            onClick={() => { setSelectedWinner('team1'); setValidationError(null); }}
            role="radio"
            aria-checked={selectedWinner === 'team1'}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedWinner('team1'); setValidationError(null); } }}
          >
            <div className="match-dialog__team-label">Team 1</div>
            <div className="match-dialog__team-players">
              {team1Names.map((name, i) => (
                <div key={i} className="match-dialog__player">
                  <PlayerAvatar name={name} size={32} />
                  <span className="match-dialog__player-name">{name}</span>
                </div>
              ))}
            </div>
            {selectedWinner === 'team1' && <div className="match-dialog__winner-badge">Winner</div>}
          </div>

          <div
            className={`match-dialog__team-card${selectedWinner === 'team2' ? ' match-dialog__team-card--selected' : ''}`}
            onClick={() => { setSelectedWinner('team2'); setValidationError(null); }}
            role="radio"
            aria-checked={selectedWinner === 'team2'}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedWinner('team2'); setValidationError(null); } }}
          >
            <div className="match-dialog__team-label">Team 2</div>
            <div className="match-dialog__team-players">
              {team2Names.map((name, i) => (
                <div key={i} className="match-dialog__player">
                  <PlayerAvatar name={name} size={32} />
                  <span className="match-dialog__player-name">{name}</span>
                </div>
              ))}
            </div>
            {selectedWinner === 'team2' && <div className="match-dialog__winner-badge">Winner</div>}
          </div>
        </div>

        <div className="match-dialog__scores">
          <div className="match-dialog__score-field">
            <label htmlFor="edit-team1-score" className="match-dialog__score-label">Team 1 Score</label>
            <input
              id="edit-team1-score"
              type="number"
              min={0}
              value={team1Score}
              onChange={(e) => { setTeam1Score(e.target.value); setValidationError(null); }}
              disabled={submitting}
              placeholder="0"
              className="match-dialog__score-input"
            />
          </div>
          <div className="match-dialog__score-field">
            <label htmlFor="edit-team2-score" className="match-dialog__score-label">Team 2 Score</label>
            <input
              id="edit-team2-score"
              type="number"
              min={0}
              value={team2Score}
              onChange={(e) => { setTeam2Score(e.target.value); setValidationError(null); }}
              disabled={submitting}
              placeholder="0"
              className="match-dialog__score-input"
            />
          </div>
        </div>

        {validationError && (
          <p role="alert" className="match-dialog__error">{validationError}</p>
        )}
        {error && !validationError && (
          <p role="alert" className="match-dialog__error">{error}</p>
        )}

        <div className="match-dialog__footer">
          <button
            onClick={onClose}
            disabled={submitting}
            className="match-dialog__btn match-dialog__btn--secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="match-dialog__btn match-dialog__btn--primary"
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
