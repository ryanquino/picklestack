interface StatsBarProps {
  totalPlayers: number;
  matchesPlayed: number;
  averageWinRate: number;
  averageRating: number;
  pairingMode: string;
}

/**
 * Displays aggregate session statistics in a horizontal row (tablet/desktop)
 * or 2x3 grid (mobile). CSS handles the responsive layout via `.stats-bar`.
 */
function StatsBar({
  totalPlayers,
  matchesPlayed,
  averageWinRate,
  averageRating,
  pairingMode,
}: StatsBarProps) {
  return (
    <div className="stats-bar" role="region" aria-label="Session statistics">
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Players">👤</span>
        <span className="stats-bar__value">{totalPlayers}</span>
        <span>Players</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Matches">✅</span>
        <span className="stats-bar__value">{matchesPlayed}</span>
        <span>Matches</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Win rate">📊</span>
        <span className="stats-bar__value">{Math.round(averageWinRate)}%</span>
        <span>Avg Win</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Rating">⭐</span>
        <span className="stats-bar__value">{averageRating.toFixed(1)}</span>
        <span>Avg Rating</span>
      </div>
      <div className="stats-bar__item">
        <span className="stats-bar__icon" role="img" aria-label="Pairing mode">🔀</span>
        <span className="stats-bar__value">{pairingMode}</span>
        <span>Mode</span>
      </div>
    </div>
  );
}

export default StatsBar;
