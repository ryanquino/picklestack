import { memo } from 'react';

interface StatsBarProps {
  totalPlayers: number;
  matchesPlayed: number;
  averageWinRate: number;
  inQueue: number;
  activeCourts: number;
  courtCount: number;
}

/**
 * Displays aggregate session statistics in a horizontal row (tablet/desktop)
 * or 2x3 grid (mobile). CSS handles the responsive layout via `.stats-bar`.
 */
const StatsBar = memo(function StatsBar({
  totalPlayers,
  matchesPlayed,
  averageWinRate,
  inQueue,
  activeCourts,
  courtCount,
}: StatsBarProps) {
  return (
    <div className="stats-bar" role="region" aria-label="Session statistics">
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Players">👤</span>
        <span className="stats-bar__value">{totalPlayers}</span>
        <span>Players</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="In queue">⏳</span>
        <span className="stats-bar__value">{inQueue}</span>
        <span>In Queue</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Matches">✅</span>
        <span className="stats-bar__value">{matchesPlayed}</span>
        <span>Matches</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Active courts">🏟️</span>
        <span className="stats-bar__value">{activeCourts}/{courtCount}</span>
        <span>Courts</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Win rate">📊</span>
        <span className="stats-bar__value">{Math.round(averageWinRate)}%</span>
        <span>Avg Win</span>
      </div>
    </div>
  );
});

export default StatsBar;
