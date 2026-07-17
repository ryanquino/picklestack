import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { getSessionLive, getPlayerProfile, getPlayerStatus } from '../api';
import type { PlayerStats, Achievement, StarRating, GameMode, MatchingMode, PlayerProfile, MatchHistoryEntry } from '../types';
import ScrollToTopButton from '../components/ScrollToTopButton';
import LeaderboardCard from '../components/LeaderboardCard';
import Navbar from '../components/Navbar';
import SessionAwards from '../components/SessionAwards';
import PlayerProfileCard from '../components/PlayerProfileCard';

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
}

interface Award {
  id: string;
  icon: string;
  title: string;
  description: string;
  playerId: string;
  playerName: string;
  partnerName?: string;
  value: string;
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
  sessionAwards?: Award[];
  nextMatchPlayerIds?: string[];
  completedMatches?: CompletedMatch[];
  totalCompletedMatches?: number;
  mvpPlayerId?: string | null;
  waitEstimates?: Record<string, number | null>;
  diversity?: Record<string, number>;
  highlights?: Array<{ id: string; emoji: string; text: string; matchNumber: number; timestamp: string }>;
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

function renderStars(starRating: StarRating): string {
  return '★'.repeat(starRating) + '☆'.repeat(5 - starRating);
}

interface PersonalRecord {
  label: string;
  value: string;
  icon: string;
}

function computePersonalRecords(matchHistory: MatchHistoryEntry[], currentStreak: number): PersonalRecord[] {
  if (matchHistory.length === 0) return [];
  const records: PersonalRecord[] = [];

  // Best win streak
  let maxStreak = 0;
  let streak = 0;
  for (const m of matchHistory) {
    if (m.result === 'win') {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else if (m.result === 'loss') {
      streak = 0;
    }
  }
  // Also check current streak if it extends the historical max
  if (currentStreak > maxStreak) maxStreak = currentStreak;
  if (maxStreak > 0) {
    records.push({ label: 'Best Win Streak', value: `${maxStreak}W`, icon: '🔥' });
  }

  // Biggest win (largest score margin)
  let biggestMargin = 0;
  let biggestWinScore = '';
  for (const m of matchHistory) {
    if (m.result !== 'win' || m.team1Score === null || m.team2Score === null) continue;
    const margin = Math.abs(m.team1Score - m.team2Score);
    if (margin > biggestMargin) {
      biggestMargin = margin;
      const high = Math.max(m.team1Score, m.team2Score);
      const low = Math.min(m.team1Score, m.team2Score);
      biggestWinScore = `${high}-${low}`;
    }
  }
  if (biggestMargin > 0) {
    records.push({ label: 'Biggest Win', value: biggestWinScore, icon: '💪' });
  }

  // Total points scored
  let totalScored = 0;
  let totalConceded = 0;
  for (const m of matchHistory) {
    if (m.team1Score === null || m.team2Score === null) continue;
    // Determine which team the player is on
    // matchHistory teammateIds/opponentIds help but simpler: result tells us
    if (m.result === 'win') {
      totalScored += Math.max(m.team1Score, m.team2Score);
      totalConceded += Math.min(m.team1Score, m.team2Score);
    } else if (m.result === 'loss') {
      totalScored += Math.min(m.team1Score, m.team2Score);
      totalConceded += Math.max(m.team1Score, m.team2Score);
    }
  }
  if (totalScored > 0) {
    records.push({ label: 'Points Scored', value: String(totalScored), icon: '🎯' });
  }

  // Favorite court (court with most wins)
  const courtWins = new Map<number, number>();
  for (const m of matchHistory) {
    if (m.result === 'win') {
      courtWins.set(m.courtNumber, (courtWins.get(m.courtNumber) || 0) + 1);
    }
  }
  let bestCourt = 0;
  let bestCourtWins = 0;
  for (const [court, wins] of courtWins) {
    if (wins > bestCourtWins) {
      bestCourtWins = wins;
      bestCourt = court;
    }
  }
  if (bestCourt > 0) {
    records.push({ label: 'Best Court', value: `Court ${bestCourt} (${bestCourtWins}W)`, icon: '🏟️' });
  }

  return records;
}

function PlayerView() {
  const { sessionId, playerId } = useParams<{ sessionId: string; playerId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [selectedProfilePlayerId, setSelectedProfilePlayerId] = useState<string | null>(null);

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

  const fetchPlayerProfile = useCallback(async () => {
    if (!sessionId || !playerId) return;
    try {
      const profile = await getPlayerProfile(sessionId, playerId);
      setPlayerProfile(profile);
    } catch {
      // Profile may not be available yet
    }
  }, [sessionId, playerId]);

  useEffect(() => {
    fetchLiveData();
    fetchPlayerProfile();
    const interval = setInterval(() => {
      fetchLiveData();
      fetchPlayerProfile();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchLiveData, fetchPlayerProfile]);

  // Check if player has been moved to bench — redirect back to join page
  useEffect(() => {
    if (!sessionId || !playerId) return;

    const PLAYER_STORAGE_PREFIX = 'pickld_player_';
    const storageKey = `${PLAYER_STORAGE_PREFIX}${sessionId}`;

    async function checkBenchStatus() {
      try {
        const { status } = await getPlayerStatus(sessionId!, playerId!);
        if (status === 'bench') {
          try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
          navigate(`/join/${sessionId}`, { replace: true });
        }
      } catch {
        // Ignore errors — keep showing player view
      }
    }

    checkBenchStatus();
    const interval = setInterval(checkBenchStatus, 5000);
    return () => clearInterval(interval);
  }, [sessionId, playerId, navigate]);

  if (state.kind === 'loading') {
    return (
      <div className="player-view" role="status" aria-live="polite">
        <p>Loading session...</p>
      </div>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <div className="player-view">
        <h1>Session not found</h1>
        <p>The session you're looking for doesn't exist or has been removed.</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="player-view">
        <h1>Error</h1>
        <p>{state.message}</p>
      </div>
    );
  }

  if (state.kind === 'ended') {
    const { session, playerStats, completedMatches } = state.data;
    const totalPlayers = playerStats.length > 0 ? playerStats.length : 0;
    const playersPerMatch = (session.gameMode === 'singles') ? 2 : 4;
    const totalMatchesPlayed = playerStats.reduce((sum, p) => sum + p.matchesPlayed, 0);
    const totalMatches = totalMatchesPlayed > 0 ? Math.round(totalMatchesPlayed / playersPerMatch) : 0;
    const myStats = playerStats.find(s => s.playerId === playerId);

    return (
      <div className="player-view">
        <Navbar />
        <h1>{session.name}</h1>
        <p className="text-secondary">Session Ended</p>

        {/* My final stats */}
        {myStats && (
          <div className="card player-view__my-stats">
            <h3>Your Stats</h3>
            <div className="player-view__stat-row">
              <span className="player-view__stat-label">Record</span>
              <span className="player-view__stat-value">{myStats.wins}W - {myStats.losses}L</span>
            </div>
            <div className="player-view__stat-row">
              <span className="player-view__stat-label">Win Rate</span>
              <span className="player-view__stat-value">{myStats.winRate.toFixed(1)}%</span>
            </div>
            <div className="player-view__stat-row">
              <span className="player-view__stat-label">Matches</span>
              <span className="player-view__stat-value">{myStats.matchesPlayed}</span>
            </div>
          </div>
        )}

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

        {playerStats.length > 0 && (
          <section aria-label="Final standings">
            <LeaderboardCard playerStats={playerStats} />
          </section>
        )}

        <SessionAwards awards={(state.data as any).sessionAwards ?? []} />

        {completedMatches && completedMatches.length > 0 && (
          <section aria-label="Match log" className="player-view__match-log">
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
        <ScrollToTopButton />
      </div>
    );
  }

  // Active session
  const { session, queue, activeMatches, playerStats, achievements, totalCompletedMatches, waitEstimates, diversity, highlights } = state.data;
  const nextMatchPlayerIds: string[] = (state.data as any).nextMatchPlayerIds ?? [];
  const nextMatchSet = new Set(nextMatchPlayerIds);
  const gameMode = session.gameMode || 'doubles';
  const courtNames = session.courtNames || {};
  const myStats = playerStats.find(s => s.playerId === playerId);
  const myQueueEntry = queue.find(q => q.playerId === playerId);
  const myQueuePosition = myQueueEntry ? queue.indexOf(myQueueEntry) : -1;
  const isUpNext = myQueuePosition >= 0 && myQueuePosition < 4;
  const isOnCourt = activeMatches.some(m => m.players.some(p => p.id === playerId));
  const myWaitEstimate = playerId ? waitEstimates?.[playerId] : undefined;
  const myDiversity = playerId ? diversity?.[playerId] : undefined;

  const playersPerMatch = gameMode === 'singles' ? 2 : 4;
  const activeIds = new Set(activeMatches.flatMap(m => m.playerIds || []));
  const getBracketNextSet = (bracketFilter: (e: typeof queue[0]) => boolean) =>
    new Set(queue.filter(bracketFilter).filter(e => !activeIds.has(e.playerId)).slice(0, playersPerMatch).map(e => e.playerId));
  const winnersNextSet = session.matchingMode === 'comeback' ? getBracketNextSet(e => e.lastResult === 'win') : nextMatchSet;
  const losersNextSet = session.matchingMode === 'comeback' ? getBracketNextSet(e => e.lastResult === 'loss') : nextMatchSet;
  const neutralNextSet = session.matchingMode === 'comeback' ? getBracketNextSet(e => e.lastResult == null) : nextMatchSet;

  function getCourtDisplayName(courtNumber: number): string {
    return courtNames[String(courtNumber)] || `Court ${courtNumber}`;
  }

  return (
    <div className="player-view">
      {/* Personalized header */}
      <div className="card player-view__header">
        <div className="player-view__header-top">
          <div>
            <span className="player-view__session-badge">SESSION</span>
            <h1 className="player-view__session-name">{session.name}</h1>
          </div>
          <div className="player-view__live-badge">
            <span className="live-badge">
              <span className="live-badge__dot" aria-hidden="true" />
              LIVE
            </span>
          </div>
        </div>
        {myStats && (
          <div className="player-view__my-identity">
            <span className="player-view__my-name">{myStats.playerName}</span>
            <span className="player-view__my-stars">{renderStars(myStats.starRating)}</span>
            <span className="player-view__my-record">{myStats.wins}W-{myStats.losses}L</span>
          </div>
        )}
      </div>

      {/* My status — queue position or on-court */}
      <div className={`player-view__status-inline${isOnCourt ? ' player-view__status-inline--on-court' : isUpNext ? ' player-view__status-inline--up-next' : ''}`}>
        {isOnCourt ? (
          <>
            <span className="player-view__status-inline-icon">🏓</span>
            <span className="player-view__status-inline-text">Playing</span>
            <span className="player-view__status-inline-sub">
              {activeMatches.find(m => m.players.some(p => p.id === playerId)) &&
                `Court ${activeMatches.find(m => m.players.some(p => p.id === playerId))!.courtNumber}`}
            </span>
          </>
        ) : myQueuePosition >= 0 ? (
          <>
            <span className="player-view__status-inline-icon">{isUpNext ? '🟢' : '⏳'}</span>
            <span className="player-view__status-inline-text">
              {isUpNext ? "Up next" : `#${myQueuePosition + 1} in queue`}
            </span>
            {myWaitEstimate != null && (
              <span className="player-view__status-inline-sub">~{myWaitEstimate}m wait</span>
            )}
          </>
        ) : (
          <>
            <span className="player-view__status-inline-icon">📋</span>
            <span className="player-view__status-inline-text">On bench</span>
          </>
        )}
      </div>

      {/* Courts */}
      <section aria-label="Active courts" className="player-view__courts">
        <h2>Courts</h2>
        <div className="live-courts-grid">
          {Array.from({ length: session.courtCount }, (_, i) => {
            const courtNumber = i + 1;
            const match = activeMatches.find(m => m.courtNumber === courtNumber);

            if (match) {
              const midpoint = Math.ceil(match.players.length / 2);
              const team1 = match.players.slice(0, midpoint);
              const team2 = match.players.slice(midpoint);
              const iAmPlaying = match.players.some(p => p.id === playerId);

              return (
                <div key={`court-${courtNumber}`} className={`card court-card court-card--active${iAmPlaying ? ' court-card--mine' : ''}`}>
                  <div className="court-card__header">
                    <span className="font-semibold">{getCourtDisplayName(courtNumber)}</span>
                    <span className="live-badge">
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
                                <span className={`court-card__player-name${player.id === playerId ? ' court-card__player-name--me' : ''}`}>
                                  {player.name}{player.id === playerId ? ' (You)' : ''}
                                </span>
                                {player.streak >= 2 && <span className="court-card__player-streak">🔥</span>}
                                {player.streak <= -2 && <span className="court-card__player-streak">❄️</span>}
                              </div>
                            </div>
                            <div className="court-card__player-details">
                              <span className="court-card__stars">{renderStars(player.starRating)}</span>
                              {player.streak >= 2 && <span className="court-card__player-streak">🔥</span>}
                              {player.streak <= -2 && <span className="court-card__player-streak">❄️</span>}
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
                                <span className={`court-card__player-name${player.id === playerId ? ' court-card__player-name--me' : ''}`}>
                                  {player.name}{player.id === playerId ? ' (You)' : ''}
                                </span>
                                {player.streak >= 2 && <span className="court-card__player-streak">🔥</span>}
                                {player.streak <= -2 && <span className="court-card__player-streak">❄️</span>}
                              </div>
                            </div>
                            <div className="court-card__player-details">
                              <span className="court-card__stars">{renderStars(player.starRating)}</span>
                              {player.streak >= 2 && <span className="court-card__player-streak">🔥</span>}
                              {player.streak <= -2 && <span className="court-card__player-streak">❄️</span>}
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

            return (
              <div key={`court-${courtNumber}`} className="card court-card court-card--available">
                <div className="court-card__header">
                  <span className="font-semibold">{getCourtDisplayName(courtNumber)}</span>
                </div>
                <div className="court-card__teams" style={{ justifyContent: 'center', padding: 'var(--space-xl) var(--space-md)' }}>
                  <p className="empty-state" style={{ margin: 0 }}>Awaiting Players</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Highlights */}
      {highlights && highlights.length > 0 && (
        <div className="highlights-ticker" aria-label="Match highlights">
          <div className="highlights-ticker__track">
            {[...highlights, ...highlights].map((h, i) => (
              <span key={`${h.id}-${i}`} className="highlights-ticker__item">
                <span className="highlights-ticker__match-num">(#{h.matchNumber})</span>
                <span className="highlights-ticker__emoji">{h.emoji}</span>
                <span className="highlights-ticker__text">{h.text}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Queue */}
      <section aria-label="Queue" className="player-view__queue">
        {session.matchingMode === 'comeback' ? (
          <>
          <div className="comeback-queues">
            <div className="comeback-bracket comeback-bracket--winners">
              <div className="comeback-bracket__header">
                <span className="comeback-bracket__title"><span className="comeback-bracket__icon">🏆</span> Winners</span>
                <span className="comeback-bracket__count">{queue.filter(e => e.lastResult === 'win').length}</span>
              </div>
              <div className="comeback-bracket__body">
                {queue.filter(e => e.lastResult === 'win').length === 0 ? (
                  <p className="comeback-bracket__empty">No winners yet</p>
                ) : (
                  <ul className="avatar-queue" aria-label="Winners queue">
                    {queue.filter(e => e.lastResult === 'win').map((entry, idx) => {
                      const isMe = entry.playerId === playerId;
                      const isNext = winnersNextSet.has(entry.playerId);
                      const isOnDeck = !isNext && idx < 4;
                      return (
                        <li key={entry.playerId} className={`avatar-queue__item avatar-queue__item--winner${isMe ? ' avatar-queue__item--me' : ''}${isNext ? ' avatar-queue__item--next' : isOnDeck ? ' avatar-queue__item--ondeck' : ''}`}>
                          <div className="avatar-queue__row">
                            <span className="avatar-queue__dot">{isMe ? '🟢' : isNext ? '🟢' : isOnDeck ? '🟡' : '⚪'}</span>
                            <span className="avatar-queue__name avatar-queue__name-link" onClick={() => setSelectedProfilePlayerId(entry.playerId)}>
                              {entry.playerName}{isMe ? ' (You)' : ''}
                              {entry.streak >= 2 && <span className="avatar-queue__streak">🔥</span>}
                              {entry.streak <= -2 && <span className="avatar-queue__streak">❄️</span>}
                            </span>
                            {entry.starRating && (
                              <span className="avatar-queue__stars">{'★'.repeat(entry.starRating)}{'☆'.repeat(5 - entry.starRating)}</span>
                            )}
                            <span className="avatar-queue__record">{entry.wins}-{entry.losses}</span>
                            <span className={`avatar-queue__wait${isNext ? ' avatar-queue__wait--now' : isOnDeck ? ' avatar-queue__wait--ondeck' : ''}`}>
                              {entry.queuedAt && entry.queuedAt.length > 0 && <WaitTimer since={entry.queuedAt} />}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
            <div className="comeback-bracket comeback-bracket--losers">
              <div className="comeback-bracket__header">
                <span className="comeback-bracket__title"><span className="comeback-bracket__icon">💪</span> Losers</span>
                <span className="comeback-bracket__count">{queue.filter(e => e.lastResult === 'loss').length}</span>
              </div>
              <div className="comeback-bracket__body">
                {queue.filter(e => e.lastResult === 'loss').length === 0 ? (
                  <p className="comeback-bracket__empty">No losers yet</p>
                ) : (
                  <ul className="avatar-queue" aria-label="Losers queue">
                    {queue.filter(e => e.lastResult === 'loss').map((entry, idx) => {
                      const isMe = entry.playerId === playerId;
                      const isNext = losersNextSet.has(entry.playerId);
                      const isOnDeck = !isNext && idx < 4;
                      return (
                        <li key={entry.playerId} className={`avatar-queue__item avatar-queue__item--loser${isMe ? ' avatar-queue__item--me' : ''}${isNext ? ' avatar-queue__item--next' : isOnDeck ? ' avatar-queue__item--ondeck' : ''}`}>
                          <div className="avatar-queue__row">
                            <span className="avatar-queue__dot">{isMe ? '🟢' : isNext ? '🟢' : isOnDeck ? '🟡' : '⚪'}</span>
                            <span className="avatar-queue__name avatar-queue__name-link" onClick={() => setSelectedProfilePlayerId(entry.playerId)}>
                              {entry.playerName}{isMe ? ' (You)' : ''}
                              {entry.streak >= 2 && <span className="avatar-queue__streak">🔥</span>}
                              {entry.streak <= -2 && <span className="avatar-queue__streak">❄️</span>}
                            </span>
                            {entry.starRating && (
                              <span className="avatar-queue__stars">{'★'.repeat(entry.starRating)}{'☆'.repeat(5 - entry.starRating)}</span>
                            )}
                            <span className="avatar-queue__record">{entry.wins}-{entry.losses}</span>
                            <span className={`avatar-queue__wait${isNext ? ' avatar-queue__wait--now' : isOnDeck ? ' avatar-queue__wait--ondeck' : ''}`}>
                              {entry.queuedAt && entry.queuedAt.length > 0 && <WaitTimer since={entry.queuedAt} />}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
            <div className="comeback-bracket comeback-bracket--neutral">
              <div className="comeback-bracket__header">
                <span className="comeback-bracket__title"><span className="comeback-bracket__icon">⏳</span> Neutral</span>
                <span className="comeback-bracket__count">{queue.filter(e => e.lastResult == null).length}</span>
              </div>
              <div className="comeback-bracket__body">
                {queue.filter(e => e.lastResult == null).length === 0 ? (
                  <p className="comeback-bracket__empty">No neutral players</p>
                ) : (
                  <ul className="avatar-queue" aria-label="Neutral queue">
                    {queue.filter(e => e.lastResult == null).map((entry, idx) => {
                      const isMe = entry.playerId === playerId;
                      const isNext = neutralNextSet.has(entry.playerId);
                      const isOnDeck = !isNext && idx < 4;
                      return (
                        <li key={entry.playerId} className={`avatar-queue__item${isMe ? ' avatar-queue__item--me' : ''}${isNext ? ' avatar-queue__item--next' : isOnDeck ? ' avatar-queue__item--ondeck' : ''}`}>
                          <div className="avatar-queue__row">
                            <span className="avatar-queue__dot">{isMe ? '🟢' : isNext ? '🟢' : isOnDeck ? '🟡' : '⚪'}</span>
                            <span className="avatar-queue__name avatar-queue__name-link" onClick={() => setSelectedProfilePlayerId(entry.playerId)}>
                              {entry.playerName}{isMe ? ' (You)' : ''}
                              {entry.streak >= 2 && <span className="avatar-queue__streak">🔥</span>}
                              {entry.streak <= -2 && <span className="avatar-queue__streak">❄️</span>}
                            </span>
                            {entry.starRating && (
                              <span className="avatar-queue__stars">{'★'.repeat(entry.starRating)}{'☆'.repeat(5 - entry.starRating)}</span>
                            )}
                            <span className="avatar-queue__record">{entry.wins}-{entry.losses}</span>
                            <span className={`avatar-queue__wait${isNext ? ' avatar-queue__wait--now' : isOnDeck ? ' avatar-queue__wait--ondeck' : ''}`}>
                              {entry.queuedAt && entry.queuedAt.length > 0 && <WaitTimer since={entry.queuedAt} />}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
          </>
        ) : (
          <>
            <h2>Queue</h2>
            {queue.length === 0 ? (
              <p className="empty-state">No players in queue</p>
            ) : (
              <ul className="avatar-queue" aria-label="Queued players">
                {[...queue].map((entry, idx) => {
                  const isMe = entry.playerId === playerId;
                  const isNext = nextMatchSet.has(entry.playerId);
                  const isOnDeck = !isNext && idx < 6;

                  return (
                    <li
                      key={entry.playerId}
                      className={`avatar-queue__item${isMe ? ' avatar-queue__item--me' : ''}${isNext ? ' avatar-queue__item--next' : isOnDeck ? ' avatar-queue__item--ondeck' : ''}`}
                    >
                      <div className="avatar-queue__row">
                        <span className="avatar-queue__dot">{isMe ? '🟢' : isNext ? '🟢' : isOnDeck ? '🟡' : '⚪'}</span>
                        <span
                          className="avatar-queue__name avatar-queue__name-link"
                          onClick={() => setSelectedProfilePlayerId(entry.playerId)}
                        >
                          {entry.playerName}{isMe ? ' (You)' : ''}
                          {entry.streak >= 2 && <span className="avatar-queue__streak">🔥</span>}
                          {entry.streak <= -2 && <span className="avatar-queue__streak">❄️</span>}
                        </span>
                        {entry.starRating && (
                          <span className="avatar-queue__stars">{'★'.repeat(entry.starRating)}{'☆'.repeat(5 - entry.starRating)}</span>
                        )}
                        <span className="avatar-queue__record">{entry.wins}-{entry.losses}</span>
                        <span className={`avatar-queue__wait${isNext ? ' avatar-queue__wait--now' : isOnDeck ? ' avatar-queue__wait--ondeck' : ''}`}>
                          {entry.queuedAt && entry.queuedAt.length > 0 && <WaitTimer since={entry.queuedAt} />}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Personal Records */}
      {playerProfile && (() => {
        const records = computePersonalRecords(playerProfile.matchHistory, myStats?.streak ?? 0);
        if (records.length === 0) return null;
        return (
          <section className="player-view__records" aria-label="Personal records">
            <h2>Personal Records</h2>
            <div className="player-view__records-row">
              {records.map((r, i) => (
                <span key={r.label} className="player-view__record-chip">
                  <span className="player-view__record-chip-icon">{r.icon}</span>
                  <span className="player-view__record-chip-value">{r.value}</span>
                  <span className="player-view__record-chip-label">{r.label}</span>
                </span>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Session Awards */}
      <SessionAwards awards={(state.data as any).sessionAwards ?? []} />

      {/* My Stats */}
      {playerStats.length > 0 && (
        <section aria-label="Leaderboard" className="player-view__leaderboard">
          <LeaderboardCard playerStats={playerStats} />
        </section>
      )}
      <ScrollToTopButton />

      {/* Player profile modal */}
      {selectedProfilePlayerId && sessionId && (
        <PlayerProfileCard
          sessionId={sessionId}
          playerId={selectedProfilePlayerId}
          onClose={() => setSelectedProfilePlayerId(null)}
          diversityPercentage={(state.data as any).diversity?.[selectedProfilePlayerId] ?? 0}
        />
      )}
    </div>
  );
}

export default PlayerView;
