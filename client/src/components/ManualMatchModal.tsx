import { useEffect, useState } from 'react';
import { getSessionLive, startMatchManual } from '../api';
import type { QueueEntry } from '../types';

interface Props {
  sessionId: string;
  courtNumber: number;
  gameMode: 'doubles' | 'singles';
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualMatchModal({ sessionId, courtNumber, gameMode, onClose, onSuccess }: Props) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [team1, setTeam1] = useState<string[]>([]);
  const [team2, setTeam2] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perTeam = gameMode === 'singles' ? 1 : 2;

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await getSessionLive(sessionId);
        if (!mounted) return;
        const q = (data.queue || []).map((entry: any) => ({
          playerId: entry.playerId,
          playerName: entry.playerName,
          sessionId: entry.sessionId,
          position: entry.position,
          isPairSlot: entry.isPairSlot ?? false,
          pairId: entry.pairId ?? null,
          partnerPlayerId: entry.partnerPlayerId ?? null,
          partnerPlayerName: entry.partnerPlayerName ?? null,
        })).sort((a: QueueEntry, b: QueueEntry) => a.position - b.position);
        setQueue(q);
      } catch {
        setError('Failed to load queue');
      }
    }
    load();
    return () => { mounted = false; };
  }, [sessionId]);

  const nameMap = new Map(queue.map(e => [e.playerId, e.playerName]));
  const selected = new Set([...team1, ...team2]);

  // Build a set of player IDs excluded from the available list.
  // For pair slots, exclude both anchor and partner if either is in a team.
  const excludedIds = new Set<string>();
  for (const entry of queue) {
    if (entry.isPairSlot && entry.partnerPlayerId) {
      if (selected.has(entry.playerId) || selected.has(entry.partnerPlayerId)) {
        excludedIds.add(entry.playerId);
        excludedIds.add(entry.partnerPlayerId);
      }
    } else {
      if (selected.has(entry.playerId)) {
        excludedIds.add(entry.playerId);
      }
    }
  }
  // Expand pair slots into two separate rows for the list display.
  // Each row carries a reference to the original queue entry so clicking
  // either one adds both players to the team.
  interface DisplayItem {
    key: string;
    name: string;
    entry: QueueEntry;
  }
  const displayItems: DisplayItem[] = [];
  for (const entry of queue) {
    if (entry.isPairSlot && entry.partnerPlayerId) {
      displayItems.push({ key: entry.playerId, name: entry.playerName, entry });
      displayItems.push({ key: entry.partnerPlayerId, name: entry.partnerPlayerName || entry.partnerPlayerId, entry });
    } else {
      displayItems.push({ key: entry.playerId, name: entry.playerName, entry });
    }
  }

  const available = displayItems.filter(item => !excludedIds.has(item.key));

  function addToTeam(entry: QueueEntry) {
    if (entry.isPairSlot && entry.partnerPlayerId) {
      if (team1.length + 2 <= perTeam) {
        setTeam1(prev => [...prev, entry.playerId, entry.partnerPlayerId!]);
      } else if (team2.length + 2 <= perTeam) {
        setTeam2(prev => [...prev, entry.playerId, entry.partnerPlayerId!]);
      }
    } else {
      if (team1.length < perTeam) {
        setTeam1(prev => [...prev, entry.playerId]);
      } else if (team2.length < perTeam) {
        setTeam2(prev => [...prev, entry.playerId]);
      }
    }
  }

  function removeFromTeam(playerId: string) {
    const entry = queue.find(e => e.playerId === playerId || e.partnerPlayerId === playerId);
    if (entry?.isPairSlot) {
      const anchorId = entry.playerId;
      setTeam1(prev => prev.filter(id => id !== anchorId && id !== entry.partnerPlayerId));
      setTeam2(prev => prev.filter(id => id !== anchorId && id !== entry.partnerPlayerId));
    } else {
      setTeam1(prev => prev.filter(id => id !== playerId));
      setTeam2(prev => prev.filter(id => id !== playerId));
    }
  }

  function renderTeamSlot(teamIds: string[], teamIndex: number) {
    const rendered = new Set<string>();
    const slots: JSX.Element[] = [];

    for (let i = 0; i < perTeam; i++) {
      const pid = teamIds[i];
      if (!pid || rendered.has(pid)) {
        if (!pid) {
          slots.push(
            <div key={`empty-${teamIndex}-${i}`} className="manual-modal__slot manual-modal__slot--empty">
              <span className="manual-modal__slot-placeholder">Empty slot</span>
            </div>
          );
        }
        continue;
      }

      const entry = queue.find(e => e.playerId === pid);
      if (entry?.isPairSlot && entry.partnerPlayerId && teamIds.includes(entry.partnerPlayerId)) {
        rendered.add(pid);
        rendered.add(entry.partnerPlayerId);
        slots.push(
          <div key={pid} className={`manual-modal__slot manual-modal__slot--filled manual-modal__slot--team${teamIndex}`}>
            <span className="manual-modal__slot-name">
              <span className="manual-modal__pair-icon">🔗</span>
              {entry.playerName} & {entry.partnerPlayerName}
            </span>
            <button
              className="manual-modal__slot-remove"
              onClick={() => removeFromTeam(pid)}
              aria-label={`Remove ${entry.playerName} and ${entry.partnerPlayerName}`}
            >
              ✕
            </button>
          </div>
        );
      } else {
        rendered.add(pid);
        slots.push(
          <div key={pid} className={`manual-modal__slot manual-modal__slot--filled manual-modal__slot--team${teamIndex}`}>
            <span className="manual-modal__slot-name">
              {nameMap.get(pid) || pid}
            </span>
            <button
              className="manual-modal__slot-remove"
              onClick={() => removeFromTeam(pid)}
              aria-label={`Remove ${nameMap.get(pid) || pid}`}
            >
              ✕
            </button>
          </div>
        );
      }
    }
    return slots;
  }

  async function handleStart() {
    setError(null);
    if (team1.length !== perTeam || team2.length !== perTeam) {
      setError(`Select exactly ${perTeam} player(s) per team`);
      return;
    }
    setLoading(true);
    try {
      await startMatchManual(sessionId, courtNumber, [...team1, ...team2]);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start match');
    } finally {
      setLoading(false);
    }
  }

  const isFull = team1.length === perTeam && team2.length === perTeam;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="manual-modal" onClick={e => e.stopPropagation()}>
        <div className="manual-modal__header">
          <div className="manual-modal__header-text">
            <h3 className="manual-modal__title">Court {courtNumber}</h3>
            <p className="manual-modal__subtitle">
              Select {perTeam} player{perTeam > 1 ? 's per team' : ''} to start a match
            </p>
          </div>
          <button className="manual-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="manual-modal__body">
          <div className="manual-modal__teams">
            <div className="manual-modal__team manual-modal__team--green">
              <div className="manual-modal__team-header">
                <span className="manual-modal__team-label">Team 1</span>
                <span className={`manual-modal__team-count${team1.length === perTeam ? ' manual-modal__team-count--full' : ''}`}>
                  {team1.length}/{perTeam}
                </span>
              </div>
              <div className="manual-modal__slots">
                {renderTeamSlot(team1, 1)}
              </div>
            </div>

            <div className="manual-modal__vs">vs</div>

            <div className="manual-modal__team manual-modal__team--blue">
              <div className="manual-modal__team-header">
                <span className="manual-modal__team-label">Team 2</span>
                <span className={`manual-modal__team-count${team2.length === perTeam ? ' manual-modal__team-count--full' : ''}`}>
                  {team2.length}/{perTeam}
                </span>
              </div>
              <div className="manual-modal__slots">
                {renderTeamSlot(team2, 2)}
              </div>
            </div>
          </div>

          <div className="manual-modal__available">
            <div className="manual-modal__available-header">
              <span className="manual-modal__available-label">Queue</span>
              <span className="manual-modal__available-count">{available.length}</span>
            </div>
            <div className="manual-modal__player-list">
              {available.length === 0 && (
                <div className="manual-modal__empty">No players in queue</div>
              )}
              {available.map(item => {
                const isPaired = item.entry.isPairSlot;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`manual-modal__player${isPaired ? ' manual-modal__player--paired' : ''}`}
                    onClick={() => addToTeam(item.entry)}
                  >
                    {isPaired && (
                      <span className="manual-modal__player-pair-icon">🔗</span>
                    )}
                    <span className="manual-modal__player-names">
                      <span>{item.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="modal__error" style={{ marginTop: 'var(--space-sm)' }}>{error}</div>}
        </div>

        <div className="manual-modal__footer">
          <button onClick={onClose} className="btn btn--secondary">Cancel</button>
          <button
            onClick={handleStart}
            className="btn btn--primary"
            disabled={loading || !isFull}
          >
            {loading ? 'Starting…' : 'Start Match'}
          </button>
        </div>
      </div>
    </div>
  );
}
