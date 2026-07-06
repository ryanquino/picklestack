import type { GameMode, MatchingMode } from '../types';

interface QueuePlayer {
  playerId: string;
  playerName: string;
  position: number;
}

interface OnDeckQueueProps {
  queue: QueuePlayer[];
  gameMode: GameMode;
  matchingMode: MatchingMode;
}

/**
 * Computes On Deck player IDs using the same logic as the server's getOnDeckPlayerIds.
 *
 * Rules:
 * - Smart Pairing: first min(N, 8) players
 * - Non-smart + Doubles: first min(N, 4) players
 * - Non-smart + Singles: first min(N, 2) players
 */
function getOnDeckPlayerIds(
  queue: QueuePlayer[],
  gameMode: GameMode,
  matchingMode: MatchingMode
): string[] {
  let count: number;

  if (matchingMode === 'smart') {
    count = Math.min(queue.length, 8);
  } else if (gameMode === 'doubles') {
    count = Math.min(queue.length, 4);
  } else {
    count = Math.min(queue.length, 2);
  }

  return queue.slice(0, count).map((entry) => entry.playerId);
}

/**
 * Returns the minimum number of players required to start a match.
 */
function getRequiredPlayerCount(gameMode: GameMode, matchingMode: MatchingMode): number {
  if (matchingMode === 'smart') {
    return 8;
  }
  return gameMode === 'doubles' ? 4 : 2;
}

function OnDeckQueue({ queue, gameMode, matchingMode }: OnDeckQueueProps) {
  const onDeckIds = getOnDeckPlayerIds(queue, gameMode, matchingMode);
  const onDeckSet = new Set(onDeckIds);
  const requiredCount = getRequiredPlayerCount(gameMode, matchingMode);
  const needsMorePlayers = queue.length < requiredCount;

  if (queue.length === 0) {
    return (
      <div style={{ padding: '1rem' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>On Deck</h3>
        <p style={{ color: '#6b7280', margin: 0 }}>No players in the queue.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600 }}>On Deck</h3>

      {needsMorePlayers && (
        <p
          style={{
            color: '#d97706',
            fontSize: '0.875rem',
            margin: '0 0 0.75rem 0',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#fffbeb',
            borderRadius: '4px',
            border: '1px solid #fde68a',
          }}
        >
          More players needed ({queue.length}/{requiredCount})
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {queue.map((player) => {
          const isOnDeck = onDeckSet.has(player.playerId);

          return (
            <li
              key={player.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                marginBottom: '0.25rem',
                borderRadius: '4px',
                backgroundColor: isOnDeck ? '#fffbeb' : 'transparent',
                border: isOnDeck ? '1px solid #fde68a' : '1px solid transparent',
              }}
            >
              <span
                style={{
                  minWidth: '1.5rem',
                  fontWeight: 600,
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                {player.position}
              </span>

              <span
                style={{
                  flex: 1,
                  fontWeight: isOnDeck ? 600 : 400,
                  color: isOnDeck ? '#92400e' : '#374151',
                }}
              >
                {player.playerName}
              </span>

              {isOnDeck && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#92400e',
                    backgroundColor: '#fbbf24',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  On Deck
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default OnDeckQueue;
