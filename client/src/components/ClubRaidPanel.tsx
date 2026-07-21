import { useState, useEffect, useCallback } from 'react';
import {
  getClubRaidClubs,
  addPlayerToClub,
  removePlayerFromClub,
  autoAssignClubRaidPlayers,
  generateClubRaidSchedule,
  addClubRaidRound,
  getClubRaidSchedule,
  getClubRaidStandings,
  startClubRaidMatch,
} from '../api';
import type { Club, ClubMember, ClubRaidMatch, ClubRaidPlayOrder, ClubRaidPlayMatch, ClubStandings } from '../types';

interface Player {
  id: string;
  name: string;
}

interface ClubRaidPanelProps {
  sessionId: string;
  players: Player[];
  refreshToken?: number;
  onScheduleGenerated?: () => void;
  readOnly?: boolean;
}

interface ClubWithMembers extends Club {
  members: ClubMember[];
}

export default function ClubRaidPanel({ sessionId, players, refreshToken, onScheduleGenerated, readOnly }: ClubRaidPanelProps) {
  const [clubs, setClubs] = useState<ClubWithMembers[]>([]);
  const [schedule, setSchedule] = useState<ClubRaidMatch[]>([]);
  const [playOrder, setPlayOrder] = useState<ClubRaidPlayOrder | null>(null);
  const [standings, setStandings] = useState<ClubStandings[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playOrderError, setPlayOrderError] = useState<string | null>(null);

  const loadClubs = useCallback(async () => {
    try {
      const data = await getClubRaidClubs(sessionId);
      setClubs(data.clubs);
    } catch {
      setClubs([]);
    }
  }, [sessionId]);

  const loadSchedule = useCallback(async () => {
    try {
      const data = await getClubRaidSchedule(sessionId);
      setSchedule(data.matches);
      setPlayOrder(data.playOrder || null);
      const standingsData = await getClubRaidStandings(sessionId);
      setStandings(standingsData.standings || []);
    } catch {
      setSchedule([]);
      setPlayOrder(null);
      setStandings([]);
    }
  }, [sessionId]);

  useEffect(() => {
    loadClubs();
  }, [loadClubs]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Reload clubs and schedule whenever the parent refreshes session data (e.g.
  // club assignments or match results were updated on the dashboard).
  useEffect(() => {
    if (refreshToken && refreshToken > 0) {
      loadClubs();
      loadSchedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const clubMap = new Map(clubs.map(c => [c.id, c]));
  const assignedPlayerIds = new Set(clubs.flatMap(c => c.members.map(m => m.playerId)));
  const unassignedPlayers = players.filter(p => !assignedPlayerIds.has(p.id));
  // Once the round-robin schedule is generated, the player↔club assignments are
  // locked — changing them would invalidate the already-built matches.
  const scheduleGenerated = schedule.length > 0;
  const matchesStarted = schedule.some(m => m.status === 'active' || m.status === 'completed');

  // Map a play-order match id to its schedule status, so the Fair Play Order can
  // show live/completed state and disable already-started matches.
  const scheduleStatusById = new Map(schedule.map(m => [m.id, m]));

  async function handleAutoAssign() {
    setLoading(true);
    setError(null);
    try {
      const data = await autoAssignClubRaidPlayers(sessionId);
      setClubs(data.clubs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to auto-assign');
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignToClub(clubId: string) {
    if (!selectedPlayerId) return;
    setLoading(true);
    setError(null);
    try {
      await addPlayerToClub(sessionId, clubId, selectedPlayerId);
      setSelectedPlayerId(null);
      await loadClubs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign player');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveFromClub(clubId: string, playerId: string) {
    setLoading(true);
    setError(null);
    try {
      await removePlayerFromClub(sessionId, clubId, playerId);
      await loadClubs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player');
    } finally {
      setLoading(false);
    }
  }

  async function handleMovePlayer(fromClubId: string, playerId: string, toClubId: string) {
    if (fromClubId === toClubId) return;
    setLoading(true);
    setError(null);
    try {
      await removePlayerFromClub(sessionId, fromClubId, playerId);
      await addPlayerToClub(sessionId, toClubId, playerId);
      await loadClubs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move player');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateSchedule() {
    setLoading(true);
    setError(null);
    try {
      await generateClubRaidSchedule(sessionId);
      await loadSchedule();
      onScheduleGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRound() {
    setLoading(true);
    setError(null);
    try {
      await addClubRaidRound(sessionId);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add round');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartMatch(clubRaidMatchId: string) {
    setLoading(true);
    setError(null);
    setPlayOrderError(null);
    try {
      await startClubRaidMatch(sessionId, clubRaidMatchId);
      await loadSchedule();
      onScheduleGenerated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start match';
      setError(msg);
      setPlayOrderError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (clubs.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Club Raid Setup</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          No clubs configured for this session.
        </p>
      </div>
    );
  }

  const rounds = new Map<number, ClubRaidMatch[]>();
  for (const m of schedule) {
    const existing = rounds.get(m.round) || [];
    existing.push(m);
    rounds.set(m.round, existing);
  }

  const statusColors: Record<string, string> = {
    scheduled: 'var(--color-text-secondary)',
    active: '#f59e0b',
    completed: 'var(--color-success)',
  };

  return (
    <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ margin: 0 }}>Club Raid — Player Assignment</h3>
        {!readOnly && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleAutoAssign}
            disabled={loading || schedule.length > 0}
            className="btn btn--secondary btn--sm"
          >
            {loading ? '...' : 'Assign Players Randomly'}
          </button>
          <button
            onClick={handleGenerateSchedule}
            disabled={loading || matchesStarted}
            className="btn btn--primary btn--sm"
          >
            {loading ? '...' : schedule.length > 0 ? 'Regenerate Schedule' : 'Generate Schedule'}
          </button>
        </div>
        )}
      </div>

      {error && (
        <div className="toast toast--error" style={{ marginBottom: '0.75rem' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="toast__close">✕</button>
        </div>
      )}

      {!readOnly && schedule.length === 0 && (
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        {selectedPlayerId
          ? 'Now click a club to assign the selected player, or click another player to switch selection.'
          : 'Click a player to select them, then click a club to assign. Or use Assign Players Randomly to auto-assign.'}
      </p>
      )}

      {scheduleGenerated && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
          Player assignments are locked because the schedule is already generated. Regenerate the schedule (without changing assignments) if needed.
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Unassigned players — hidden when schedule is generated or readOnly */}
        {!readOnly && schedule.length === 0 && (
        <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.5px', color: 'var(--color-text-secondary)',
            marginBottom: '0.5rem', padding: '0.5rem',
            background: 'var(--color-bg)', borderRadius: '6px',
          }}>
            Unassigned ({unassignedPlayers.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {unassignedPlayers.map(player => (
              <div
                key={player.id}
                onClick={() => setSelectedPlayerId(selectedPlayerId === player.id ? null : player.id)}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  border: selectedPlayerId === player.id
                    ? '2px solid var(--color-success)'
                    : '1px solid var(--color-border)',
                  background: selectedPlayerId === player.id
                    ? 'rgba(132, 195, 65, 0.1)'
                    : 'var(--color-surface)',
                  transition: 'all 0.15s',
                }}
              >
                {player.name}
              </div>
            ))}
            {unassignedPlayers.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '0.5rem' }}>
                All players assigned
              </div>
            )}
          </div>
        </div>
        )}

        {/* Club columns */}
        {clubs.map(club => (
          <div
            key={club.id}
            style={{ flex: '1 1 180px', minWidth: '160px' }}
          >
            <div
              onClick={() => !readOnly && !scheduleGenerated && selectedPlayerId && handleAssignToClub(club.id)}
              style={{
                fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.5px', color: club.color,
                marginBottom: '0.5rem', padding: '0.5rem',
                background: `${club.color}15`, borderRadius: '6px',
                cursor: !readOnly && !scheduleGenerated && selectedPlayerId ? 'pointer' : 'default',
                border: !readOnly && !scheduleGenerated && selectedPlayerId ? `2px dashed ${club.color}` : 'none',
                transition: 'all 0.15s',
              }}
            >
              {club.name} ({club.members.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {club.members.map(member => (
                <div
                  key={member.id}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.25rem',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.playerName || member.playerId}
                    </span>
                    {!readOnly && (
                    <button
                      onClick={() => handleRemoveFromClub(club.id, member.playerId)}
                      disabled={loading || scheduleGenerated}
                      title={scheduleGenerated ? 'Locked — schedule already generated' : 'Remove from club'}
                      style={{
                        all: 'unset',
                        fontSize: '10px',
                        padding: '2px 4px',
                        lineHeight: 1,
                        display: 'inline-block',
                        boxSizing: 'border-box',
                        border: '1px solid #ef444440',
                        borderRadius: '3px',
                        background: '#ef444410',
                        color: '#ef4444',
                        cursor: loading || scheduleGenerated ? 'not-allowed' : 'pointer',
                        flexShrink: 0,
                        textAlign: 'center',
                        opacity: scheduleGenerated ? 0.4 : 1,
                      }}
                    >
                      ✕
                    </button>
                    )}
                  </div>
                  {!readOnly && !scheduleGenerated && (
                  <div className="club-raid-move-btns" style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {clubs.filter(c => c.id !== club.id).map(otherClub => (
                      <button
                        key={otherClub.id}
                        onClick={() => handleMovePlayer(club.id, member.playerId, otherClub.id)}
                        disabled={loading}
                        title={`Move to ${otherClub.name}`}
                        style={{
                          all: 'unset',
                          fontSize: '10px',
                          padding: '2px 4px',
                          lineHeight: 1,
                          display: 'inline-block',
                          boxSizing: 'border-box',
                          border: `1px solid ${otherClub.color}40`,
                          borderRadius: '3px',
                          background: `${otherClub.color}10`,
                          color: otherClub.color,
                          cursor: loading ? 'not-allowed' : 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        →{otherClub.name.slice(-1)}
                      </button>
                    ))}
                  </div>
                  )}
                </div>
              ))}
              {club.members.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '0.5rem' }}>
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Schedule Section */}
      {schedule.length > 0 && (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1rem 0' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
              Round-Robin ({schedule.length} matches)
            </h4>
            {!readOnly && (
            <button
              onClick={handleAddRound}
              disabled={loading}
              className="btn btn--secondary"
              style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
            >
              + Add Round
            </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Array.from(rounds.entries()).sort((a, b) => a[0] - b[0]).map(([round, roundMatches]) => {
              // Group by pairing within the round
              const pairings = new Map<string, ClubRaidMatch[]>();
              for (const m of roundMatches) {
                const key = [m.clubAId, m.clubBId].sort().join(':');
                const existing = pairings.get(key) || [];
                existing.push(m);
                pairings.set(key, existing);
              }

              return (
                <div key={round}>
                  <div style={{
                    fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.5px', color: 'var(--color-text-secondary)',
                    marginBottom: '0.375rem',
                  }}>
                    Round {round}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {Array.from(pairings.entries()).map(([pairKey, pairMatches]) => {
                      const firstMatch = pairMatches[0];
                      const clubA = clubMap.get(firstMatch.clubAId);
                      const clubB = clubMap.get(firstMatch.clubBId);
                      const completedCount = pairMatches.filter(m => m.status === 'completed').length;
                      const activeCount = pairMatches.filter(m => m.status === 'active').length;
                      const totalPair = pairMatches.length;

                      return (
                        <div key={pairKey} style={{
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px',
                          overflow: 'hidden',
                        }}>
                          {/* Pairing header */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            background: 'var(--color-bg)',
                            fontSize: '0.8rem',
                          }}>
                            <span style={{ color: clubA?.color || '#999', fontWeight: 600 }}>
                              {clubA?.name || '???'}
                            </span>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.7rem' }}>vs</span>
                            <span style={{ color: clubB?.color || '#999', fontWeight: 600 }}>
                              {clubB?.name || '???'}
                            </span>
                            <span style={{
                              fontSize: '0.6rem',
                              color: 'var(--color-text-secondary)',
                              marginLeft: '0.25rem',
                            }}>
                              ({completedCount}/{totalPair} complete{activeCount > 0 ? `, ${activeCount} live` : ''})
                            </span>
                            <div style={{ flex: 1 }} />
                            {/* Show next scheduled match's Start button for the pairing */}
                            {!readOnly && pairMatches.some(m => m.status === 'scheduled') && (
                              <button
                                onClick={() => {
                                  const next = pairMatches.find(m => m.status === 'scheduled');
                                  if (next) handleStartMatch(next.id);
                                }}
                                disabled={loading}
                                className="btn btn--primary"
                                style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
                              >
                                Start Next
                              </button>
                            )}
                          </div>
                          {/* Individual sub-matches */}
                          {pairMatches.map((m, idx) => (
                            <div
                              key={m.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.35rem 0.75rem 0.35rem 1.25rem',
                                fontSize: '0.75rem',
                                borderTop: '1px solid var(--color-border)',
                              }}
                            >
                              <span style={{ color: 'var(--color-text-secondary)', minWidth: '1rem' }}>
                                {idx + 1}.
                              </span>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {m.clubAPlayer1Name && m.clubAPlayer2Name && (
                                  <span style={{ color: clubA?.color || '#999', fontWeight: 500, fontSize: '0.65rem' }}>
                                    {m.clubAPlayer1Name} & {m.clubAPlayer2Name}
                                  </span>
                                )}
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.6rem' }}>vs</span>
                                {m.clubBPlayer1Name && m.clubBPlayer2Name && (
                                  <span style={{ color: clubB?.color || '#999', fontWeight: 500, fontSize: '0.65rem' }}>
                                    {m.clubBPlayer1Name} & {m.clubBPlayer2Name}
                                  </span>
                                )}
                              </div>
                              {m.status === 'active' && (
                                <button
                                  disabled
                                  className="btn btn--primary"
                                  style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem', opacity: 1, background: '#84C341', color: '#fff' }}
                                >
                                  live
                                </button>
                              )}
                              {m.status === 'completed' && (() => {
                                const winnerClub = m.winnerClubId ? clubMap.get(m.winnerClubId) : null;
                                const isClubA = m.winnerClubId === m.clubAId;
                                return (
                                  <span
                                    className="btn btn--primary"
                                    style={{
                                      fontSize: '0.6rem',
                                      padding: '0.15rem 0.4rem',
                                      opacity: 1,
                                      background: '#fff',
                                      color: '#84C341',
                                      flexShrink: 0,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {m.team1Score != null && m.team2Score != null
                                      ? `${m.team1Score}-${m.team2Score}`
                                      : ''}{winnerClub ? ` ${isClubA ? clubA?.name : clubB?.name}` : ''}
                                  </span>
                                );
                              })()}
                              {m.status === 'scheduled' && !readOnly && (
                                <button
                                  onClick={() => handleStartMatch(m.id)}
                                  disabled={loading}
                                  className="btn btn--secondary"
                                  style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem' }}
                                >
                                  Start
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Club Standings Section */}
      {schedule.length > 0 && standings.length > 0 && (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.75rem 0' }}>
            Club Standings
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[...standings]
              .sort((a, b) => b.winRate - a.winRate || b.pointDifferential - a.pointDifferential || b.wins - a.wins)
              .map((s, i) => (
              <div
                key={s.clubId}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.6rem', borderRadius: '6px',
                  border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: '0.75rem',
                }}
              >
                <span style={{ width: '1.25rem', textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  {i + 1}
                </span>
                <span style={{ width: '0.6rem', height: '0.6rem', borderRadius: '50%', background: s.clubColor }} />
                <span style={{ fontWeight: 600, color: s.clubColor, minWidth: '4rem' }}>{s.clubName}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {s.wins}W – {s.losses}L
                </span>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  ({s.matchesPlayed} played)
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ color: 'var(--color-text-secondary)', minWidth: '3.5rem', textAlign: 'right' }}>
                  Diff {s.pointDifferential > 0 ? '+' : ''}{s.pointDifferential}
                </span>
                <span style={{ fontWeight: 600, minWidth: '2.5rem', textAlign: 'right' }}>{s.winRate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fair Play Order Section (visualization only) */}
      {schedule.length > 0 && playOrder && (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem 0' }}>
            Fair Play Order
          </h4>
          {playOrderError && (
            <div className="toast toast--error" style={{ marginBottom: '0.75rem' }}>
              <span>{playOrderError}</span>
              <button onClick={() => setPlayOrderError(null)} className="toast__close">×</button>
            </div>
          )}
          <p style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
            Suggested sequence to balance rest time. Every wave runs all {playOrder.courtCount} court{playOrder.courtCount > 1 ? 's' : ''} at once
            (matches from any pairing), and every interior wave is full. The number on each match (C1, C2, …) is the
            suggested court for that slot — but pressing <strong>Start</strong> simply launches the match on the next
            available court, so you don't have to worry about a slot being taken. Because every player plays every round,
            the next round can't lend matches to fill a round's final wave — so the last wave of each round may use
            fewer courts. The double-player of a pairing plays the first &amp; last wave of their block. Start buttons are
            a guide only; the Round-Robin list above reflects live status and scores.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {playOrder.rounds.map((r) => {
              // Collect all matches across blocks per wave for a unified court view.
              const waveMatches: ClubRaidPlayMatch[][] = [];
              for (let w = 0; w < r.numWaves; w++) {
                waveMatches[w] = r.blocks.flatMap(b => b.matches.filter(m => m.wave === w));
              }
              return (
                <div key={r.round}>
                  <div style={{
                    fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.5px', color: 'var(--color-text-secondary)',
                    marginBottom: '0.5rem',
                  }}>
                    Round {r.round} — {r.numWaves} wave{r.numWaves > 1 ? 's' : ''}
                    {' '}({waveMatches.flat().length} matches · {Math.min(waveMatches.flat().length, playOrder.courtCount)}/{playOrder.courtCount} courts used)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {waveMatches.map((wm, w) => {
                      const busy = Math.min(wm.length, playOrder.courtCount);
                      const idle = playOrder.courtCount - busy;
                      return (
                        <div key={w} style={{
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px', overflow: 'hidden',
                        }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.3rem 0.75rem', background: 'var(--color-bg)', fontSize: '0.7rem',
                          }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>Wave {w + 1}</span>
                            <span style={{ fontSize: '0.6rem', color: 'var(--color-text-secondary)' }}>
                              {busy}/{playOrder.courtCount} courts{idle > 0 ? ` · ${idle} idle` : ''}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', padding: '0.4rem 0.75rem' }}>
                            {wm.map((m) => {
                              const clubA = clubMap.get(m.clubAId);
                              const clubB = clubMap.get(m.clubBId);
                              const suggestedCourt = m.courtSlot + 1;
                              const sched = scheduleStatusById.get(m.matchId);
                              const status = sched?.status ?? 'scheduled';
                              const isLive = status === 'active';
                              const isDone = status === 'completed';
                              const started = isLive || isDone;
                              const nameOf = (pid: string) =>
                                players.find(p => p.id === pid)?.name
                                || clubMap.get(m.clubAId)?.members.find(mm => mm.playerId === pid)?.playerName
                                || clubMap.get(m.clubBId)?.members.find(mm => mm.playerId === pid)?.playerName
                                || pid.slice(0, 4);
                              return (
                                <div key={m.matchId} style={{
                                  flex: '1 1 200px', minWidth: '180px',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: '4px', padding: '0.3rem 0.5rem',
                                  fontSize: '0.7rem',
                                  background: m.isDouble ? 'rgba(245,158,11,0.10)' : 'var(--color-surface)',
                                  display: 'flex', flexDirection: 'column', gap: '0.25rem',
                                  opacity: started ? 0.6 : 1,
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.6rem' }}>
                                      {clubA?.name} vs {clubB?.name}
                                    </span>
                                  </div>
                                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                     <span style={{ color: clubA?.color || '#999', fontWeight: 500, fontSize: '0.65rem' }}>
                                       {nameOf(m.players[0])} &amp; {nameOf(m.players[1])}
                                     </span>
                                     <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.6rem' }}>vs</span>
                                     <span style={{ color: clubB?.color || '#999', fontWeight: 500, fontSize: '0.65rem' }}>
                                       {nameOf(m.players[2])} &amp; {nameOf(m.players[3])}
                                     </span>
                                   </div>
                                   {isDone ? (
                                     sched?.team1Score != null && sched?.team2Score != null ? (
                                       <span style={{
                                         alignSelf: sched.winnerClubId === sched.clubAId ? 'flex-start' : 'flex-end',
                                         fontSize: '0.55rem', padding: '0.1rem 0.35rem',
                                         borderRadius: '3px', background: '#84C341', color: '#fff', fontWeight: 600,
                                       }}>
                                         {sched.team1Score}-{sched.team2Score}
                                       </span>
                                     ) : (
                                       <span style={{
                                         alignSelf: 'flex-start', fontSize: '0.55rem', padding: '0.1rem 0.35rem',
                                         borderRadius: '3px', background: '#84C341', color: '#fff',
                                       }}>
                                         done
                                        </span>
                                      )
                                    ) : isLive ? (
                                     <span style={{
                                      alignSelf: 'flex-start', fontSize: '0.55rem', padding: '0.1rem 0.35rem',
                                      borderRadius: '3px', background: '#84C341', color: '#fff',
                                    }}>
                                      live
                                    </span>
                                   ) : !readOnly ? (
                                    <button
                                      onClick={() => handleStartMatch(m.matchId)}
            disabled={loading}
                                       className="btn btn--primary"
                                       style={{ alignSelf: 'flex-start', fontSize: '0.55rem', padding: '0.1rem 0.4rem' }}
                                      title="Start on next available court"
                                    >
                                      Start ▶
                                    </button>
                                   ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
