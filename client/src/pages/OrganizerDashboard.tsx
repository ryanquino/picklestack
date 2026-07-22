import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSession, addPlayer, removePlayer, movePlayer, startMatch, completeMatch, endSession, getLeaderboard, setPairingMode, updatePlayerStarRating, joinQueue } from '../api';
import { addSessionToHistory, updateSessionStatus, removeSessionFromHistory } from '../sessionHistory';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
import QueuePanel from '../components/QueuePanel';
import ScrollToTopButton from '../components/ScrollToTopButton';
import HighlightsTicker from '../components/HighlightsTicker';
import CourtsPanel from '../components/CourtsPanel';
import ResultsPanel from '../components/ResultsPanel';
import StatsBar from '../components/StatsBar';
import SessionHeader from '../components/SessionHeader';
import Navbar from '../components/Navbar';
import Leaderboard from '../components/Leaderboard';
import LeaderboardCard from '../components/LeaderboardCard';
import Footer from '../components/Footer';
import SessionAwards from '../components/SessionAwards';
import QRCodeDisplay from '../components/QRCodeDisplay';
import PlayerProfileCard from '../components/PlayerProfileCard';
import SessionSettingsModal from '../components/SessionSettingsModal';
import ManualMatchModal from '../components/ManualMatchModal';
import ErrorBoundary from '../components/ErrorBoundary';
import TournamentDashboard from '../components/TournamentDashboard';
import ClubRaidPanel from '../components/ClubRaidPanel';
import { AchievementNotification } from '../components/AchievementBadge';
import type { PairingMode, Achievement, LeaderboardEntry, StarRating, GameMode, MatchingMode, FixedPair } from '../types';

interface QueueEntry {
  playerId: string;
  sessionId: string;
  position: number;
  playerName: string;
  lastResult?: 'win' | 'loss' | null;
}

interface EnrichedQueueEntry extends QueueEntry {
  rating?: number;
  starRating?: StarRating;
  wins?: number;
  losses?: number;
  winRate?: number;
  streak?: number;
  isMvp?: boolean;
  achievements?: Achievement[];
}

interface PlayerStatsData {
  playerId: string;
  playerName: string;
  rating: number;
  starRating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number;
  streak: number;
  gender?: string | null;
}

interface SessionQualityMetrics {
  sessionQualityScore: number | null;
  recentMatchRatings: Array<{ courtNumber: number; rating: number }>;
  totalMatchesRated: number;
}

interface SessionState {
  session: {
    id: string;
    name: string;
    courtCount: number;
    status: string;
    liveViewUrl: string;
    pairingMode?: PairingMode;
    sessionType?: string;
    gameMode?: GameMode;
    matchingMode?: MatchingMode;
    courtName?: string;
    courtNames?: Record<string, string>;
    createdAt?: string;
    updatedAt?: string;
  };
  queue: QueueEntry[];
  courts: { sessionId: string; courtNumber: number; status: 'available' | 'active' }[];
  activeMatches: {
    id: string;
    sessionId: string;
    courtNumber: number;
    playerIds: string[];
    players: { id: string; name: string }[];
    status: string;
    startedAt: string;
    completedAt?: string;
  }[];
  playerStats?: PlayerStatsData[];
  summary?: {
    totalPlayersCheckedIn: number;
    totalMatchesCompleted: number;
    leaderboard?: LeaderboardEntry[];
    achievements?: Achievement[];
  };
  achievements?: Achievement[];
  fixedPairs?: FixedPair[];
  totalCompletedMatches?: number;
  completedMatches?: {
    id: string;
    courtNumber: number;
    players: string[];
    winningTeam: number | null;
    team1Score: number | null;
    team2Score: number | null;
    startedAt: string;
    completedAt: string | null;
  }[];
  qualityMetrics?: SessionQualityMetrics;
  diversity?: Record<string, number>;
  waitEstimates?: Record<string, number | null>;
  mvpPlayerId?: string | null;
  highlights?: Array<{ id: string; emoji: string; text: string; matchNumber: number; timestamp: string }>;
  benchPlayers?: Array<{ id: string; name: string; gender?: string | null; starRating: number; wins: number; losses: number; matchesPlayed: number }>;
}

