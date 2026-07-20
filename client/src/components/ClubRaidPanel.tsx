import { useState, useEffect, useCallback } from 'react';
import {
  getClubRaidClubs,
  addPlayerToClub,
  removePlayerFromClub,
  autoAssignClubRaidPlayers,
  generateClubRaidSchedule,
  addClubRaidRound,
  getClubRaidSchedule,
  startClubRaidMatch,
} from '../api';
import type { Club, ClubMember, ClubRaidMatch } from '../types';

interface Player {
  id: string;
  name: string;
}

interface ClubRaidPanelProps {
  sessionId: string;
  players: Player[];
  onScheduleGenerated?: () => void;
}

interface ClubWithMembers extends Club {
  members: ClubMember[];
}

export default function ClubRaidPanel({ sessionId, players, onScheduleGenerated }: ClubRaidPanelProps) {
  const [clubs, setClubs] = useState<ClubWithMembers[]>([]);
  const [schedule, setSchedule] = useState<ClubRaidMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

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
    } catch {
      setSchedule([]);
    }
  }, [sessionId]);

  useEffect(() => {
    loadClubs();
  }, [loadClubs]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const clubMap = new Map(clubs.map(c => [c.id, c]));
  const assignedPlayerIds = new Set(clubs.flatMap(c => c.members.map(m => m.playerId)));
  const unassignedPlayers = players.filter(p => !assignedPlayerIds.has(p.id));

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
    try {
      await startClubRaidMatch(sessionId, clubRaidMatchId);
      await loadSchedule();
      onScheduleGenerated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start match');
    } finally {
      setLoading(false);
    }
  }

  if (clubs.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Club Raid Setup</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          Create clubs and assign players to get started.
        </p>
        {error && (
          <div className="toast toast--error" style={{ marginBottom: '0.75rem' }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="toast__close">✕</button>
          </div>
        )}
        <button
          onClick={handleAutoAssign}
          disabled={loading || players.length < 4}
          className="btn btn--primary"
          style={{ marginRight: '0.5rem' }}
        >
          {loading ? 'Creating...' : 'Create Clubs & Auto-Assign'}
        </button>
        {players.length < 4 && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Need at least 4 players
          </span>
        )}
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleAutoAssign}
            disabled={loading}
            className="btn btn--secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          >
            {loading ? '...' : 'Re-Shuffle'}
          </button>
          <button
            onClick={handleGenerateSchedule}
            disabled={loading}
            className="btn btn--primary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          >
            {loading ? '...' : schedule.length > 0 ? 'Regenerate Schedule' : 'Generate Schedule'}
          </button>
        </div>
      </div>

      {error && (
        <div className="toast toast--error" style={{ marginBottom: '0.75rem' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="toast__close">✕</button>
        </div>
      )}

      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        {selectedPlayerId
          ? 'Now click a club to assign the selected player, or click another player to switch selection.'
          : 'Click a player to select them, then click a club to assign. Or use Re-Shuffle to auto-assign.'}
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Unassigned players */}
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

        {/* Club columns */}
        {clubs.map(club => (
          <div
            key={club.id}
            style={{ flex: '1 1 180px', minWidth: '160px' }}
          >
            <div
              onClick={() => selectedPlayerId && handleAssignToClub(club.id)}
              style={{
                fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.5px', color: club.color,
                marginBottom: '0.5rem', padding: '0.5rem',
                background: `${club.color}15`, borderRadius: '6px',
                cursor: selectedPlayerId ? 'pointer' : 'default',
                border: selectedPlayerId ? `2px dashed ${club.color}` : 'none',
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
                    <button
                      onClick={() => handleRemoveFromClub(club.id, member.playerId)}
                      disabled={loading}
                      title="Remove from club"
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.3rem',
                        border: '1px solid #ef444440',
                        borderRadius: '3px',
                        background: '#ef444410',
                        color: '#ef4444',
                        cursor: 'pointer',
                        flexShrink: 0,
                        marginLeft: '0.25rem',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {clubs.filter(c => c.id !== club.id).map(otherClub => (
                      <button
                        key={otherClub.id}
                        onClick={() => handleMovePlayer(club.id, member.playerId, otherClub.id)}
                        disabled={loading}
                        title={`Move to ${otherClub.name}`}
                        style={{
                          fontSize: '0.6rem',
                          padding: '0.1rem 0.3rem',
                          border: `1px solid ${otherClub.color}40`,
                          borderRadius: '3px',
                          background: `${otherClub.color}10`,
                          color: otherClub.color,
                          cursor: 'pointer',
                        }}
                      >
                        →{otherClub.name.slice(-1)}
                      </button>
                    ))}
                  </div>
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
              Round-Robin Schedule ({schedule.length} matches)
            </h4>
            <button
              onClick={handleAddRound}
              disabled={loading}
              className="btn btn--secondary"
              style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
            >
              + Add Round
            </button>
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
                            {pairMatches.some(m => m.status === 'scheduled') && (
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
                              <span style={{
                                fontSize: '0.6rem',
                                padding: '0.1rem 0.3rem',
                                borderRadius: '3px',
                                color: statusColors[m.status] || '#999',
                                background: `${statusColors[m.status] || '#999'}15`,
                              }}>
                                {m.status}
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
                              {m.status === 'scheduled' && (
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
    </div>
  );
}
