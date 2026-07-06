import { LeaderboardEntry } from '../types';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

function Leaderboard({ entries }: LeaderboardProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="leaderboard-card card">
      <div className="leaderboard-card__header">
        <h3 className="leaderboard-card__title">Session Leaderboard</h3>
      </div>
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
              <tr key={entry.playerId} className="leaderboard-card__row">
                <td className="leaderboard-card__cell leaderboard-card__cell--rank">
                  {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
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
    </div>
  );
}

export default Leaderboard;
