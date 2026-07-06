import { useState } from 'react';
import { PlayerStats } from '../types';

export interface LeaderboardCardEntry {
  rank: number;
  playerName: string;
  ratingDelta: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number;
  rating: number;
}

export function buildLeaderboardCardEntries(
  playerStats: PlayerStats[],
  startingRatings?: Map<string, number>
): LeaderboardCardEntry[] {
  return playerStats
    .filter(p => p.matchesPlayed >= 1)
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
      return a.playerName.localeCompare(b.playerName);
    })
    .map((p, index) => ({
      rank: index + 1,
      playerName: p.playerName,
      ratingDelta: p.rating - (startingRatings?.get(p.playerId) ?? p.rating),
      wins: p.wins,
      losses: p.losses,
      matchesPlayed: p.matchesPlayed,
      winRate: p.winRate,
      rating: p.rating,
    }));
}

interface LeaderboardCardProps {
  playerStats: PlayerStats[];
  startingRatings?: Map<string, number>;
}

function LeaderboardCard({ playerStats, startingRatings }: LeaderboardCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const entries = buildLeaderboardCardEntries(playerStats, startingRatings);

  // Hide entirely when no players have completed a match
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="leaderboard-card card">
      <div className="leaderboard-card__header">
        <h3 className="leaderboard-card__title">Leaderboard</h3>
        <button
          className="leaderboard-card__toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand leaderboard' : 'Collapse leaderboard'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <div className="leaderboard-card__body">
          <table className="leaderboard-card__table">
            <thead>
              <tr>
                <th scope="col" className="leaderboard-card__th">#</th>
                <th scope="col" className="leaderboard-card__th">Player</th>
                <th scope="col" className="leaderboard-card__th">Record</th>
                <th scope="col" className="leaderboard-card__th">Matches</th>
                <th scope="col" className="leaderboard-card__th">Win %</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.playerName} className="leaderboard-card__row">
                  <td className="leaderboard-card__cell leaderboard-card__cell--rank">
                    {entry.rank === 1 ? '🏆' : entry.rank === 2 ? '🥇' : entry.rank === 3 ? '🥈' : entry.rank}
                  </td>
                  <td className="leaderboard-card__cell leaderboard-card__cell--name">
                    {entry.playerName}
                    {entry.rank === 1 && <span className="leaderboard-card__mvp" aria-label="MVP"> MVP</span>}
                  </td>
                  <td className="leaderboard-card__cell leaderboard-card__cell--record">
                    {entry.wins}-{entry.losses}
                  </td>
                  <td className="leaderboard-card__cell leaderboard-card__cell--matches">
                    {entry.matchesPlayed}
                  </td>
                  <td className="leaderboard-card__cell leaderboard-card__cell--winrate">
                    {entry.winRate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default LeaderboardCard;
