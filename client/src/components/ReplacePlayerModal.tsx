import { useEffect, useMemo, useState } from 'react';
import { getSessionLive, replacePlayer } from '../api';

interface QueueEntry {
  playerId: string;
  playerName: string;
  position: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
}

export default function ReplacePlayerModal({
  sessionId,
  courtNumber,
  oldPlayerId,
  onClose,
  onSuccess,
}: {
  sessionId: string;
  courtNumber: number;
  oldPlayerId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getSessionLive(sessionId);
        if (!data || !mounted) return;
        const q = (data.queue || []).map((entry: any) => ({
          playerId: entry.playerId,
          playerName: entry.playerName,
          position: entry.position,
          wins: typeof entry.wins === 'number' ? entry.wins : 0,
          losses: typeof entry.losses === 'number' ? entry.losses : 0,
          matchesPlayed: typeof entry.matchesPlayed === 'number'
            ? entry.matchesPlayed
            : typeof entry.wins === 'number' && typeof entry.losses === 'number'
            ? entry.wins + entry.losses
            : 0,
        })).sort((a: QueueEntry, b: QueueEntry) => a.position - b.position);
        setQueue(q);
      } catch (err) {
        setError('Failed to load queue');
      }
    }
    load();
    return () => { mounted = false; };
  }, [sessionId]);

  const filteredPlayers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return queue.filter((player) => player.playerName.toLowerCase().includes(term));
  }, [queue, query]);

  async function handleReplace() {
    setError(null);

    if (mode === 'auto') {
      if (queue.length === 0) {
        setError('Queue is empty — cannot auto-select a replacement.');
        return;
      }
      setLoading(true);
      try {
        await replacePlayer(sessionId, courtNumber, oldPlayerId, queue[0].playerId);
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Replace failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!selectedPlayerId) {
      setError('Select a replacement player.');
      return;
    }

    setLoading(true);
    try {
      await replacePlayer(sessionId, courtNumber, oldPlayerId, selectedPlayerId);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(value: string) {
    setMode('manual');
    setQuery(value);
    setSelectedPlayerId(null);
  }

  function handleAutoSelect() {
    setMode('auto');
    setQuery('');
    setSelectedPlayerId(null);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal modal--replace-player">
        <div className="modal__header">
          <div>
            <h3>Replace player</h3>
            <p className="modal__subtitle">Search queued players and choose a replacement for court {courtNumber}.</p>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal__body">
          <button
            type="button"
            className={`replace-auto-btn ${mode === 'auto' ? 'replace-auto-btn--active' : ''}`}
            onClick={handleAutoSelect}
            disabled={queue.length === 0}
          >
            Auto-select (from top of the queue)
          </button>

          <div className="replace-search-block">
            <p className="replace-manual-label">or search manually</p>
            <input
              className="replace-search__input"
              type="search"
              value={query}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search queued players..."
              autoComplete="off"
            />
          </div>

          {query.trim() !== '' && (
            <div className="replace-list">
              {filteredPlayers.length === 0 ? (
                <div className="replace-list__empty">No queued players found.</div>
              ) : (
                filteredPlayers.map((player) => (
                  <button
                    key={player.playerId}
                    type="button"
                    className={`replace-list__item ${selectedPlayerId === player.playerId ? 'replace-list__item--selected' : ''}`}
                    onClick={() => setSelectedPlayerId(player.playerId)}
                  >
                    <div className="replace-list__item-main">
                      <span className="replace-list__item-name">{player.playerName}</span>
                      <span className="replace-list__item-record">
                        {player.matchesPlayed ?? 0} games · {player.wins ?? 0}W-{player.losses ?? 0}L
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {error && <div className="modal__error">{error}</div>}
        </div>

        <div className="modal__footer modal__footer--spaced">
          <button onClick={onClose} className="btn btn--secondary">Cancel</button>
          <button
            onClick={handleReplace}
            className="btn btn--primary"
            disabled={loading || (mode === 'manual' && !selectedPlayerId) || (mode === 'auto' && queue.length === 0)}
          >
            {loading ? 'Replacing…' : 'Replace player'}
          </button>
        </div>
      </div>
    </div>
  );
}
