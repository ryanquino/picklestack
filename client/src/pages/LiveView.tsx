import { useParams } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { getSessionLive } from '../api';
import type { PlayerStats, Achievement, LeaderboardEntry, StarRating, GameMode, MatchingMode } from '../types';
import Leaderboard from '../components/Leaderboard';
import ScrollToTopButton from '../components/ScrollToTopButton';
import LeaderboardCard from '../components/LeaderboardCard';
import PlayerProfileCard from '../components/PlayerProfileCard';
import LiveSessionHeader from '../components/LiveSessionHeader';
import Navbar from '../components/Navbar';

/** Live timer that updates every second, displays mm:ss */
function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => {
    const diff = Date.now() - new Date(startedAt).getTime();
    return Math.max(0, Math.floor(diff / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(startedAt).getTime();
      setElapsed(Math.max(0, Math.floor(diff / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return <span>⏱ {minutes}:{seconds.toString().padStart(2, '0')}</span>;
}
interface EnrichedQueueEntry {
  playerId: string;
  playerName: string;
  position: number;
  isUpNext: boolean;
  rating: number;
  starRating: StarRating;
  wins: number;
  losses: number;
  winRate: number;
  streak: number;
  isMvp: boolean;
  achievements: Achievement[];
  checkedInAt?: string;
  queuedAt?: string;
}

interface EnrichedMatchPlayer {
  id: string;
  name: string;
  rating: number;
  starRating: StarRating;
  wins: number;
  losses: number;
  winRate: number;
  streak: number;
  isMvp: boolean;
  achievements: Achievement[];
}

interface EnrichedMatch {
  id: string;
  courtNumber: number;
  players: EnrichedMatchPlayer[];
  status: string;
  startedAt: string;
  team1Score?: number | null;
  team2Score?: number | null;
}

interface LiveResponse {
  session: {
    id: string;
    name: string;
    status: string;
    courtCount: number;
    sessionType?: string;
    gameMode?: GameMode;
    matchingMode?: MatchingMode;
    courtName?: string;
    courtNames?: Record<string, string>;
    createdAt?: string;
    updatedAt?: string;
  };
  queue: EnrichedQueueEntry[];
  courts: { sessionId: string; courtNumber: number; status: 'available' | 'active' }[];
  activeMatches: EnrichedMatch[];
  playerStats: PlayerStats[];
  achievements: Achievement[];
  onDeckPlayerIds?: string[];
  completedMatches?: CompletedMatch[];
  totalCompletedMatches?: number;
  waitEstimates?: Record<string, number | null>;
  diversity?: Record<string, number>;
}

interface CompletedMatch {
  id: string;
  courtNumber: number;
  players: string[];
  winningTeam: number | null;
  team1Score: number | null;
  team2Score: number | null;
  startedAt: string;
  completedAt: string | null;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ended'; data: LiveResponse }
  | { kind: 'active'; data: LiveResponse }
  | { kind: 'error'; message: string };

/** Build leaderboard entries from playerStats and achievements */
function buildLeaderboard(playerStats: PlayerStats[], achievements: Achievement[]): LeaderboardEntry[] {
  const achievementsByPlayer = new Map<string, Achievement[]>();
  for (const a of achievements) {
    const list = achievementsByPlayer.get(a.playerId) || [];
    list.push(a);
    achievementsByPlayer.set(a.playerId, list);
  }

  // Determine MVP: highest win rate among players with 3+ matches
  let mvpPlayerId: string | null = null;
  let mvpWinRate = -1;
  for (const stat of playerStats) {
    if (stat.matchesPlayed >= 3 && stat.winRate > mvpWinRate) {
      mvpWinRate = stat.winRate;
      mvpPlayerId = stat.playerId;
    }
  }

  // Sort: win rate desc, matches played desc, name asc
  const sorted = [...playerStats].sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
    return a.playerName.localeCompare(b.playerName);
  });

  return sorted.map((stat, index) => ({
    ...stat,
    rank: index + 1,
    isMvp: stat.playerId === mvpPlayerId,
    achievements: achievementsByPlayer.get(stat.playerId) || [],
  }));
}

/** Render star rating as filled/empty stars */
function renderStars(starRating: StarRating): string {
  return '★'.repeat(starRating) + '☆'.repeat(5 - starRating);
}

/** Compute on-deck player count based on game mode */
function getOnDeckCount(gameMode: GameMode, matchingMode: MatchingMode, queueLength: number): number {
  if (matchingMode !== 'queue') {
    return Math.min(queueLength, 8);
  }
  if (gameMode === 'doubles') {
    return Math.min(queueLength, 4);
  }
  return Math.min(queueLength, 2);
}

function LiveView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const fetchLiveData = useCallback(async () => {
    if (!sessionId) {
      setState({ kind: 'not-found' });
      return;
    }

    try {
      const data = await getSessionLive(sessionId) as unknown as LiveResponse;
      if (data.session.status === 'ended') {
        setState({ kind: 'ended', data });
      } else {
        setState({ kind: 'active', data });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      if (message.toLowerCase().includes('not found')) {
        setState({ kind: 'not-found' });
      } else {
        setState({ kind: 'error', message });
      }
    }
  }, [sessionId]);

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 3000);
    return () => clearInterval(interval);
  }, [fetchLiveData]);

  if (state.kind === 'loading') {
    return (
      <div className="live-view" role="status" aria-live="polite">
        <p>Loading session…</p>
      </div>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <div className="live-view">
        <h1>Session not found</h1>
        <p>The session you're looking for doesn't exist or has been removed.</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="live-view">
        <h1>Error</h1>
        <p>{state.message}</p>
      </div>
    );
  }

  if (state.kind === 'ended') {
    const { session, queue, activeMatches, playerStats, achievements, completedMatches, diversity } = state.data;
    const totalPlayers = playerStats.length > 0 ? playerStats.length : queue.length;
    const playersPerMatch = (session.gameMode === 'singles') ? 2 : 4;
    const totalMatchesPlayed = playerStats.reduce((sum, p) => sum + p.matchesPlayed, 0);
    const totalMatches = totalMatchesPlayed > 0 ? Math.round(totalMatchesPlayed / playersPerMatch) : activeMatches.length;
    const leaderboardEntries = buildLeaderboard(playerStats, achievements);

    return (
      <div className="organizer-dashboard">
        <Navbar />
        <h1>{session.name}</h1>
        <p className="text-secondary">Open Play Summary</p>
        <div className="live-view__ended">
          {/* Summary Stats Card */}
          <div className="session-summary-card card">
            <div className="session-summary-card__stats">
              <div className="session-summary-card__stat">
                <span className="session-summary-card__value">{totalMatches}</span>
                <span className="session-summary-card__label">Games</span>
              </div>
              <div className="session-summary-card__stat">
                <span className="session-summary-card__value">
                  {session.createdAt && session.updatedAt
                    ? Math.round((new Date(session.updatedAt).getTime() - new Date(session.createdAt).getTime()) / 60000)
                    : '—'}
                </span>
                <span className="session-summary-card__label">Minutes</span>
              </div>
              <div className="session-summary-card__stat">
                <span className="session-summary-card__value">{session.courtCount}</span>
                <span className="session-summary-card__label">Courts</span>
              </div>
              <div className="session-summary-card__stat">
                <span className="session-summary-card__value">{totalPlayers}</span>
                <span className="session-summary-card__label">Players</span>
              </div>
            </div>
          </div>

          {/* Final Standings */}
          {leaderboardEntries.length > 0 && (
            <section aria-label="Final standings">
              <h2>Final Standings</h2>
              <Leaderboard entries={leaderboardEntries} />
            </section>
          )}

          {/* Match Log */}
          {completedMatches && completedMatches.length > 0 && (
            <section aria-label="Match log" className="live-view__match-log">
              <h2>Match Log</h2>
              <div className="card">
                <table className="leaderboard-card__table">
                  <thead>
                    <tr>
                      <th scope="col" className="leaderboard-card__th">#</th>
                      <th scope="col" className="leaderboard-card__th">Court</th>
                      <th scope="col" className="leaderboard-card__th">Teams</th>
                      <th scope="col" className="leaderboard-card__th">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedMatches.map((match, index) => {
                      const midpoint = Math.ceil(match.players.length / 2);
                      const team1 = match.players.slice(0, midpoint);
                      const team2 = match.players.slice(midpoint);
                      return (
                        <tr key={match.id} className="leaderboard-card__row">
                          <td className="leaderboard-card__cell leaderboard-card__cell--rank">{index + 1}</td>
                          <td className="leaderboard-card__cell">{match.courtNumber}</td>
                          <td className="leaderboard-card__cell">
                            <span style={match.winningTeam === 1 ? { color: 'var(--color-success)', fontWeight: 600 } : undefined}>{team1.join(', ')}</span>
                            {' vs '}
                            <span style={match.winningTeam === 2 ? { color: 'var(--color-success)', fontWeight: 600 } : undefined}>{team2.join(', ')}</span>
                          </td>
                          <td className="leaderboard-card__cell">
                            {match.team1Score !== null && match.team2Score !== null
                              ? `${match.team1Score}-${match.team2Score}`
                              : match.winningTeam ? `Team ${match.winningTeam} won` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {selectedPlayerId && sessionId && (
          <PlayerProfileCard
            sessionId={sessionId}
            playerId={selectedPlayerId}
            onClose={() => setSelectedPlayerId(null)}
            diversityPercentage={diversity?.[selectedPlayerId] ?? 0}
          />
        )}
      </div>
    );
  }

  // Active session
  const { session, queue, activeMatches, playerStats, achievements, totalCompletedMatches, waitEstimates, diversity } = state.data;
  const gameMode = session.gameMode || 'doubles';
  const matchingMode = session.matchingMode || 'balanced';
  const onDeckCount = getOnDeckCount(gameMode, matchingMode, queue.length);
  const onDeckPlayers = queue.slice(0, onDeckCount);
  const leaderboardEntries = buildLeaderboard(playerStats, achievements);
  const courtNames = session.courtNames || {};

  function getCourtDisplayName(courtNumber: number): string {
    return courtNames[String(courtNumber)] || `Court ${courtNumber}`;
  }

  return (
    <div className="organizer-dashboard">
      <LiveSessionHeader
        sessionName={session.name}
        activeCourts={activeMatches.length}
        queuedPlayers={queue.length}
      />

      {/* Courts first */}
      <section aria-label="Active courts" className="live-view__courts">
        <h2>Courts</h2>
        <div className="live-courts-grid">
          {Array.from({ length: session.courtCount }, (_, i) => {
            const courtNumber = i + 1;
            const match = activeMatches.find(m => m.courtNumber === courtNumber);

            if (match) {
              const midpoint = Math.ceil(match.players.length / 2);
              const team1 = match.players.slice(0, midpoint);
              const team2 = match.players.slice(midpoint);

              return (
                <div key={`court-${courtNumber}`} className="card court-card court-card--active" aria-label={`Court ${courtNumber}`}>
                  <div className="court-card__header">
                    <span className="font-semibold">
                      {getCourtDisplayName(courtNumber)}
                    </span>
                    <span className="live-badge" aria-label="Match in progress">
                      <span className="live-badge__dot" aria-hidden="true" />
                      LIVE
                    </span>
                  </div>
                  <div className="court-card__teams">
                    <div className="court-card__team">
                      {team1.map((player) => (
                        <div key={player.id} className="court-card__player">
                          <div className="court-card__player-info">
                            <div className="court-card__player-name-row">
                              <div className="court-card__player-name-group">
                                <button
                                  className="court-card__player-name"
                                  onClick={() => setSelectedPlayerId(player.id)}
                                  aria-label={`View profile for ${player.name}`}
                                >
                                  {player.name}
                                </button>
                                {player.streak >= 2 && (
                                  <span className="court-card__player-streak" aria-label={`${player.streak} win streak`}>🔥</span>
                                )}
                                {player.streak <= -2 && (
                                  <span className="court-card__player-streak" aria-label={`${Math.abs(player.streak)} loss streak`}>❄️</span>
                                )}
                              </div>
                            </div>
                            <div className="court-card__player-details">
                              <span className="court-card__stars" aria-label={`${player.starRating} star rating`}>
                                {renderStars(player.starRating)}
                              </span>
                              <span className="court-card__player-record">{player.wins}W-{player.losses}L</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="court-card__vs">VS</div>
                    <div className="court-card__team">
                      {team2.map((player) => (
                        <div key={player.id} className="court-card__player">
                          <div className="court-card__player-info">
                            <div className="court-card__player-name-row">
                              <div className="court-card__player-name-group">
                                <button
                                  className="court-card__player-name"
                                  onClick={() => setSelectedPlayerId(player.id)}
                                  aria-label={`View profile for ${player.name}`}
                                >
                                  {player.name}
                                </button>
                                {player.streak >= 2 && (
                                  <span className="court-card__player-streak" aria-label={`${player.streak} win streak`}>🔥</span>
                                )}
                                {player.streak <= -2 && (
                                  <span className="court-card__player-streak" aria-label={`${Math.abs(player.streak)} loss streak`}>❄️</span>
                                )}
                              </div>
                            </div>
                            <div className="court-card__player-details">
                              <span className="court-card__stars" aria-label={`${player.starRating} star rating`}>
                                {renderStars(player.starRating)}
                              </span>
                              <span className="court-card__player-record">{player.wins}W-{player.losses}L</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="court-card__footer">
                    <span>Match #{(totalCompletedMatches ?? 0) + activeMatches.findIndex(m => m.courtNumber === courtNumber) + 1}</span>
                    <span><LiveTimer startedAt={match.startedAt} /></span>
                  </div>
                </div>
              );
            }

            // Empty court — awaiting players
            return (
              <div key={`court-${courtNumber}`} className="card court-card court-card--available" aria-label={`Court ${courtNumber}`}>
                <div className="court-card__header">
                  <span className="font-semibold">
                    {getCourtDisplayName(courtNumber)}
                  </span>
                </div>
                <div className="court-card__teams" style={{ justifyContent: 'center', padding: 'var(--space-xl) var(--space-md)' }}>
                  <p className="empty-state" style={{ margin: 0 }}>Awaiting Players</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Queue — full list, clickable names show profile */}
      <section aria-label="Queue" className="live-view__queue">
        <h2 className="live-view__queue-title">Up Next</h2>
        {queue.length === 0 ? (
          <p className="empty-state">No players in queue</p>
        ) : (
          <ul className="avatar-queue" aria-label="Queued players">
            {queue.map((entry, idx) => {
              const playersPerMatch = gameMode === 'singles' ? 2 : 4;
              const isNext = idx < playersPerMatch;
              const isOnDeck = idx < onDeckCount;
              const dotIcon = isNext ? '🟢' : isOnDeck ? '🟡' : '⚪';

              return (
              <li
                key={entry.playerId}
                className={`avatar-queue__item${isNext ? ' avatar-queue__item--next' : isOnDeck ? ' avatar-queue__item--ondeck' : ''}`}
              >
                <div className="avatar-queue__row" onClick={() => setSelectedPlayerId(entry.playerId)} style={{ cursor: 'pointer' }}>
                  <span className="avatar-queue__dot" aria-hidden="true">{dotIcon}</span>
                  <span className="avatar-queue__name">
                    {entry.playerName}
                    {entry.streak >= 2 && <span className="avatar-queue__streak">🔥</span>}
                    {entry.streak <= -2 && <span className="avatar-queue__streak">❄️</span>}
                  </span>
                  {entry.starRating && (
                    <span className="avatar-queue__stars" aria-label={`${entry.starRating} stars`}>
                      {'★'.repeat(entry.starRating)}{'☆'.repeat(5 - entry.starRating)}
                    </span>
                  )}
                  <span className="avatar-queue__record">{entry.wins}-{entry.losses}</span>
                  <span className={`avatar-queue__wait${isNext ? ' avatar-queue__wait--now' : isOnDeck ? ' avatar-queue__wait--ondeck' : ''}`}>
                    {entry.queuedAt && entry.queuedAt.length > 0 && (entry.wins + entry.losses) > 0 && <LiveTimer startedAt={entry.queuedAt} />}
                  </span>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Leaderboard at the bottom, scrollable */}
      {playerStats.length > 0 && (
        <section aria-label="Session leaderboard" className="live-view__leaderboard">
          <LeaderboardCard playerStats={playerStats} />
        </section>
      )}

      {selectedPlayerId && sessionId && (
        <PlayerProfileCard
          sessionId={sessionId}
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          diversityPercentage={diversity?.[selectedPlayerId] ?? 0}
        />
      )}
      <ScrollToTopButton />
    </div>
  );
}

export default LiveView;
