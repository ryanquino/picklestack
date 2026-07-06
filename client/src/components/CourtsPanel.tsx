import { useState, useEffect } from 'react';
import CourtGrid from './CourtGrid';
import type { Court, PlayerStats, Achievement, HeadToHeadRecord, FixedPair } from '../types';

const AUTO_START_KEY = 'picklestack_auto_start';

interface ActiveMatch {
  id: string;
  sessionId: string;
  courtNumber: number;
  playerIds: string[];
  players: { id: string; name: string }[];
  status: string;
  startedAt: string;
  completedAt?: string;
}

interface CourtsPanelProps {
  sessionId: string;
  courts: Court[];
  activeMatches: ActiveMatch[];
  queueLength: number;
  playerStats: PlayerStats[];
  achievements: Achievement[];
  headToHeadRecords: Record<string, HeadToHeadRecord[]>;
  courtNames?: Record<string, string>;
  totalCompletedMatches?: number;
  fixedPairs?: FixedPair[];
  onStartMatch: (courtNumber: number) => Promise<void>;
  onCompleteMatch: (courtNumber: number) => Promise<void>;
  onMatchCompleted: () => void;
  onPlayerClick: (playerId: string) => void;
}

function CourtsPanel({
  sessionId,
  courts,
  activeMatches,
  queueLength,
  playerStats,
  achievements,
  headToHeadRecords,
  courtNames,
  totalCompletedMatches,
  fixedPairs,
  onStartMatch,
  onCompleteMatch,
  onMatchCompleted,
  onPlayerClick,
}: CourtsPanelProps) {
  const activeMatchCount = activeMatches.filter((m) => m.status === 'active').length;

  const [autoStart, setAutoStart] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_START_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_START_KEY, String(autoStart));
    } catch {
      // localStorage unavailable
    }
  }, [autoStart]);

  return (
    <div className="courts-panel">
      <div className="courts-panel__header">
        <div className="courts-panel__header-left">
          <h2 className="text-lg font-semibold m-0">COURTS</h2>
          <span className="text-xs text-secondary">
            {activeMatchCount} active {activeMatchCount === 1 ? 'match' : 'matches'}
          </span>
        </div>
        <label className="courts-panel__auto-start-toggle">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => setAutoStart(e.target.checked)}
            aria-label="Enable auto-start matches"
          />
          <span className="courts-panel__auto-start-label">Auto-start</span>
        </label>
      </div>
      <div className="courts-panel__grid">
        <CourtGrid
          sessionId={sessionId}
          courts={courts}
          activeMatches={activeMatches}
          queueLength={queueLength}
          playerStats={playerStats}
          achievements={achievements}
          headToHeadRecords={headToHeadRecords}
          courtNames={courtNames}
          totalCompletedMatches={totalCompletedMatches}
          fixedPairs={fixedPairs}
          autoStart={autoStart}
          onStartMatch={onStartMatch}
          onCompleteMatch={onCompleteMatch}
          onMatchCompleted={onMatchCompleted}
          onPlayerClick={onPlayerClick}
        />
      </div>
    </div>
  );
}

export default CourtsPanel;
