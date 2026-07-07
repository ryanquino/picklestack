import { useState } from 'react';
import type { PlayerStats, Achievement, StarRating, GameMode, MatchingMode } from '../types';
import PlayerProfileCard from './PlayerProfileCard';
import PairPlayerModal from './PairPlayerModal';

interface QueueEntry {
  playerId: string;
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

interface QueueListProps {
  queue: QueueEntry[];
  sessionId?: string;
  gameMode?: GameMode;
  matchingMode?: MatchingMode;
  diversity?: Record<string, number>;
  waitEstimates?: Record<string, number | null>;
  onMoveUp: (playerId: string) => Promise<void>;
  onMoveDown: (playerId: string) => Promise<void>;
  onRemove: (playerId: string) => Promise<void>;
  onPlayerClick?: (playerId: string) => void;
  onPairChanged?: () => void;
  onStarRatingChange?: (playerId: string, starRating: number) => void;
}

/**
 * Computes On Deck player IDs based on queue state, game mode, and matching mode.
 *
 * Rules:
 * - Smart Pairing: first min(N, 8) players
 * - Non-smart + Doubles: first min(N, 4) players
 * - Non-smart + Singles: first min(N, 2) players
 */
function getOnDeckPlayerIds(
  queue: QueueEntry[],
  gameMode: GameMode,
  matchingMode: MatchingMode
): Set<string> {
  let count: number;

  if (matchingMode === 'smart') {
    count = Math.min(queue.length, 8);
  } else if (gameMode === 'doubles') {
    count = Math.min(queue.length, 4);
  } else {
    count = Math.min(queue.length, 2);
  }

  return new Set(queue.slice(0, count).map((entry) => entry.playerId));
}

/** Render filled star icons for the given star rating (1-5), optionally editable */
function StarRatingIcons({ starRating, onChangeRating }: { starRating: number; onChangeRating?: (rating: number) => void }) {
  return (
    <span
      className="queue-item__stars"
      aria-label={`${starRating} out of 5 stars`}
    >
      {([1, 2, 3, 4, 5] as const).map((star) => (
        <span
          key={star}
          onClick={onChangeRating ? (e) => { e.stopPropagation(); onChangeRating(star); } : undefined}
          style={{
            cursor: onChangeRating ? 'pointer' : 'default',
            color: star <= starRating ? '#f59e0b' : '#d1d5db',
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

/** Render streak badge: 🔥 for win streak ≥ 2, ❄️ for loss streak ≥ 2 */
function StreakBadge({ streak }: { streak: number }) {
  if (Math.abs(streak) < 2) return null;

  if (streak > 0) {
    return (
      <span className="queue-item__streak" aria-label={`${streak} win streak`}>
        🔥
      </span>
    );
  }

  const lossCount = Math.abs(streak);
  return (
    <span className="queue-item__streak" aria-label={`${lossCount} loss streak`}>
      ❄️
    </span>
  );
}

function QueueList({ queue, sessionId, gameMode = 'doubles', matchingMode = 'balanced', diversity, waitEstimates, onMoveUp, onMoveDown, onRemove, onPlayerClick, onPairChanged, onStarRatingChange }: QueueListProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [pairModalPlayerId, setPairModalPlayerId] = useState<string | null>(null);
  const onDeckSet = getOnDeckPlayerIds(queue, gameMode, matchingMode);

  if (queue.length === 0) {
    return (
      <div>
        <h2>Queue</h2>
        <p className="text-secondary">No players in the queue yet.</p>
      </div>
    );
  }

  const lastIndex = queue.length - 1;

  function handleNameClick(playerId: string) {
    if (onPlayerClick) {
      onPlayerClick(playerId);
    } else {
      setSelectedPlayerId(playerId);
    }
  }

  function getStatusDot(index: number, isOnDeck: boolean): string {
    // First 4 = next match (green), rest of on-deck pool = yellow, waiting = gray
    const playersPerMatch = gameMode === 'singles' ? 2 : 4;
    if (index < playersPerMatch) return '🟢';
    if (isOnDeck) return '🟡';
    return '⚪';
  }

  function getWaitLabel(index: number, playerId: string, isOnDeck: boolean): string {
    const playersPerMatch = gameMode === 'singles' ? 2 : 4;
    if (index < playersPerMatch) return 'Next';
    if (isOnDeck) return 'On Deck';
    if (waitEstimates && waitEstimates[playerId] != null) {
      return `${waitEstimates[playerId]}m`;
    }
    return '';
  }

  return (
    <div>
      <h2>Queue</h2>
      <ul className="avatar-queue">
        {queue.map((entry, index) => {
          const isOnDeck = onDeckSet.has(entry.playerId);
          const isPair = entry.isPairSlot === true;
          const isExpanded = expandedPlayerId === entry.playerId;
          const streak = entry.streak ?? 0;
          const wins = entry.wins ?? 0;
          const losses = entry.losses ?? 0;

          const displayName = isPair && entry.partnerPlayerName
            ? `${entry.playerName} & ${entry.partnerPlayerName}`
            : entry.playerName;

          const ariaLabel = isPair && entry.partnerPlayerName
            ? `${entry.playerName} and ${entry.partnerPlayerName} (paired)`
            : entry.playerName;

          const waitLabel = getWaitLabel(index, entry.playerId, isOnDeck);

          const playersPerMatch = gameMode === 'singles' ? 2 : 4;
          const isNextMatch = index < playersPerMatch;

          return (
            <li
              key={entry.playerId}
              className={`avatar-queue__item${isExpanded ? ' avatar-queue__item--expanded' : ''}${isNextMatch ? ' avatar-queue__item--next' : isOnDeck ? ' avatar-queue__item--ondeck' : ''}`}
            >
              {/* Compact row */}
              <div
                className="avatar-queue__row"
                onClick={() => setExpandedPlayerId(isExpanded ? null : entry.playerId)}
              >
                <span className="avatar-queue__dot" aria-hidden="true">{getStatusDot(index, isOnDeck)}</span>
                <span className="avatar-queue__name">
                  {isPair && <span className="avatar-queue__pair-icon">🔗</span>}
                  {displayName}
                  {streak >= 2 && <span className="avatar-queue__streak">🔥</span>}
                  {streak <= -2 && <span className="avatar-queue__streak">❄️</span>}
                </span>
                <span className="avatar-queue__record">{wins}-{losses}</span>
                <span className={`avatar-queue__wait${isNextMatch ? ' avatar-queue__wait--now' : isOnDeck ? ' avatar-queue__wait--ondeck' : ''}`}>
                  {waitLabel}
                </span>
                <span className="avatar-queue__chevron" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="avatar-queue__detail">
                  <div className="avatar-queue__stats">
                    <span>{wins}W-{losses}L</span>
                    {entry.starRating && (
                      <StarRatingIcons starRating={entry.starRating} />
                    )}
                    {diversity && diversity[entry.playerId] !== undefined && (
                      <span>{diversity[entry.playerId]}% div</span>
                    )}
                  </div>
                  <div className="avatar-queue__actions">
                    <button
                      onClick={() => handleNameClick(entry.playerId)}
                      className="avatar-queue__action-btn"
                      title="View profile"
                    >👤</button>
                    <button
                      onClick={() => setPairModalPlayerId(entry.playerId)}
                      className={`avatar-queue__action-btn${isPair ? ' avatar-queue__action-btn--active' : ''}`}
                      title={isPair ? 'Manage pair' : 'Pair'}
                    >🔗</button>
                    <button onClick={() => onMoveUp(entry.playerId)} disabled={index === 0} className="avatar-queue__action-btn">↑</button>
                    <button onClick={() => onMoveDown(entry.playerId)} disabled={index === lastIndex} className="avatar-queue__action-btn">↓</button>
                    <button onClick={() => onRemove(entry.playerId)} className="avatar-queue__action-btn avatar-queue__action-btn--remove">✕</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Internal profile card modal when no external handler is provided */}
      {!onPlayerClick && selectedPlayerId && sessionId && (
        <PlayerProfileCard
          sessionId={sessionId}
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          diversityPercentage={diversity?.[selectedPlayerId] ?? 0}
        />
      )}

      {/* Pair player modal */}
      {pairModalPlayerId && sessionId && (
        <PairPlayerModal
          sessionId={sessionId}
          player={queue.find(e => e.playerId === pairModalPlayerId)!}
          queue={queue}
          onClose={() => setPairModalPlayerId(null)}
          onSuccess={() => {
            setPairModalPlayerId(null);
            onPairChanged?.();
          }}
        />
      )}
    </div>
  );
}

export default QueueList;
