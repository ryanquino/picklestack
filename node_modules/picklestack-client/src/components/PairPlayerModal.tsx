import { useMemo, useState } from 'react';
import { createFixedPair, dissolveFixedPair } from '../api';

interface QueueEntry {
  playerId: string;
  playerName: string;
  isPairSlot?: boolean;
  pairId?: string | null;
  partnerPlayerId?: string | null;
  partnerPlayerName?: string | null;
}

interface PairPlayerModalProps {
  sessionId: string;
  player: QueueEntry;
  queue: QueueEntry[];
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Modal for pairing/unpairing a player.
 * If the player is already paired, shows option to dissolve.
 * If unpaired, shows a searchable list of available players to pair with.
 */
export default function PairPlayerModal({
  sessionId,
  player,
  queue,
  onClose,
  onSuccess,
}: PairPlayerModalProps) {
  const [query, setQuery] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaired = player.isPairSlot && player.pairId;

  // Available players to pair with (individual players, excluding the current player)
  const availablePlayers = useMemo(() => {
    return queue.filter(
      (entry) => !entry.isPairSlot && entry.playerId !== player.playerId
    );
  }, [queue, player.playerId]);

  const filteredPlayers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return availablePlayers;
    return availablePlayers.filter((p) =>
      p.playerName.toLowerCase().includes(term)
    );
  }, [availablePlayers, query]);

  async function handlePair() {
    if (!selectedPlayerId) return;
    setLoading(true);
    setError(null);
    try {
      await createFixedPair(sessionId, player.playerId, selectedPlayerId);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pair');
    } finally {
      setLoading(false);
    }
  }

  async function handleDissolve() {
    if (!player.pairId) return;
    setLoading(true);
    setError(null);
    try {
      await dissolveFixedPair(sessionId, player.pairId);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dissolve pair');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal--pair-player">
        <div className="modal__header">
          <div>
            <h3>{isPaired ? 'Manage Pair' : 'Pair Player'}</h3>
            <p className="modal__subtitle">
              {isPaired
                ? `${player.playerName} is paired with ${player.partnerPlayerName}`
                : `Search for a player to pair with ${player.playerName}`}
            </p>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal__body">
          {isPaired ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>
                🔗 {player.playerName} & {player.partnerPlayerName}
              </p>
              <button
                type="button"
                onClick={handleDissolve}
                disabled={loading}
                className="btn btn--danger"
              >
                {loading ? 'Dissolving…' : 'Dissolve Pair'}
              </button>
            </div>
          ) : (
            <>
              <input
                className="replace-search__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search players..."
                autoComplete="off"
                autoFocus
              />

              <div className="replace-list" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {filteredPlayers.length === 0 ? (
                  <div className="replace-list__empty">
                    {availablePlayers.length === 0
                      ? 'No unpaired players available.'
                      : 'No players found.'}
                  </div>
                ) : (
                  filteredPlayers.map((p) => (
                    <button
                      key={p.playerId}
                      type="button"
                      className={`replace-list__item ${selectedPlayerId === p.playerId ? 'replace-list__item--selected' : ''}`}
                      onClick={() => setSelectedPlayerId(p.playerId)}
                    >
                      <div className="replace-list__item-main">
                        <span className="replace-list__item-name">{p.playerName}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {error && <div className="modal__error">{error}</div>}
        </div>

        <div className="modal__footer modal__footer--spaced">
          <button onClick={onClose} className="btn btn--secondary">Cancel</button>
          {!isPaired && (
            <button
              onClick={handlePair}
              className="btn btn--primary"
              disabled={loading || !selectedPlayerId}
            >
              {loading ? 'Pairing…' : '🔗 Pair'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
