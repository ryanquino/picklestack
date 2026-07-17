import { useState } from 'react';
import type { StarRating, GameMode, MatchingMode, Achievement, FixedPair } from '../types';
import { dissolveFixedPair } from '../api';
import CheckInForm from './CheckInForm';
import QueueList from './QueueList';

interface EnrichedQueueEntry {
  playerId: string;
  sessionId: string;
  position: number;
  playerName: string;
  rating?: number;
  starRating?: StarRating;
  wins?: number;
  losses?: number;
  winRate?: number;
  streak?: number;
  isMvp?: boolean;
  achievements?: Achievement[];
  isPairSlot?: boolean;
  pairId?: string | null;
  partnerPlayerId?: string | null;
  partnerPlayerName?: string | null;
}

interface QueuePanelProps {
  queue: EnrichedQueueEntry[];
  sessionId: string;
  gameMode: GameMode;
  matchingMode: MatchingMode;
  diversity?: Record<string, number>;
  waitEstimates?: Record<string, number | null>;
  nextMatchPlayerIds?: string[];
  fixedPairs?: FixedPair[];
  activeMatchPlayerIds?: string[];
  variant?: 'default' | 'winners' | 'losers' | 'neutral';
  onMoveUp: (playerId: string) => Promise<void>;
  onMoveDown: (playerId: string) => Promise<void>;
  onRemove: (playerId: string) => Promise<void>;
  onPlayerClick: (playerId: string) => void;
  onCheckIn: (name: string, starRating: StarRating) => Promise<void>;
  onPairChanged?: () => void;
  onStarRatingChange?: (playerId: string, starRating: number) => void;
}

function QueuePanel({
  queue,
  sessionId,
  gameMode,
  matchingMode,
  diversity,
  waitEstimates,
  nextMatchPlayerIds,
  fixedPairs,
  activeMatchPlayerIds,
  variant = 'default',
  onMoveUp,
  onMoveDown,
  onRemove,
  onPlayerClick,
  onCheckIn,
  onPairChanged,
  onStarRatingChange,
}: QueuePanelProps) {
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [dissolveConfirmId, setDissolveConfirmId] = useState<string | null>(null);

  async function handleCheckIn(name: string, starRating: StarRating) {
    await onCheckIn(name, starRating);
    setShowCheckIn(false);
  }

  return (
    <div className={`queue-panel${variant === 'winners' ? ' queue-panel--winners' : variant === 'losers' ? ' queue-panel--losers' : variant === 'neutral' ? ' queue-panel--neutral' : ''}`}>
      <div className="queue-panel__header">
        <div className="flex items-center gap-sm">
          <h2 className="m-0 text-lg font-semibold">
            {variant === 'winners' ? '🏆 WINNERS' : variant === 'losers' ? '💪 LOSERS' : variant === 'neutral' ? '⏳ NEUTRAL' : 'QUEUE'}
          </h2>
          <span className="status-badge status-badge--available">{queue.length}</span>
        </div>
        {variant === 'default' && (
          <button
            type="button"
            onClick={() => setShowCheckIn((prev) => !prev)}
            className="session-header__btn"
            aria-label="Add player"
            aria-expanded={showCheckIn}
          >
            <span className="session-header__btn-icon">+</span>
            <span className="session-header__btn-label">Add Player</span>
          </button>
        )}
      </div>

      {showCheckIn && variant === 'default' && (
        <div className="queue-panel__checkin-area">
          <CheckInForm sessionId={sessionId} onCheckIn={handleCheckIn} />
        </div>
      )}

      <div className="queue-panel__list">
        <QueueList
          queue={queue}
          sessionId={sessionId}
          gameMode={gameMode}
          matchingMode={matchingMode}
          diversity={diversity}
          waitEstimates={waitEstimates}
          nextMatchPlayerIds={nextMatchPlayerIds}
          variant={variant}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
          onPlayerClick={onPlayerClick}
          onPairChanged={onPairChanged}
          onStarRatingChange={onStarRatingChange}
        />
      </div>

      {fixedPairs && fixedPairs.length > 0 && (
        <div className="pair-controls__pairs-compact">
          <span className="pair-controls__section-title">Paired</span>
          {fixedPairs.map((pair) => {
            const inMatch = activeMatchPlayerIds?.includes(pair.player1Id) || activeMatchPlayerIds?.includes(pair.player2Id);

            return (
              <span
                key={pair.id}
                className={`pair-controls__pair-chip${inMatch ? ' pair-controls__pair-chip--disabled' : ''}`}
                onClick={inMatch ? undefined : () => setDissolveConfirmId(pair.id)}
                style={{ cursor: inMatch ? 'default' : 'pointer', opacity: inMatch ? 0.5 : 1 }}
                title={inMatch ? 'Cannot dissolve while in match' : 'Click to manage pair'}
              >
                🔗 {pair.player1Name || pair.player1Id} & {pair.player2Name || pair.player2Id}
              </span>
            );
          })}
        </div>
      )}

      {/* Dissolve pair modal */}
      {dissolveConfirmId && fixedPairs && (() => {
        const pair = fixedPairs.find(p => p.id === dissolveConfirmId);
        if (!pair) return null;
        return (
          <div className="modal-overlay" onClick={() => setDissolveConfirmId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', padding: 'var(--space-xl)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <h3 style={{ margin: 0 }}>Manage Pair</h3>
                <button
                  onClick={() => setDissolveConfirmId(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                >✕</button>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
                {pair.player1Name || pair.player1Id} is paired with {pair.player2Name || pair.player2Id}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', alignItems: 'center' }}>
                <button
                  onClick={async () => {
                    await dissolveFixedPair(sessionId, pair.id);
                    setDissolveConfirmId(null);
                    onPairChanged?.();
                  }}
                  style={{
                    padding: '0.6rem 1.2rem',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-danger)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  Dissolve Pair
                </button>
                <button
                  onClick={() => setDissolveConfirmId(null)}
                  style={{
                    padding: '0.4rem 1rem',
                    border: 'none',
                    background: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default QueuePanel;
