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

/** Render filled star icons for the given star rating (1-5) */
function StarRatingIcons({ starRating }: { starRating: number }) {
  const stars = '★'.repeat(starRating) + '☆'.repeat(5 - starRating);
  return (
    <span
      className="queue-item__stars"
      aria-label={`${starRating} out of 5 stars`}
    >
      {stars}
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

function QueueList({ queue, sessionId, gameMode = 'doubles', matchingMode = 'smart', diversity, waitEstimates, onMoveUp, onMoveDown, onRemove, onPlayerClick, onPairChanged }: QueueListProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
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

  return (
    <div>
      <h2>Queue</h2>
      <ol start={0} className="queue-panel__list">
        {queue.map((entry, index) => {
          const starRating = (entry.starRating ?? 3) as number;
          const rating = entry.rating ?? 1000;
          const wins = entry.wins ?? 0;
          const losses = entry.losses ?? 0;
          const streak = entry.streak ?? 0;
          const isOnDeck = onDeckSet.has(entry.playerId);
          const isPair = entry.isPairSlot === true;

          const itemClassName = [
            'queue-item',
            isOnDeck ? 'queue-item--on-deck' : '',
            isPair ? 'queue-item--pair' : '',
          ].filter(Boolean).join(' ');
          const nameClassName = `queue-item__name${isOnDeck ? ' queue-item__name--on-deck' : ''}`;

          const displayName = isPair && entry.partnerPlayerName
            ? `${entry.playerName} & ${entry.partnerPlayerName}`
            : entry.playerName;

          const ariaLabel = isPair && entry.partnerPlayerName
            ? `${entry.playerName} and ${entry.partnerPlayerName} (paired)`
            : entry.playerName;

          return (
            <li
              key={entry.playerId}
              className={itemClassName}
            >
              <span className="queue-position">{entry.position + 1}</span>

              <div className="queue-item__info">
                <div className="queue-item__name-row">
                  {isPair && (
                    <span className="queue-item__pair-icon" aria-label="Fixed pair">🔗</span>
                  )}
                  <button
                    onClick={() => handleNameClick(entry.playerId)}
                    aria-label={`View profile for ${ariaLabel}`}
                    className={`queue-item__name-btn ${nameClassName}`}
                  >
                    {displayName}
                  </button>
                </div>

                <div className="queue-item__details">
                  <StarRatingIcons starRating={starRating} />
                  <span className="queue-item__record">
                    {wins}-{losses}
                  </span>
                  {diversity && diversity[entry.playerId] !== undefined && (
                    <span className="queue-item__diversity" aria-label={`Diversity ${diversity[entry.playerId]}%`}>
                      {diversity[entry.playerId]}%
                    </span>
                  )}
                  <StreakBadge streak={streak} />
                </div>
                {waitEstimates && waitEstimates[entry.playerId] !== undefined && waitEstimates[entry.playerId] !== null && (
                  <div className="queue-item__wait-estimate">
                    {index === 0 ? (
                      <span className="queue-item__wait-estimate--next" aria-label="You're up next!">You're up next!</span>
                    ) : (
                      <span className="queue-item__wait-estimate--countdown" aria-label={`You're up in approximately ${waitEstimates[entry.playerId]} minutes`}>
                        You're up in ~{waitEstimates[entry.playerId]} min
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="queue-item__actions">
                <button
                  onClick={() => setPairModalPlayerId(entry.playerId)}
                  aria-label={isPair ? `Manage pair for ${ariaLabel}` : `Pair ${ariaLabel}`}
                  className={`queue-item__btn${isPair ? ' queue-item__btn--paired' : ''}`}
                  title={isPair ? 'Manage pair' : 'Pair player'}
                >
                  🔗
                </button>
                <button
                  onClick={() => onMoveUp(entry.playerId)}
                  disabled={index === 0}
                  aria-label={`Move ${ariaLabel} up`}
                  className="queue-item__btn"
                >
                  ↑
                </button>
                <button
                  onClick={() => onMoveDown(entry.playerId)}
                  disabled={index === lastIndex}
                  aria-label={`Move ${ariaLabel} down`}
                  className="queue-item__btn"
                >
                  ↓
                </button>
                <button
                  onClick={() => onRemove(entry.playerId)}
                  aria-label={`Remove ${ariaLabel}`}
                  className="queue-item__btn queue-item__btn--remove"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ol>

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
