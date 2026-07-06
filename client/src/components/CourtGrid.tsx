import { useState, useEffect, useRef, useCallback } from 'react';
import MatchCompleteDialog from './MatchCompleteDialog';
import ReplacePlayerModal from './ReplacePlayerModal';
import { renameCourtName } from '../api';
import type { PlayerStats, Achievement, HeadToHeadRecord, FixedPair } from '../types';

interface Court {
  sessionId: string;
  courtNumber: number;
  status: 'available' | 'active';
}

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

interface CourtGridProps {
  sessionId: string;
  courts: Court[];
  activeMatches: ActiveMatch[];
  queueLength: number;
  playerStats?: PlayerStats[];
  achievements?: Achievement[];
  headToHeadRecords?: Record<string, HeadToHeadRecord[]>;
  courtNames?: Record<string, string>;
  totalCompletedMatches?: number;
  fixedPairs?: FixedPair[];
  autoStart?: boolean;
  onStartMatch: (courtNumber: number) => Promise<void>;
  onCompleteMatch: (courtNumber: number) => Promise<void>;
  onMatchCompleted?: () => void;
  onPlayerClick?: (playerId: string) => void;
}

/** Find stats for a player by ID */
function getStatsForPlayer(playerId: string, playerStats: PlayerStats[]): PlayerStats | null {
  return playerStats.find((s) => s.playerId === playerId) || null;
}

/** Calculate elapsed duration in minutes from a startedAt timestamp */
function getElapsedMinutes(startedAt: string): number {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 60000));
}

/** Render star rating as filled star icons */
function StarRating({ rating }: { rating: number }) {
  return (
    <span className="court-card__stars" aria-label={`${rating} star rating`}>
      {'★'.repeat(rating)}
    </span>
  );
}

/** Determine court status: "active" | "next-up" | "available" */
function getCourtStatus(
  court: Court,
  match: ActiveMatch | undefined,
  isNextUp: boolean
): 'active' | 'next-up' | 'available' {
  if (match) return 'active';
  if (isNextUp) return 'next-up';
  return 'available';
}

/** Get status badge label */
function getStatusLabel(status: 'active' | 'next-up' | 'available'): string {
  switch (status) {
    case 'active':
      return 'In Progress';
    case 'next-up':
      return 'Next Up';
    case 'available':
      return 'Available';
  }
}

/** Check if two players on the same team are part of a fixed pair */
function areTeammatesPaired(player1Id: string, player2Id: string, fixedPairs: FixedPair[]): boolean {
  return fixedPairs.some(
    (pair) =>
      (pair.player1Id === player1Id && pair.player2Id === player2Id) ||
      (pair.player1Id === player2Id && pair.player2Id === player1Id)
  );
}

