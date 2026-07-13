import { useState, useEffect } from 'react';
import type { PlayerStats, Achievement, StarRating, GameMode, MatchingMode } from '../types';
import PlayerProfileCard from './PlayerProfileCard';
import PairPlayerModal from './PairPlayerModal';

/** Live wait timer — shows m:ss since a given timestamp */
function WaitTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(() => {
    const diff = Date.now() - new Date(since).getTime();
    return Math.max(0, Math.floor(diff / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(since).getTime();
      setElapsed(Math.max(0, Math.floor(diff / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [since]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return <span>{minutes}:{seconds.toString().padStart(2, '0')}</span>;
}

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
  queuedAt?: string;
}

interface QueueListProps {
  queue: QueueEntry[];
  sessionId?: string;
  gameMode?: GameMode;
  matchingMode?: MatchingMode;
  diversity?: Record<string, number>;
  waitEstimates?: Record<string, number | null>;
  nextMatchPlayerIds?: string[];
  onMoveUp: (playerId: string) => Promise<void>;
  onMoveDown: (playerId: string) => Promise<void>;
  onRemove: (playerId: string) => Promise<void>;
  onPlayerClick?: (playerId: string) => void;
  onPairChanged?: () => void;
  onStarRatingChange?: (playerId: string, starRating: number) => void;
}

/**
 * Computes On Deck player IDs — the candidate pool (first 6 positions in queue).
 * For pairs, includes both the anchor and partner player IDs.
 */
function getOnDeckPlayerIds(
  queue: QueueEntry[],
  gameMode: GameMode,
  matchingMode: MatchingMode
): Set<string> {
  const poolSize = 8;
  const end = Math.min(queue.length, poolSize);
  const set = new Set<string>();
  for (const entry of queue.slice(0, end)) {
    set.add(entry.playerId);
    if (entry.isPairSlot && entry.partnerPlayerId) {
      set.add(entry.partnerPlayerId);
    }
  }
  return set;
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

function QueueList({ queue, sessionId, gameMode = 'doubles', matchingMode = 'balanced', diversity, waitEstimates, nextMatchPlayerIds, onMoveUp, onMoveDown, onRemove, onPlayerClick, onPairChanged, onStarRatingChange }: QueueListProps) {
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

  // Pre-computed set of players who will actually be in the next match
  const nextMatchSet = new Set(nextMatchPlayerIds ?? []);

  // Show queue in exact backend order (no client-side sort)
  const sortedQueue = [...queue];

  const lastIndex = sortedQueue.length - 1;

  function handleNameClick(playerId: string) {
    if (onPlayerClick) {
      onPlayerClick(playerId);
    } else {
      setSelectedPlayerId(playerId);
    }
  }

  function getStatusDot(playerId: string, isOnDeck: boolean): string {
    if (nextMatchSet.has(playerId)) return '🟢';
    if (isOnDeck) return '🟡';
    return '⚪';
  }

  function getWaitLabel(index: number, playerId: string, isOnDeck: boolean): string {
    if (waitEstimates && waitEstimates[playerId] != null) {
      return `~${waitEstimates[playerId]}m`;
    }
    return '';
  }

  return (
    <div>
      <h2>Queue</h2>
      <ul className="avatar-queue">
        {sortedQueue.map((entry, index) => {
          const isPair = entry.isPairSlot === true;
          const isOnDeck = onDeckSet.has(entry.playerId) || (isPair && entry.partnerPlayerId ? onDeckSet.has(entry.partnerPlayerId!) : false);
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
          const isNextMatch = nextMatchSet.has(entry.playerId) || (isPair && entry.partnerPlayerId ? nextMatchSet.has(entry.partnerPlayerId) : false);

          return (
            <li
              key={entry.playerId}
              className={`avatar-queue__item${isNextMatch ? ' avatar-queue__item--next' : isOnDeck ? ' avatar-queue__item--ondeck' : ''}`}
            >
              {/* Row — click row to expand, click name to open profile */}
              <div
                className="avatar-queue__row"
                onClick={() => setExpandedPlayerId(isExpanded ? null : entry.playerId)}
                style={{ cursor: 'pointer' }}
              >
                <span className="avatar-queue__dot" aria-hidden="true">{getStatusDot(entry.playerId, isOnDeck)}</span>
                <span className="avatar-queue__name-wrapper">
                  {isPair && entry.partnerPlayerName ? (
                    <span className="avatar-queue__name" style={{ display: 'inline' }}>
                      <span className="avatar-queue__pair-icon">🔗</span>
                      <span
                        onClick={(e) => { e.stopPropagation(); handleNameClick(entry.playerId); }}
                        style={{ cursor: 'pointer' }}
                        className="avatar-queue__name-link"
                      >
                        {entry.playerName}
                      </span>
                      {' & '}
                      <span
                        onClick={(e) => { e.stopPropagation(); handleNameClick(entry.partnerPlayerId!); }}
                        style={{ cursor: 'pointer' }}
                        className="avatar-queue__name-link"
                      >
                        {entry.partnerPlayerName}
                      </span>
                      {streak >= 2 && <span className="avatar-queue__streak">🔥</span>}
                      {streak <= -2 && <span className="avatar-queue__streak">❄️</span>}
                    </span>
                  ) : (
                    <span
                      className="avatar-queue__name"
                      onClick={(e) => { e.stopPropagation(); handleNameClick(entry.playerId); }}
                    >
                      {displayName}
                      {streak >= 2 && <span className="avatar-queue__streak">🔥</span>}
                      {streak <= -2 && <span className="avatar-queue__streak">❄️</span>}
                    </span>
                  )}
                </span>
                {entry.starRating && (
                  <span className="avatar-queue__stars" aria-label={`${entry.starRating} stars`}>
                    {'★'.repeat(entry.starRating)}{'☆'.repeat(5 - entry.starRating)}
                  </span>
                )}
                <span className="avatar-queue__record">{wins}-{losses}</span>
                <span className={`avatar-queue__wait${isNextMatch ? ' avatar-queue__wait--now' : isOnDeck ? ' avatar-queue__wait--ondeck' : ''}`}>
                  {entry.queuedAt && entry.queuedAt.length > 0 ? <WaitTimer since={entry.queuedAt} /> : ''}
                </span>
                <span
                  className="avatar-queue__chevron"
                  aria-hidden="true"
                >
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>

              {/* Expanded — actions only */}
              {isExpanded && (
                <div className="avatar-queue__detail">
                  <div className="avatar-queue__actions">
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
