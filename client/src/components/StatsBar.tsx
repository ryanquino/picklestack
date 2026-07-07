interface StatsBarProps {
  totalPlayers: number;
  matchesPlayed: number;
  averageWinRate: number;
  sessionQualityScore?: number | null;
}

/**
 * Displays aggregate session statistics in a horizontal row (tablet/desktop)
 * or 2x3 grid (mobile). CSS handles the responsive layout via `.stats-bar`.
 */
function StatsBar({
  totalPlayers,
  matchesPlayed,
  averageWinRate,
  sessionQualityScore,
}: StatsBarProps) {
  function getQualityLabel(score: number | null | undefined): string {
    if (score == null) return 'N/A';
    if (score >= 70) return 'Great';
    if (score >= 40) return 'Decent';
    return 'Lopsided';
  }

  function getQualityIcon(score: number | null | undefined): string {
    if (score == null) return '🎯';
    if (score >= 70) return '🟢';
    if (score >= 40) return '🟡';
    return '🔴';
  }

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
        <span className="stats-bar__icon" role="img" aria-label="Match quality">{getQualityIcon(sessionQualityScore)}</span>
        <span className="stats-bar__value">{getQualityLabel(sessionQualityScore)}</span>
        <span>Match Quality</span>
      </div>
    </div>
  );
}

export default StatsBar;