interface AchievementNotificationItem {
  id: string;
  achievement: Achievement;
  playerName: string;
}

function OrganizerDashboard() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'generic' | 'expired' | 'restoration' | 'not-found'>('generic');
  const [copied, setCopied] = useState(false);
  const [pairingMode, setPairingModeState] = useState<PairingMode>('smart');
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [notifications, setNotifications] = useState<AchievementNotificationItem[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<{ playerId: string } | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareTab, setShareTab] = useState<'join' | 'watch'>('join');
  const selfCheckInDisabled = state?.session?.gameMode === 'mlp' || state?.session?.matchingMode === 'club_raid';
  const [copiedJoin, setCopiedJoin] = useState(false);
  const [fixedPairs, setFixedPairs] = useState<FixedPair[]>([]);
  const [manualMatchCourt, setManualMatchCourt] = useState<number | null>(null);
  const previousAchievementsRef = useRef<Achievement[]>([]);
  const [scheduleRefreshToken, setScheduleRefreshToken] = useState(0);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      // Single consolidated fetch — achievements & fixedPairs are included in /sessions/:id
      const data = await getSession(sessionId);
      if (!data) return; // 304 — nothing changed
      const sessionState = data as unknown as SessionState;
      setState(sessionState);
      setError(null);

      // Save to session history for resume functionality
      addSessionToHistory({
        sessionId,
        name: sessionState.session.name,
        createdAt: sessionState.session.createdAt || new Date().toISOString(),
        courtCount: sessionState.session.courtCount,
        status: sessionState.session.status as 'active' | 'ended',
      });

      // Update pairing mode from session state
      if (sessionState.session.pairingMode) {
        setPairingModeState(sessionState.session.pairingMode);
      }

      // Load leaderboard if session is ended (only then is it relevant)
      if (sessionState.session.status === 'ended') {
        try {
          const lb = await getLeaderboard(sessionId) as LeaderboardEntry[];
          setLeaderboardEntries(lb);
        } catch {
          // Leaderboard may not be available yet
        }
      }

      // Track achievement notifications
      const currentAchievements = (sessionState.achievements || []) as Achievement[];
      const prevAchievements = previousAchievementsRef.current;

      if (prevAchievements.length > 0) {
        // Find new achievements by comparing with previous
        const newAchievements = currentAchievements.filter(
          (curr) => !prevAchievements.some(
            (prev) => prev.playerId === curr.playerId && prev.kind === curr.kind
          )
        );

        if (newAchievements.length > 0) {
          // Resolve player names from queue or active matches
          const playerNameMap = new Map<string, string>();
          sessionState.queue.forEach((q) => playerNameMap.set(q.playerId, q.playerName));
          sessionState.activeMatches.forEach((m) =>
            m.players.forEach((p) => playerNameMap.set(p.id, p.name))
          );

          const newNotifications: AchievementNotificationItem[] = newAchievements.map((a) => ({
            id: `${a.playerId}-${a.kind}-${Date.now()}`,
            achievement: a,
            playerName: playerNameMap.get(a.playerId) || 'Unknown Player',
          }));

          setNotifications((prev) => [...newNotifications, ...prev]);
        }
      }

      previousAchievementsRef.current = currentAchievements;

      // Fixed pairs for the session (from consolidated response)
      setFixedPairs((sessionState.fixedPairs || []) as FixedPair[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load session';

      if (message.includes('expired') || message.includes('24 hours')) {
        setError(message);
        setErrorKind('expired');
      } else if (message.toLowerCase().includes('not found')) {
        setError(message);
        setErrorKind('not-found');
      } else if (
        message.includes('could not be restored') ||
        message.includes('corrupted') ||
        message.includes('unreadable') ||
        message.includes('Internal server error')
      ) {
        setError(message);
        setErrorKind('restoration');
      } else {
        setError(message);
        setErrorKind('restoration');
      }
    } finally {
      setLoading(false);
    }
    setScheduleRefreshToken(t => t + 1);
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Auto-refresh with background-aware polling
  useVisibilityPolling(() => {
    if (!loading && !error) loadSession();
  }, 8000, 30000);

  const handleDismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handlePairingModeChange = useCallback((mode: PairingMode) => {
    setPairingModeState(mode);
  }, []);

  const handlePlayerClick = useCallback((playerId: string) => {
    setSelectedPlayer({ playerId });
  }, []);

  const handleCloseProfile = useCallback(() => {
    setSelectedPlayer(null);
  }, []);

  const handleCheckIn = useCallback(async (name: string, starRating: StarRating) => {
    if (!sessionId) return;
    await addPlayer(sessionId, name, starRating);
    await loadSession();
  }, [sessionId, loadSession]);

  const handleStarRatingChange = useCallback(async (playerId: string, starRating: number) => {
    if (!sessionId) return;
    await updatePlayerStarRating(sessionId, playerId, starRating);
    await loadSession();
  }, [sessionId, loadSession]);

  const handleMoveUp = useCallback(async (playerId: string) => {
    if (!sessionId) return;
    await movePlayer(sessionId, playerId, 'up');
    await loadSession();
  }, [sessionId, loadSession]);

  const handleMoveDown = useCallback(async (playerId: string) => {
    if (!sessionId) return;
    await movePlayer(sessionId, playerId, 'down');
    await loadSession();
  }, [sessionId, loadSession]);

  const handleRemove = useCallback(async (playerId: string) => {
    if (!sessionId) return;
    await removePlayer(sessionId, playerId);
    await loadSession();
  }, [sessionId, loadSession]);

  const handleStartMatch = useCallback(async (courtNumber: number) => {
    if (!sessionId) return;
    await startMatch(sessionId, courtNumber);
    await loadSession();
  }, [sessionId, loadSession]);

  const handleCompleteMatch = useCallback(async (courtNumber: number) => {
    if (!sessionId) return;
    await completeMatch(sessionId, courtNumber);
    await loadSession();
  }, [sessionId, loadSession]);

  const handleEndSession = useCallback(async () => {
    if (!sessionId) return;
    const confirmed = window.confirm(
      'Are you sure you want to end this session? This will complete all active matches and clear the queue.'
    );
    if (!confirmed) return;
    await endSession(sessionId);
    removeSessionFromHistory(sessionId);
    await loadSession();
  }, [sessionId, loadSession]);

  const handleJoinQueue = useCallback(async (playerId: string) => {
    if (!sessionId) return;
    await joinQueue(sessionId, playerId);
    await loadSession();
  }, [sessionId, loadSession]);

  async function handleCopyLiveUrl() {
    if (!state) return;
    const url = `${window.location.origin}/live/${sessionId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleCopyJoinUrl() {
    const url = `${window.location.origin}/join/${sessionId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedJoin(true);
      setTimeout(() => setCopiedJoin(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedJoin(true);
      setTimeout(() => setCopiedJoin(false), 2000);
    }
  }

  // Enrich queue entries with player stats and achievements (must be before any early returns)
  const statsMap = useMemo(() => new Map((state?.playerStats ?? []).map((s) => [s.playerId, s])), [state?.playerStats]);
  const achievementsByPlayer = useMemo(() => {
    const map = new Map<string, Achievement[]>();
    for (const a of (state?.achievements ?? [])) {
      const list = map.get(a.playerId) || [];
      list.push(a);
      map.set(a.playerId, list);
    }
    return map;
  }, [state?.achievements]);

  const mvpPlayerId = state?.mvpPlayerId ?? null;

  const enrichedQueue: EnrichedQueueEntry[] = useMemo(() => (state?.queue ?? []).map((entry) => {
    const stats = statsMap.get(entry.playerId);
    return {
      ...entry,
      rating: stats?.rating ?? 1000,
      starRating: (stats?.starRating ?? 3) as StarRating,
      wins: stats?.wins ?? 0,
      losses: stats?.losses ?? 0,
      winRate: stats?.winRate ?? 0,
      streak: stats?.streak ?? 0,
      isMvp: entry.playerId === mvpPlayerId,
      achievements: achievementsByPlayer.get(entry.playerId) || [],
    };
  }), [state?.queue, statsMap, achievementsByPlayer, mvpPlayerId]);

  if (loading) {
    return (
      <div>
        <p>Loading session...</p>
      </div>
    );
  }

  if (error) {
    if (errorKind === 'expired') {
      return (
        <div>
          <h1>Session expired</h1>
          <p>This session has been inactive for more than 24 hours and can no longer be restored.</p>
          <Link to="/">Start a new session</Link>
        </div>
      );
    }

    if (errorKind === 'not-found') {
      return (
        <div>
          <h1>Session not found</h1>
          <p>The session you're looking for doesn't exist.</p>
          <Link to="/">Start a new session</Link>
        </div>
      );
    }

    // Restoration error (corruption, unreadable, or other failure)
    return (
      <div>
        <h1>Unable to restore session</h1>
        <p role="alert" className="text-danger">{error}</p>
        <Link to="/">Start a new session</Link>
      </div>
    );
  }

  if (!state) {
    return (
      <div>
        <p>Session not found.</p>
      </div>
    );
  }

  const isEnded = state.session.status === 'ended';

  return (
    <div className="organizer-dashboard">
      {!isEnded && (
        <SessionHeader
          sessionName={state.session.name}
          isLive={state.session.status === 'active'}
          courtName={state.session.courtName}
          dateTime={new Date().toLocaleString()}
          pairingMode={pairingMode}
          isMLP={state.session.gameMode === 'mlp'}
          onTogglePairingMode={async () => {
            const newMode: PairingMode = pairingMode === 'smart' ? 'queue' : 'smart';
            try {
              await setPairingMode(sessionId!, newMode);
              handlePairingModeChange(newMode);
            } catch {
              // Silently fail — PairingModeToggle inline control handles errors
            }
          }}
          onOpenSettings={() => setShowSettingsModal(true)}
          onShare={() => setShowSharePanel(!showSharePanel)}
          onEndSession={handleEndSession}
        />
      )}

      {isEnded && (
        <>
        <Navbar />
        <h1>{state.session.name}</h1>
        <p className="text-secondary">Open Play Summary</p>
        <div className="session-summary-card card">
          <div className="session-summary-card__stats">
            <div className="session-summary-card__stat">
              <span className="session-summary-card__value">{state.summary?.totalMatchesCompleted ?? 0}</span>
              <span className="session-summary-card__label">Games</span>
            </div>
            <div className="session-summary-card__stat">
              <span className="session-summary-card__value">
                {state.session.createdAt && state.session.updatedAt
                  ? Math.round((new Date(state.session.updatedAt).getTime() - new Date(state.session.createdAt).getTime()) / 60000)
                  : '—'}
              </span>
              <span className="session-summary-card__label">Minutes</span>
            </div>
            <div className="session-summary-card__stat">
              <span className="session-summary-card__value">{state.session.courtCount}</span>
              <span className="session-summary-card__label">Courts</span>
            </div>
            <div className="session-summary-card__stat">
              <span className="session-summary-card__value">{state.summary?.totalPlayersCheckedIn ?? 0}</span>
              <span className="session-summary-card__label">Players</span>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Leaderboard for ended sessions */}
      {isEnded && (state.playerStats ?? []).length > 0 && (
        <section className="organizer-dashboard__leaderboard">
          <LeaderboardCard playerStats={state.playerStats ?? []} />
        </section>
      )}

      {/* Match Log for ended sessions */}
      {isEnded && state.completedMatches && state.completedMatches.length > 0 && (
        <section className="organizer-dashboard__match-log">
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
                {state.completedMatches.map((match, index) => {
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

      {!isEnded && (
        <>
          {/* Share popup - shown when share button is clicked */}
          {showSharePanel && state.session.status === 'active' && (
            <div className="share-popup__overlay" onClick={() => setShowSharePanel(false)}>
              <div className="share-popup card" onClick={(e) => e.stopPropagation()}>
                <div className="share-popup__header">
                  <div className="share-popup__tabs">
                    {!selfCheckInDisabled && (
                    <button
                      className={`share-popup__tab${shareTab === 'join' ? ' share-popup__tab--active' : ''}`}
                      onClick={() => setShareTab('join')}
                    >
                      📱 Join
                    </button>
                    )}
                    <button
                      className={`share-popup__tab${shareTab === 'watch' || (selfCheckInDisabled && shareTab === 'join') ? ' share-popup__tab--active' : ''}`}
                      onClick={() => setShareTab('watch')}
                    >
                      👁 Watch
                    </button>
                  </div>
                  <button
                    className="share-popup__close"
                    onClick={() => setShowSharePanel(false)}
                    aria-label="Close share popup"
                  >
                    ✕
                  </button>
                </div>
                <div className="share-popup__body">
                  {shareTab === 'join' && !selfCheckInDisabled ? (
                    <>
                      <p className="share-popup__hint">Players scan to check in and join the queue</p>
                      <QRCodeDisplay url={`${window.location.origin}/join/${sessionId}`} />
                      <div className="live-url-bar">
                        <code className="live-url-bar__url">
                          {`${window.location.origin}/join/${sessionId}`}
                        </code>
                        <button
                          onClick={handleCopyJoinUrl}
                          aria-label="Copy join URL"
                          className={`live-url-bar__copy-btn${copiedJoin ? ' live-url-bar__copy-btn--copied' : ''}`}
                        >
                          {copiedJoin ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="share-popup__hint">Spectators scan to watch the live session</p>
                      <QRCodeDisplay url={`${window.location.origin}/live/${sessionId}`} />
                      <div className="live-url-bar">
                        <code className="live-url-bar__url">
                          {`${window.location.origin}/live/${sessionId}`}
                        </code>
                        <button
                          onClick={handleCopyLiveUrl}
                          aria-label="Copy live view URL"
                          className={`live-url-bar__copy-btn${copied ? ' live-url-bar__copy-btn--copied' : ''}`}
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Courts first */}
          {state.session.gameMode === 'mlp' ? (
            <ErrorBoundary sectionName="Tournament">
              <TournamentDashboard
                sessionId={sessionId!}
                courtCount={state.session.courtCount || 2}
                onMatchStarted={loadSession}
              />
            </ErrorBoundary>
          ) : (
            <>
              <ErrorBoundary sectionName="Courts">
              <CourtsPanel
                sessionId={sessionId!}
                courts={state.courts}
                activeMatches={state.activeMatches}
                queueLength={state.queue.length}
                playerStats={(state.playerStats ?? []) as import('../types').PlayerStats[]}
                achievements={state.achievements ?? []}
                headToHeadRecords={{}}
                courtNames={state.session.courtNames}
                totalCompletedMatches={state.totalCompletedMatches ?? 0}
                fixedPairs={fixedPairs}
                onStartMatch={handleStartMatch}
                onCompleteMatch={handleCompleteMatch}
                onMatchCompleted={loadSession}
                onPlayerClick={handlePlayerClick}
                onOpenManualMatch={(courtNumber) => setManualMatchCourt(courtNumber)}
              />
              </ErrorBoundary>

              {/* Club Raid assignment panel */}
              {state.session.matchingMode === 'club_raid' && (
                <ErrorBoundary sectionName="Club Raid">
                  <ClubRaidPanel
                    sessionId={sessionId!}
                    players={(state.playerStats ?? []).map(p => ({ id: p.playerId, name: p.playerName }))}
                    refreshToken={scheduleRefreshToken}
                    onScheduleGenerated={loadSession}
                  />
                </ErrorBoundary>
              )}

              {/* Highlights ticker */}
              {state.highlights && state.highlights.length > 0 && (
                <HighlightsTicker highlights={state.highlights} />
              )}

              {/* Queue second — hidden for Club Raid (scheduling is handled by the Club Raid panel) */}
              <ErrorBoundary sectionName="Queue">
              {state.session.matchingMode === 'comeback' ? (
                <>
                {(() => {
                  const gameMode = state.session.gameMode || 'doubles';
                  const playersPerMatch = gameMode === 'singles' ? 2 : 4;
                  const activeIds = new Set(state.activeMatches.flatMap(m => m.playerIds || []));
                  const getBracketNextIds = (bracketQueue: EnrichedQueueEntry[]) =>
                    bracketQueue
                      .filter(e => !activeIds.has(e.playerId))
                      .slice(0, playersPerMatch)
                      .flatMap(e => [e.playerId, ...(e.isPairSlot && e.partnerPlayerId ? [e.partnerPlayerId] : [])]);
                  const winnersNext = getBracketNextIds(enrichedQueue.filter(e => e.lastResult === 'win'));
                  const losersNext = getBracketNextIds(enrichedQueue.filter(e => e.lastResult === 'loss'));
                  const neutralNext = getBracketNextIds(enrichedQueue.filter(e => e.lastResult == null));
                  return (
                <div className="comeback-queues">
                  <div className="comeback-bracket comeback-bracket--winners">
                    <div className="comeback-bracket__header">
                      <span className="comeback-bracket__title"><span className="comeback-bracket__icon">🏆</span> Winners</span>
                      <span className="comeback-bracket__count">{enrichedQueue.filter(e => e.lastResult === 'win').length}</span>
                    </div>
                    <div className="comeback-bracket__body">
                      <QueuePanel
                        queue={enrichedQueue.filter(e => e.lastResult === 'win')}
                        sessionId={sessionId!}
                        gameMode={gameMode}
                        matchingMode={state.session.matchingMode || 'balanced'}
                        diversity={state.diversity}
                        waitEstimates={state.waitEstimates}
                        variant="winners"
                        activeMatchPlayerIds={state.activeMatches.flatMap(m => m.playerIds || [])}
                        onMoveUp={handleMoveUp}
                        onMoveDown={handleMoveDown}
                        onRemove={handleRemove}
                        onPlayerClick={handlePlayerClick}
                        onCheckIn={handleCheckIn}
                        onPairChanged={loadSession}
                        onStarRatingChange={handleStarRatingChange}
                        nextMatchPlayerIds={winnersNext}
                      />
                    </div>
                  </div>
                  <div className="comeback-bracket comeback-bracket--losers">
                    <div className="comeback-bracket__header">
                      <span className="comeback-bracket__title"><span className="comeback-bracket__icon">💪</span> Losers</span>
                      <span className="comeback-bracket__count">{enrichedQueue.filter(e => e.lastResult === 'loss').length}</span>
                    </div>
                    <div className="comeback-bracket__body">
                      <QueuePanel
                        queue={enrichedQueue.filter(e => e.lastResult === 'loss')}
                        sessionId={sessionId!}
                        gameMode={gameMode}
                        matchingMode={state.session.matchingMode || 'balanced'}
                        diversity={state.diversity}
                        waitEstimates={state.waitEstimates}
                        variant="losers"
                        activeMatchPlayerIds={state.activeMatches.flatMap(m => m.playerIds || [])}
                        onMoveUp={handleMoveUp}
                        onMoveDown={handleMoveDown}
                        onRemove={handleRemove}
                        onPlayerClick={handlePlayerClick}
                        onCheckIn={handleCheckIn}
                        onPairChanged={loadSession}
                        onStarRatingChange={handleStarRatingChange}
                        nextMatchPlayerIds={losersNext}
                      />
                    </div>
                  </div>
                  <div className="comeback-bracket comeback-bracket--neutral">
                    <div className="comeback-bracket__header">
                      <span className="comeback-bracket__title"><span className="comeback-bracket__icon">⏳</span> Neutral</span>
                      <span className="comeback-bracket__count">{enrichedQueue.filter(e => e.lastResult == null).length}</span>
                    </div>
                    <div className="comeback-bracket__body">
                      <QueuePanel
                        queue={enrichedQueue.filter(e => e.lastResult == null)}
                        sessionId={sessionId!}
                        gameMode={gameMode}
                        matchingMode={state.session.matchingMode || 'balanced'}
                        diversity={state.diversity}
                        waitEstimates={state.waitEstimates}
                        variant="neutral"
                        activeMatchPlayerIds={state.activeMatches.flatMap(m => m.playerIds || [])}
                        onMoveUp={handleMoveUp}
                        onMoveDown={handleMoveDown}
                        onRemove={handleRemove}
                        onPlayerClick={handlePlayerClick}
                        onCheckIn={handleCheckIn}
                        onPairChanged={loadSession}
                        onStarRatingChange={handleStarRatingChange}
                        nextMatchPlayerIds={neutralNext}
                      />
                    </div>
                  </div>
                </div>
                );
                })()}
                </>
              ) : (
                state.session.matchingMode !== 'club_raid' && (
                <QueuePanel
                  queue={enrichedQueue}
                  sessionId={sessionId!}
                  gameMode={state.session.gameMode || 'doubles'}
                  matchingMode={state.session.matchingMode || 'balanced'}
                  diversity={state.diversity}
                  waitEstimates={state.waitEstimates}
                  fixedPairs={fixedPairs}
                  activeMatchPlayerIds={state.activeMatches.flatMap(m => m.playerIds || [])}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                  onRemove={handleRemove}
                  onPlayerClick={handlePlayerClick}
                  onCheckIn={handleCheckIn}
                  onPairChanged={loadSession}
                  onStarRatingChange={handleStarRatingChange}
                  nextMatchPlayerIds={(state as any).nextMatchPlayerIds}
                />
                )
              )}
              </ErrorBoundary>
            </>
          )}

          {/* Bench Players — not yet in queue */}
          {state.benchPlayers && state.benchPlayers.length > 0 && (
            <section className="card" style={{ padding: 'var(--space-lg)' }} aria-label="Bench Players">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                <h3 style={{ margin: 0 }}>Bench <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>({state.benchPlayers.length})</span></h3>
                <button
                  onClick={async () => {
                    if (!sessionId || !state.benchPlayers) return;
                    for (const p of state.benchPlayers) {
                      await joinQueue(sessionId, p.id);
                    }
                    await loadSession();
                  }}
                  style={{
                    padding: '0.3rem 0.7rem',
                    border: '1px solid var(--color-success)',
                    borderRadius: 'var(--radius-full)',
                    background: 'transparent',
                    color: 'var(--color-success)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                  }}
                >
                  Add All to Queue
                </button>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {state.benchPlayers.map((player) => (
                  <li key={player.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-sm) 0',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontWeight: 'var(--font-medium)', fontSize: 'var(--text-sm)' }}>{player.name}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {'★'.repeat(player.starRating)}{'☆'.repeat(5 - player.starRating)}
                        {player.matchesPlayed > 0 && ` · ${player.wins}W-${player.losses}L`}
                      </span>
                    </div>
                    <button
                      onClick={() => handleJoinQueue(player.id)}
                      style={{
                        padding: '0.3rem 0.6rem',
                        border: '1px solid var(--color-success)',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(34, 197, 94, 0.1)',
                        color: 'var(--color-success)',
                        cursor: 'pointer',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                      }}
                    >
                      → Queue
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Session Quality Card — hidden for now */}
          {/* <section className="organizer-dashboard__quality-card card" style={{ padding: 'var(--space-lg)' }} aria-label="Session Quality">
            <h3>Session Quality</h3>
            {!state.qualityMetrics || state.qualityMetrics.sessionQualityScore == null ? (
              <p className="text-secondary">N/A</p>
            ) : (
              <>
                <p className={
                  state.qualityMetrics.sessionQualityScore >= 70
                    ? 'text-green-500'
                    : state.qualityMetrics.sessionQualityScore >= 40
                      ? 'text-amber-500'
                      : 'text-red-500'
                }>
                  <strong>
                    {state.qualityMetrics.sessionQualityScore >= 70
                      ? '🟢 Great matches'
                      : state.qualityMetrics.sessionQualityScore >= 40
                        ? '🟡 Decent matches'
                        : '🔴 Lopsided matches'}
                  </strong>
                </p>
                {state.qualityMetrics.recentMatchRatings.length > 0 && (
                  <ul className="organizer-dashboard__recent-ratings" style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', maxHeight: '20rem', overflowY: 'auto' }}>
                    {state.qualityMetrics.recentMatchRatings.map((r, i) => (
                      <li key={i} style={{ padding: '0.2rem 0', fontSize: '0.9rem' }}>
                        Match {i + 1} · Court {r.courtNumber}:{' '}
                        <span style={{ color: r.rating >= 70 ? '#16a34a' : r.rating >= 40 ? '#d97706' : '#dc2626', fontWeight: 600 }}>
                          {r.rating >= 70 ? 'Competitive' : r.rating >= 40 ? 'Decent' : 'Lopsided'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section> */}

          {/* Leaderboard Card at the bottom */}
          {/* Session Awards */}
          {(state as any).sessionAwards && (state as any).sessionAwards.length > 0 && (
            <SessionAwards awards={(state as any).sessionAwards} />
          )}

          {/* Leaderboard Card */}
          {(state.playerStats ?? []).length > 0 && (
            <section className="organizer-dashboard__leaderboard-card">
              <LeaderboardCard playerStats={(state.playerStats ?? []) as import('../types').PlayerStats[]} />
            </section>
          )}

          {/* Results panel — review & correct completed match scores/winners */}
          {state.session.gameMode !== 'mlp' && (
            <ErrorBoundary sectionName="Results">
              <ResultsPanel
                sessionId={sessionId!}
                onChanged={loadSession}
              />
            </ErrorBoundary>
          )}

          {/* Stats Bar */}
          <StatsBar
            totalPlayers={(state.playerStats ?? []).length || state.queue.length}
            matchesPlayed={state.totalCompletedMatches ?? 0}
            averageWinRate={
              (state.playerStats ?? []).length > 0
                ? (state.playerStats ?? []).reduce((sum, s) => sum + s.winRate, 0) / (state.playerStats ?? []).length
                : 0
            }
            inQueue={state.queue.length}
            activeCourts={(state.courts ?? []).filter((c) => c.status === 'active').length}
            courtCount={state.session.courtCount ?? (state.courts ?? []).length}
          />

          {/* Session Settings Button */}
          <section className="organizer-dashboard__settings-row">
            <button
              onClick={() => setShowSettingsModal(true)}
              aria-label="Open session settings"
              className="organizer-dashboard__settings-btn"
            >
              ⚙ Settings
            </button>
          </section>

          <section className="organizer-dashboard__end-section">
            <button
              onClick={handleEndSession}
              aria-label="End session"
              className="organizer-dashboard__end-btn"
            >
              End Session
            </button>
          </section>
        </>
      )}

      {/* Player Profile Card Modal */}
      {selectedPlayer && sessionId && (
        <PlayerProfileCard
          sessionId={sessionId}
          playerId={selectedPlayer.playerId}
          onClose={handleCloseProfile}
          diversityPercentage={state.diversity?.[selectedPlayer.playerId] ?? 0}
          onStarRatingChange={handleStarRatingChange}
        />
      )}

      {/* Session Settings Modal (edit mode) */}
      {showSettingsModal && sessionId && (
        <SessionSettingsModal
          sessionId={sessionId}
          initialSettings={{
            name: state.session.name,
            courtCount: state.session.courtCount,
            matchingMode: state.session.matchingMode,
          }}
          onConfirm={() => {
            setShowSettingsModal(false);
            loadSession();
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Manual Match Selection Modal */}
      {manualMatchCourt !== null && sessionId && (
        <ManualMatchModal
          sessionId={sessionId}
          courtNumber={manualMatchCourt}
          gameMode={(state.session.gameMode || 'doubles') as 'doubles' | 'singles'}
          onClose={() => setManualMatchCourt(null)}
          onSuccess={() => {
            setManualMatchCourt(null);
            loadSession();
          }}
        />
      )}

      <ScrollToTopButton />
      <Footer />
    </div>
  );
}

export default OrganizerDashboard;