function CourtCard({
  court,
  match,
  matchIndex,
  isNextUp,
  queueLength,
  playerStats,
  sessionId,
  courtDisplayName,
  totalCompletedMatches,
  fixedPairs,
  countdown,
  onStartMatch,
  onOpenCompleteDialog,
  onOpenReplaceModal,
  onPlayerClick,
  onCancelCountdown,
}: {
  court: Court;
  match: ActiveMatch | undefined;
  matchIndex: number | null;
  isNextUp: boolean;
  queueLength: number;
  playerStats: PlayerStats[];
  sessionId: string;
  courtDisplayName: string;
  totalCompletedMatches: number;
  fixedPairs: FixedPair[];
  countdown: number | null;
  onStartMatch: (courtNumber: number) => Promise<void>;
  onOpenCompleteDialog: (courtNumber: number) => void;
  onOpenReplaceModal: (oldPlayerId: string, courtNumber: number) => void;
  onPlayerClick?: (playerId: string) => void;
  onCancelCountdown: (courtNumber: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(courtDisplayName);
  const status = getCourtStatus(court, match, isNextUp);
  const canStartMatch = !match && queueLength >= 4;

  async function handleStartMatch() {
    onCancelCountdown(court.courtNumber);
    setLoading(true);
    try {
      await onStartMatch(court.courtNumber);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveName() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== courtDisplayName) {
      try {
        await renameCourtName(sessionId, court.courtNumber, trimmed);
        // Trigger a reload by calling onStartMatch's parent refresh
        window.location.reload();
      } catch {
        setEditName(courtDisplayName);
      }
    } else {
      setEditName(courtDisplayName);
    }
    setEditing(false);
  }

  function handleReplacePlayer(oldPlayerId: string) {
    onOpenReplaceModal(oldPlayerId, court.courtNumber);
  }

  const team1 = match ? match.players.slice(0, 2) : [];
  const team2 = match ? match.players.slice(2, 4) : [];

  const cardClassName = `court-card court-card--${status}${countdown !== null ? ' court-card--countdown' : ''}`;

  return (
    <div
      className={cardClassName}
      aria-label={`Court ${court.courtNumber} - ${getStatusLabel(status)}`}
    >
      {/* Countdown overlay */}
      {countdown !== null && (
        <div className="court-card__countdown-overlay" onClick={() => onCancelCountdown(court.courtNumber)}>
          <div className="court-card__countdown-text">
            Starting in {countdown}...
          </div>
          <button
            className="court-card__countdown-cancel"
            onClick={(e) => { e.stopPropagation(); onCancelCountdown(court.courtNumber); }}
            aria-label="Cancel auto-start"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Header: court number badge + status */}
      <div className="court-card__header">
        {editing ? (
          <input
            className="court-card__name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveName}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditName(courtDisplayName); setEditing(false); } }}
            autoFocus
          />
        ) : (
          <span
            className="font-semibold court-card__name-editable"
            onClick={() => { setEditName(courtDisplayName); setEditing(true); }}
            title="Click to rename court"
          >
            {courtDisplayName}
          </span>
        )}
        {status === 'active' && (
          <span className="live-badge" aria-label="Match in progress">
            <span className="live-badge__dot" aria-hidden="true" />
            LIVE
          </span>
        )}
        {status !== 'active' && (
          <span className={`status-badge status-badge--${status}`}>
            {getStatusLabel(status)}
          </span>
        )}
      </div>

      {/* Active match content */}
      {match ? (
        <>
          {/* Teams section */}
          <div className="court-card__teams">
            {/* Team 1 */}
            <div className="court-card__team">
              {team1.length === 2 && areTeammatesPaired(team1[0].id, team1[1].id, fixedPairs) && (
                <span className="court-card__pair-indicator" aria-label="Fixed pair">🔗</span>
              )}
              {team1.map((player) => {
                const stats = getStatsForPlayer(player.id, playerStats);
                return (
                  <div key={player.id} className="court-card__player">
                    <div className="court-card__player-info">
                      <div className="court-card__player-name-row">
                        <div className="court-card__player-name-group">
                          <span
                            className="court-card__player-name"
                            onClick={() => onPlayerClick?.(player.id)}
                            role={onPlayerClick ? 'button' : undefined}
                            tabIndex={onPlayerClick ? 0 : undefined}
                            onKeyDown={(e) => {
                              if (onPlayerClick && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                onPlayerClick(player.id);
                              }
                            }}
                          >
                            {player.name}
                          </span>
                          {stats && stats.streak >= 2 && (
                            <span className="court-card__player-streak" aria-label={`${stats.streak} win streak`}>🔥</span>
                          )}
                          {stats && stats.streak <= -2 && (
                            <span className="court-card__player-streak" aria-label={`${Math.abs(stats.streak)} loss streak`}>❄️</span>
                          )}
                        </div>
                        <button
                          className="replace-icon-btn"
                          onClick={() => handleReplacePlayer(player.id)}
                          aria-label={`Replace player ${player.name}`}
                          disabled={loading}
                          title="Replace player"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                      {stats && (
                        <div className="court-card__player-details">
                          <StarRating rating={stats.starRating} />
                          <span className="court-card__player-record">{stats.wins}W-{stats.losses}L</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* VS divider */}
            <div className="court-card__vs">VS</div>

            {/* Team 2 */}
            <div className="court-card__team">
              {team2.length === 2 && areTeammatesPaired(team2[0].id, team2[1].id, fixedPairs) && (
                <span className="court-card__pair-indicator" aria-label="Fixed pair">🔗</span>
              )}
              {team2.map((player) => {
                const stats = getStatsForPlayer(player.id, playerStats);
                return (
                  <div key={player.id} className="court-card__player">
                    <div className="court-card__player-info">
                      <div className="court-card__player-name-row">
                        <div className="court-card__player-name-group">
                          <span
                            className="court-card__player-name"
                            onClick={() => onPlayerClick?.(player.id)}
                            role={onPlayerClick ? 'button' : undefined}
                            tabIndex={onPlayerClick ? 0 : undefined}
                            onKeyDown={(e) => {
                              if (onPlayerClick && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                onPlayerClick(player.id);
                              }
                            }}
                          >
                            {player.name}
                          </span>
                          {stats && stats.streak >= 2 && (
                            <span className="court-card__player-streak" aria-label={`${stats.streak} win streak`}>🔥</span>
                          )}
                          {stats && stats.streak <= -2 && (
                            <span className="court-card__player-streak" aria-label={`${Math.abs(stats.streak)} loss streak`}>❄️</span>
                          )}
                        </div>
                        <button
                          className="replace-icon-btn"
                          onClick={() => handleReplacePlayer(player.id)}
                          aria-label={`Replace player ${player.name}`}
                          disabled={loading}
                          title="Replace player"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                      {stats && (
                        <div className="court-card__player-details">
                          <StarRating rating={stats.starRating} />
                          <span className="court-card__player-record">{stats.wins}W-{stats.losses}L</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer: match number + elapsed duration */}
          <div className="court-card__footer">
            <span>Match #{matchIndex !== null ? totalCompletedMatches + matchIndex + 1 : '—'}</span>
            <span>{getElapsedMinutes(match.startedAt)}m</span>
          </div>

          {/* Complete Match button */}
          <button
            className="court-card__action"
            onClick={() => onOpenCompleteDialog(court.courtNumber)}
            disabled={loading}
            aria-label={`Complete match on court ${court.courtNumber}`}
          >
            Complete Match
          </button>
        </>
      ) : (
        /* Available court content */
        <div className="court-card__available-content">
          {canStartMatch ? (
            <button
              className="court-card__start-btn"
              onClick={handleStartMatch}
              disabled={loading}
              aria-label={`Start match on court ${court.courtNumber}`}
            >
              {loading ? '...' : 'GO'}
            </button>
          ) : (
            <p className="court-card__empty-text">
              Waiting for players ({queueLength}/4)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CourtGrid({
  sessionId,
  courts,
  activeMatches,
  queueLength,
  playerStats = [],
  achievements = [],
  headToHeadRecords = {},
  courtNames = {},
  totalCompletedMatches = 0,
  fixedPairs = [],
  autoStart = false,
  onStartMatch,
  onCompleteMatch,
  onMatchCompleted,
  onPlayerClick,
}: CourtGridProps) {
  const [dialogCourtNumber, setDialogCourtNumber] = useState<number | null>(null);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [replaceCourtNumber, setReplaceCourtNumber] = useState<number | null>(null);
  const [replaceOldPlayerId, setReplaceOldPlayerId] = useState<string | null>(null);

  // Track countdown state per court: courtNumber -> seconds remaining
  const [countdowns, setCountdowns] = useState<Record<number, number>>({});
  const countdownTimersRef = useRef<Record<number, ReturnType<typeof setInterval>>>({});

  // Track previous court statuses to detect active -> available transitions
  const prevCourtStatusesRef = useRef<Record<number, string>>({});

  // Detect court transitions from active to available (match just completed)
  useEffect(() => {
    const prevStatuses = prevCourtStatusesRef.current;

    courts.forEach((court) => {
      const match = activeMatches.find(
        (m) => m.courtNumber === court.courtNumber && m.status === 'active'
      );
      const currentStatus = match ? 'active' : 'available';
      const prevStatus = prevStatuses[court.courtNumber];

      // Trigger countdown only when transitioning from active to available
      if (
        autoStart &&
        prevStatus === 'active' &&
        currentStatus === 'available' &&
        queueLength >= 4 &&
        !countdowns[court.courtNumber]
      ) {
        startCountdown(court.courtNumber);
      }

      prevStatuses[court.courtNumber] = currentStatus;
    });
  }, [courts, activeMatches, autoStart, queueLength]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCountdown = useCallback((courtNumber: number) => {
    // Clear any existing timer for this court
    if (countdownTimersRef.current[courtNumber]) {
      clearInterval(countdownTimersRef.current[courtNumber]);
    }

    setCountdowns((prev) => ({ ...prev, [courtNumber]: 3 }));

    const timer = setInterval(() => {
      setCountdowns((prev) => {
        const current = prev[courtNumber];
        if (current === undefined || current <= 1) {
          // Countdown finished - trigger match start
          clearInterval(countdownTimersRef.current[courtNumber]);
          delete countdownTimersRef.current[courtNumber];
          // Use setTimeout to avoid state update during render
          setTimeout(() => {
            onStartMatch(courtNumber);
          }, 0);
          const { [courtNumber]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [courtNumber]: current - 1 };
      });
    }, 1000);

    countdownTimersRef.current[courtNumber] = timer;
  }, [onStartMatch]);

  const cancelCountdown = useCallback((courtNumber: number) => {
    if (countdownTimersRef.current[courtNumber]) {
      clearInterval(countdownTimersRef.current[courtNumber]);
      delete countdownTimersRef.current[courtNumber];
    }
    setCountdowns((prev) => {
      const { [courtNumber]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(countdownTimersRef.current).forEach(clearInterval);
    };
  }, []);

  // Cancel countdown if a match starts on a court (manual start during countdown)
  useEffect(() => {
    Object.keys(countdowns).forEach((key) => {
      const courtNumber = Number(key);
      const match = activeMatches.find(
        (m) => m.courtNumber === courtNumber && m.status === 'active'
      );
      if (match) {
        cancelCountdown(courtNumber);
      }
    });
  }, [activeMatches, countdowns, cancelCountdown]);

  function getMatchForCourt(courtNumber: number): ActiveMatch | undefined {
    return activeMatches.find(
      (m) => m.courtNumber === courtNumber && m.status === 'active'
    );
  }

  /** Get the match index (sequential within session) for display */
  function getMatchIndex(match: ActiveMatch): number | null {
    const idx = activeMatches.indexOf(match);
    return idx >= 0 ? idx : null;
  }

  /** Determine which available court is "next up" (first available court that will receive players) */
  function getNextUpCourtNumber(): number | null {
    const availableCourts = courts.filter(
      (c) => c.status === 'available' && !getMatchForCourt(c.courtNumber)
    );
    if (availableCourts.length === 0) return null;
    // The first available court (lowest number) is "next up" when there are enough players
    if (queueLength >= 4) {
      return availableCourts[0].courtNumber;
    }
    return null;
  }

  function handleOpenCompleteDialog(courtNumber: number) {
    setDialogCourtNumber(courtNumber);
  }

  function handleCloseDialog() {
    setDialogCourtNumber(null);
  }

  function handleMatchCompleted() {
    setDialogCourtNumber(null);
    if (onMatchCompleted) {
      onMatchCompleted();
    }
  }

  function handleOpenReplaceModal(oldPlayerId: string, courtNumber: number) {
    setReplaceOldPlayerId(oldPlayerId);
    setReplaceCourtNumber(courtNumber);
    setReplaceModalOpen(true);
  }

  function handleCloseReplaceModal() {
    setReplaceModalOpen(false);
    setReplaceOldPlayerId(null);
    setReplaceCourtNumber(null);
  }

  const dialogMatch = dialogCourtNumber !== null ? getMatchForCourt(dialogCourtNumber) : undefined;
  const nextUpCourtNumber = getNextUpCourtNumber();

  // Suppress unused variable warnings for optional props used in interface only
  void achievements;
  void headToHeadRecords;

  return (
    <>
      {courts.map((court) => {
        const match = getMatchForCourt(court.courtNumber);
        const matchIndex = match ? getMatchIndex(match) : null;
        const isNextUp = court.courtNumber === nextUpCourtNumber;

        return (
          <CourtCard
            key={court.courtNumber}
            court={court}
            match={match}
            matchIndex={matchIndex}
            isNextUp={isNextUp}
            queueLength={queueLength}
            playerStats={playerStats}
            sessionId={sessionId}
            courtDisplayName={courtNames[String(court.courtNumber)] || `Court ${court.courtNumber}`}
            totalCompletedMatches={totalCompletedMatches}
            fixedPairs={fixedPairs}
            countdown={countdowns[court.courtNumber] ?? null}
            onStartMatch={onStartMatch}
            onOpenCompleteDialog={handleOpenCompleteDialog}
            onOpenReplaceModal={handleOpenReplaceModal}
            onPlayerClick={onPlayerClick}
            onCancelCountdown={cancelCountdown}
          />
        );
      })}

      {/* Match Complete Dialog */}
      {dialogCourtNumber !== null && dialogMatch && (
        <MatchCompleteDialog
          sessionId={sessionId}
          courtNumber={dialogCourtNumber}
          players={dialogMatch.players}
          matchStartedAt={dialogMatch.startedAt}
          onClose={handleCloseDialog}
          onComplete={handleMatchCompleted}
        />
      )}
      {replaceModalOpen && replaceCourtNumber !== null && replaceOldPlayerId && (
        <ReplacePlayerModal
          sessionId={sessionId}
          courtNumber={replaceCourtNumber}
          oldPlayerId={replaceOldPlayerId}
          onClose={handleCloseReplaceModal}
          onSuccess={() => { window.location.reload(); }}
        />
      )}
    </>
  );
}

export default CourtGrid;
