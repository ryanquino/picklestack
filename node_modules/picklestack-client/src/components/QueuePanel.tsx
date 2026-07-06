import { useState } from 'react';
import type { StarRating, GameMode, MatchingMode, Achievement } from '../types';
import CheckInForm from './CheckInForm';
import QueueList from './QueueList';
import PairControls from './PairControls';

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
  onMoveUp: (playerId: string) => Promise<void>;
  onMoveDown: (playerId: string) => Promise<void>;
  onRemove: (playerId: string) => Promise<void>;
  onPlayerClick: (playerId: string) => void;
  onCheckIn: (name: string, starRating: StarRating) => Promise<void>;
  onPairChanged?: () => void;
}

function QueuePanel({
  queue,
  sessionId,
  gameMode,
  matchingMode,
  diversity,
  waitEstimates,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPlayerClick,
  onCheckIn,
  onPairChanged,
}: QueuePanelProps) {
  const [showCheckIn, setShowCheckIn] = useState(false);

  async function handleCheckIn(name: string, starRating: StarRating) {
    await onCheckIn(name, starRating);
    setShowCheckIn(false);
  }

  return (
    <div className="queue-panel">
      <div className="queue-panel__header">
        <div className="flex items-center gap-sm">
          <h2 className="m-0 text-lg font-semibold">QUEUE</h2>
          <span className="status-badge status-badge--available">{queue.length}</span>
        </div>
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
      </div>

      {showCheckIn && (
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
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
          onPlayerClick={onPlayerClick}
          onPairChanged={onPairChanged}
        />
      </div>

      {onPairChanged && (
        <PairControls
          sessionId={sessionId}
          queue={queue}
          onPairChanged={onPairChanged}
        />
      )}
    </div>
  );
}

export default QueuePanel;
