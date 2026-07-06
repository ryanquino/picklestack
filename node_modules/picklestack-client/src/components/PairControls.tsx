import { useState } from 'react';
import { createFixedPair, dissolveFixedPair } from '../api';

interface QueueEntry {
  playerId: string;
  playerName: string;
  isPairSlot?: boolean;
  pairId?: string | null;
  partnerPlayerName?: string | null;
}

interface PairControlsProps {
  sessionId: string;
  queue: QueueEntry[];
  onPairChanged: () => void;
}

/**
 * PairControls provides organizer actions for creating and dissolving fixed pairs.
 * Modernized UI with card-based layout matching the app's design system.
 */
function PairControls({ sessionId, queue, onPairChanged }: PairControlsProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dissolvingPairId, setDissolvingPairId] = useState<string | null>(null);

  const individualPlayers = queue.filter((entry) => !entry.isPairSlot);
  const pairedSlots = queue.filter((entry) => entry.isPairSlot && entry.pairId);

  function handleToggleSelectionMode() {
    setSelectionMode((prev) => !prev);
    setSelectedPlayerIds([]);
    setError(null);
  }

  function handleSelectPlayer(playerId: string) {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 2) {
        return [prev[0], playerId];
      }
      return [...prev, playerId];
    });
    setError(null);
  }

  async function handleCreatePair() {
    if (selectedPlayerIds.length !== 2) return;

    setLoading(true);
    setError(null);
    try {
      await createFixedPair(sessionId, selectedPlayerIds[0], selectedPlayerIds[1]);
      setSelectionMode(false);
      setSelectedPlayerIds([]);
      onPairChanged();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create pair';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDissolvePair(pairId: string) {
    setDissolvingPairId(pairId);
    setError(null);
    try {
      await dissolveFixedPair(sessionId, pairId);
      onPairChanged();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to dissolve pair';
      setError(message);
    } finally {
      setDissolvingPairId(null);
    }
  }

  function handleCancel() {
    setSelectionMode(false);
    setSelectedPlayerIds([]);
    setError(null);
  }

  return (
    <div className="pair-controls">
      {/* Error display */}
      {error && (
        <div className="pair-controls__error" role="alert">
          <span className="pair-controls__error-icon">⚠</span>
          {error}
        </div>
      )}

      {/* Existing pairs section */}
      {pairedSlots.length > 0 && (
        <div className="pair-controls__pairs-section">
          <div className="pair-controls__section-header">
            <span className="pair-controls__section-title">Fixed Pairs</span>
            <span className="pair-controls__badge">{pairedSlots.length}</span>
          </div>
          <div className="pair-controls__pairs-grid">
            {pairedSlots.map((entry) => (
              <div key={entry.pairId} className="pair-controls__pair-card">
                <div className="pair-controls__pair-info">
                  <span className="pair-controls__pair-icon">🔗</span>
                  <div className="pair-controls__pair-names">
                    <span className="pair-controls__pair-name">{entry.playerName}</span>
                    <span className="pair-controls__pair-separator">&</span>
                    <span className="pair-controls__pair-name">{entry.partnerPlayerName}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDissolvePair(entry.pairId!)}
                  disabled={dissolvingPairId === entry.pairId}
                  className="pair-controls__unlink-btn"
                  aria-label={`Dissolve pair: ${entry.playerName} and ${entry.partnerPlayerName}`}
                  title="Unlink pair"
                >
                  {dissolvingPairId === entry.pairId ? (
                    <span className="pair-controls__spinner" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M6.5 6.5L9.5 9.5M9.5 6.5L6.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create pair section */}
      {!selectionMode ? (
        <button
          type="button"
          onClick={handleToggleSelectionMode}
          className="pair-controls__create-btn"
          disabled={individualPlayers.length < 2}
          aria-label="Pair players"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 8H7M9 8H12M8 4V7M8 9V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M3 5.5C3 4.12 4.12 3 5.5 3M10.5 3C11.88 3 13 4.12 13 5.5M13 10.5C13 11.88 11.88 13 10.5 13M5.5 13C4.12 13 3 11.88 3 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span>Pair Players</span>
        </button>
      ) : (
        <div className="pair-controls__selection-card">
          <div className="pair-controls__selection-header">
            <span className="pair-controls__selection-title">Select two players to pair</span>
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="pair-controls__close-btn"
              aria-label="Cancel pair selection"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <ul className="pair-controls__player-list" role="listbox" aria-label="Select players to pair">
            {individualPlayers.map((entry) => {
              const isSelected = selectedPlayerIds.includes(entry.playerId);
              return (
                <li key={entry.playerId} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => handleSelectPlayer(entry.playerId)}
                    className={`pair-controls__player-chip${isSelected ? ' pair-controls__player-chip--selected' : ''}`}
                    aria-pressed={isSelected}
                  >
                    <span className="pair-controls__check-circle">
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M3 6L5.5 8.5L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span className="pair-controls__player-name">{entry.playerName}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="pair-controls__selection-footer">
            <button
              type="button"
              onClick={handleCreatePair}
              disabled={selectedPlayerIds.length !== 2 || loading}
              className="pair-controls__confirm-btn"
              aria-label="Confirm pair creation"
            >
              {loading ? (
                <>
                  <span className="pair-controls__spinner" />
                  Pairing…
                </>
              ) : (
                <>
                  <span>🔗</span>
                  Link Pair
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PairControls;
