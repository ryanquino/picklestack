import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  TournamentTeam,
  TournamentBracket,
  MLPTeamMatchResult,
  MLPTournamentConfig,
} from '../types';
import {
  getTournament,
  startTournamentMatch,
  completeTournamentMatch,
  createTournamentTeam,
  createTournamentTeamsRandom,
  deleteTournamentTeam,
  deleteTournamentTeams,
  generateBracket,
  fixBracket,
  advanceTournamentRound,
  getAllPlayers,
} from '../api';
import BracketDisplay from './BracketDisplay';
import TournamentMatchPanel from './TournamentMatchPanel';

interface TournamentDashboardProps {
  sessionId: string;
  courtCount: number;
  onMatchStarted?: () => void;
}

export default function TournamentDashboard({ sessionId, courtCount, onMatchStarted }: TournamentDashboardProps) {
  const [config, setConfig] = useState<MLPTournamentConfig | null>(null);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [brackets, setBrackets] = useState<TournamentBracket[]>([]);
  const [results, setResults] = useState<MLPTeamMatchResult[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [champion, setChampion] = useState<TournamentTeam | null>(null);
  const [rankings, setRankings] = useState<Array<{ rank: number; team: TournamentTeam; pointDifferential: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamPlayers, setTeamPlayers] = useState<string[]>(['', '', '', '']);
  const [allPlayers, setAllPlayers] = useState<Array<{ id: string; name: string; gender: string | null; starRating: number; status: string }>>([]);
  const [creatingTeam, setCreatingTeam] = useState(false);

  const [completingBracket, setCompletingBracket] = useState<TournamentBracket | null>(null);
  const [subGameScores, setSubGameScores] = useState<Record<string, { team1: number; team2: number; winner: 'teamA' | 'teamB' }>>({});

  const fetchTournament = useCallback(async () => {
    try {
      const data = await getTournament(sessionId);
      setConfig(data.config);
      setTeams(data.teams);
      setBrackets(data.brackets);
      setResults(data.results);
      setIsComplete(data.isComplete);
      setChampion(data.champion);
      setRankings(data.rankings);

      // Auto-fix any stale semifinal byes from old bracket format
      if (data.brackets.length > 0 && data.config?.gameMode === 'mlp') {
        const { changed } = await fixBracket(sessionId);
        if (changed) {
          const fixed = await getTournament(sessionId);
          setBrackets(fixed.brackets);
          setResults(fixed.results);
          setIsComplete(fixed.isComplete);
          setChampion(fixed.champion);
          setRankings(fixed.rankings);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchTournament();
    const interval = setInterval(fetchTournament, 5000);
    return () => clearInterval(interval);
  }, [fetchTournament]);

  const fetchPlayers = useCallback(async () => {
    try {
      const players = await getAllPlayers(sessionId);
      setAllPlayers(players);
    } catch { /* ignore */ }
  }, [sessionId]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const assignedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const team of teams) {
      if (team.player1Id) ids.add(team.player1Id);
      if (team.player2Id) ids.add(team.player2Id);
      if (team.player3Id) ids.add(team.player3Id);
      if (team.player4Id) ids.add(team.player4Id);
    }
    return ids;
  }, [teams]);

  function getAvailablePlayers(excludeIndex: number): Array<{ id: string; name: string; gender: string | null }> {
    const selectedInForm = new Set(teamPlayers.filter((p, i) => i !== excludeIndex && p));
    const requiredGender = excludeIndex < 2 ? 'male' : 'female';
    return allPlayers.filter(p =>
      !assignedPlayerIds.has(p.id) &&
      !selectedInForm.has(p.id) &&
      p.gender === requiredGender
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function handleDeleteTeam(teamId: string) {
    if (!confirm('Delete this team?')) return;
    setCreatingTeam(true);
    setError(null);
    try {
      await deleteTournamentTeam(sessionId, teamId);
      await fetchTournament();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setCreatingTeam(false);
    }
  }

  async function handleCreateTeam() {
    if (!teamName.trim() || teamPlayers.some(p => !p)) {
      setError('Please fill in all fields');
      return;
    }

    setCreatingTeam(true);
    setError(null);
    try {
      await createTournamentTeam(sessionId, teamName.trim(), teamPlayers as [string, string, string, string], teams.length + 1);
      setTeamName('');
      setTeamPlayers(['', '', '', '']);
      setShowTeamForm(false);
      await fetchTournament();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setCreatingTeam(false);
    }
  }

  async function handleRandomTeams() {
    if (!config) {
      setError('Tournament configuration not loaded. Make sure MLP Format was selected when creating the session.');
      return;
    }

    const teamsNeeded = config.teamCount - teams.length;
    if (teamsNeeded <= 0) {
      setError('All team slots are already filled.');
      return;
    }

    const malePlayers = allPlayers
      .filter(p => p.gender === 'male' && !assignedPlayerIds.has(p.id))
      .map(p => p.id);
    const femalePlayers = allPlayers
      .filter(p => p.gender === 'female' && !assignedPlayerIds.has(p.id))
      .map(p => p.id);

    if (malePlayers.length < teamsNeeded * 2 || femalePlayers.length < teamsNeeded * 2) {
      setError(`Need at least ${teamsNeeded * 2} male and ${teamsNeeded * 2} female unassigned players for ${teamsNeeded} more teams. You have ${malePlayers.length} male and ${femalePlayers.length} female available.`);
      return;
    }

    setCreatingTeam(true);
    setError(null);
    try {
      await createTournamentTeamsRandom(sessionId, teamsNeeded, malePlayers, femalePlayers);
      await fetchTournament();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create random teams');
    } finally {
      setCreatingTeam(false);
    }
  }

  async function handleGenerateBracket() {
    if (teams.length < 2) {
      setError('Need at least 2 teams');
      return;
    }

    try {
      await generateBracket(sessionId, teams.map(t => t.id));
      await fetchTournament();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate bracket');
    }
  }

  async function handleStartMatch(courtNumber: number) {
    try {
      await startTournamentMatch(sessionId, courtNumber);
      await fetchTournament();
      onMatchStarted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start match');
    }
  }

  async function handleCompleteMatch() {
    if (!completingBracket) return;

    const subGames = Object.entries(subGameScores).map(([subGame, score]) => ({
      subGame,
      winningTeamId: score.winner === 'teamA' ? completingBracket.teamAId! : completingBracket.teamBId!,
      team1Score: score.team1,
      team2Score: score.team2,
    }));

    const teamAWins = subGames.filter(sg => sg.winningTeamId === completingBracket.teamAId).length;
    const teamBWins = subGames.filter(sg => sg.winningTeamId === completingBracket.teamBId).length;
    const winnerTeamId = teamAWins > teamBWins ? completingBracket.teamAId! : completingBracket.teamBId!;

    try {
      await completeTournamentMatch(
        sessionId,
        completingBracket.id,
        completingBracket.matchId!,
        subGames,
        winnerTeamId,
        subGameScores['dreambreaker'] != null
      );
      setCompletingBracket(null);
      setSubGameScores({});
      await fetchTournament();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete match');
    }
  }

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 1rem' }} />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>Loading tournament...</p>
      </div>
    );
  }

  const hasBracket = brackets.length > 0;
  const canGenerateBracket = teams.length >= 2 && !hasBracket;
  const nextMatch = brackets.find(b => b.teamAId && b.teamBId && !b.matchId && !b.winnerTeamId && !b.isBye);
  const activeBrackets = brackets.filter(b => b.matchId && !b.winnerTeamId);
  const spotsLeft = (config?.teamCount ?? 0) - teams.length;

  // Check if current round is complete and next round can be started.
  // The Third Place match is stored at round 99 — exclude it from round
  // calculations so it doesn't get treated as the latest competitive round.
  const maxRound = hasBracket
    ? Math.max(...brackets.filter(b => b.round !== 99).map(b => b.round))
    : 0;
  const currentRoundBrackets = brackets.filter(b => b.round === maxRound);
  const currentRoundComplete = currentRoundBrackets.length > 0 &&
    currentRoundBrackets.every(b => b.winnerTeamId || b.isBye);
  const nextRoundExists = brackets.some(b => b.round === maxRound + 1);
  const canAdvance = hasBracket && currentRoundComplete && !nextRoundExists && !isComplete;

  async function handleAdvanceRound() {
    if (!sessionId) return;
    setError(null);
    try {
      await advanceTournamentRound(sessionId);
      await fetchTournament();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance round');
    }
  }

  return (
    <div className="tournament-dashboard">
      {error && (
        <div className="toast toast--error" style={{ marginBottom: '1rem' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="toast__close">✕</button>
        </div>
      )}

      {/* Champion Banner */}
      {isComplete && champion && (
        <div className="glass-card champion-banner">
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
          <h2 className="champion-banner__name">{champion.name}</h2>
          <p className="champion-banner__subtitle">Champion</p>
          <div className="champion-banner__players">
            {champion.player1Name} & {champion.player2Name} & {champion.player3Name} & {champion.player4Name}
          </div>
        </div>
      )}

      {/* Rankings */}
      {rankings.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 className="section-title">Rankings</h3>
          <div className="rankings-grid">
            {rankings.map(({ rank, team, pointDifferential }) => (
              <div key={team.id} className="glass-card ranking-card">
                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
                </div>
                <div className="ranking-card__name">{team.name}</div>
                <div className="ranking-card__seed">Seed #{team.seed}</div>
                {pointDifferential !== 0 && (
                  <div className={`ranking-card__pd ${pointDifferential > 0 ? 'ranking-card__pd--positive' : 'ranking-card__pd--negative'}`}>
                    {pointDifferential > 0 ? '+' : ''}{pointDifferential} PD
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Tournament Matches */}
      <TournamentMatchPanel
        sessionId={sessionId}
        activeBrackets={activeBrackets}
        teams={teams}
        onMatchCompleted={fetchTournament}
      />

      {/* Teams Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="section-header">
          <div>
            <h3 className="section-title" style={{ margin: 0 }}>Teams ({teams.length})</h3>
            {config && !hasBracket && (
              <p className="section-subtitle">
                {spotsLeft > 0
                  ? `${spotsLeft} more team${spotsLeft !== 1 ? 's' : ''} needed (${config.teamCount} total)`
                  : `All ${config.teamCount} teams created — ready to generate bracket`}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!hasBracket && (
              <>
                <button
                  type="button"
                  onClick={() => setShowTeamForm(!showTeamForm)}
                  className="btn btn--outline-success"
                >
                  + Add Team
                </button>
                <button
                  type="button"
                  onClick={handleRandomTeams}
                  disabled={creatingTeam || teams.length >= (config?.teamCount ?? 4)}
                  className="btn btn--outline"
                >
                  🎲 Random Teams
                </button>
              </>
            )}
          </div>
        </div>

        {/* Team creation form */}
        {showTeamForm && (
          <div className="glass-card team-form" style={{ marginBottom: '1rem' }}>
            <h4 className="team-form__title">Create New Team</h4>
            <div className="team-form__fields">
              <input
                type="text"
                placeholder="Team name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="input"
              />
              {teamPlayers.map((playerId, idx) => (
                <div key={idx} className="team-form__player-row">
                  <span className="team-form__player-label">
                    {idx < 2 ? '♂' : '♀'} Player {idx + 1}
                  </span>
                  <select
                    value={playerId}
                    onChange={(e) => {
                      const newPlayers = [...teamPlayers];
                      newPlayers[idx] = e.target.value;
                      setTeamPlayers(newPlayers);
                    }}
                    className="select"
                  >
                    <option value="">Select player {idx + 1}</option>
                    {getAvailablePlayers(idx).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.gender ? `(${p.gender === 'male' ? 'M' : 'F'})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="team-form__actions">
                <button
                  type="button"
                  onClick={handleCreateTeam}
                  disabled={creatingTeam}
                  className="btn btn--primary"
                >
                  {creatingTeam ? 'Creating...' : 'Create Team'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowTeamForm(false); setTeamName(''); setTeamPlayers(['', '', '', '']); }}
                  className="btn btn--ghost"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Teams grid */}
        {teams.length === 0 ? (
          <div className="glass-card empty-state">
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏐</div>
            <p>No teams created yet. Add teams manually or use Random Teams.</p>
          </div>
        ) : (
          <div className="teams-grid">
            {teams.map(team => (
              <div key={team.id} className="glass-card team-card">
                <div className="team-card__corner">
                  <span className="team-card__seed">#{team.seed}</span>
                  {!hasBracket && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTeam(team.id)}
                      disabled={creatingTeam}
                      className="team-card__delete"
                      title="Delete team"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                      </svg>
                    </button>
                  )}
                </div>
                <div className="team-card__header">
                  <span className="team-card__name">{team.name}</span>
                </div>
                <div className="team-card__players">
                  <div className="team-card__pair">
                    <span className="team-card__gender-badge team-card__gender-badge--male">M</span>
                    <span>{team.player1Name}</span>
                  </div>
                  <div className="team-card__pair">
                    <span className="team-card__gender-badge team-card__gender-badge--male">M</span>
                    <span>{team.player2Name}</span>
                  </div>
                  <div className="team-card__pair">
                    <span className="team-card__gender-badge team-card__gender-badge--female">F</span>
                    <span>{team.player3Name}</span>
                  </div>
                  <div className="team-card__pair">
                    <span className="team-card__gender-badge team-card__gender-badge--female">F</span>
                    <span>{team.player4Name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Players */}
      {(() => {
        const availableMales = allPlayers.filter(p => p.gender === 'male' && !assignedPlayerIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
        const availableFemales = allPlayers.filter(p => p.gender === 'female' && !assignedPlayerIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
        if (availableMales.length === 0 && availableFemales.length === 0) return null;
        return (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 className="section-title">Available Players</h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#3b82f6', marginBottom: '0.5rem' }}>
                  ♂ Male ({availableMales.length})
                </div>
                {availableMales.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>All male players assigned</p>
                ) : (
                  <div className="glass-card" style={{ padding: '0.5rem' }}>
                    {availableMales.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                        <span>{p.name}</span>
                        <span style={{ color: '#f59e0b', fontSize: '0.75rem', letterSpacing: '1px' }}>{'★'.repeat(p.starRating)}{'☆'.repeat(5 - p.starRating)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ec4899', marginBottom: '0.5rem' }}>
                  ♀ Female ({availableFemales.length})
                </div>
                {availableFemales.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>All female players assigned</p>
                ) : (
                  <div className="glass-card" style={{ padding: '0.5rem' }}>
                    {availableFemales.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                        <span>{p.name}</span>
                        <span style={{ color: '#f59e0b', fontSize: '0.75rem', letterSpacing: '1px' }}>{'★'.repeat(p.starRating)}{'☆'.repeat(5 - p.starRating)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bracket Actions */}
      {canGenerateBracket && teams.length >= 2 && (
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleGenerateBracket}
            className="btn btn--primary btn--lg"
          >
            Generate Bracket
          </button>
        </div>
      )}

      {/* Bracket Display */}
      {hasBracket && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 className="section-title">Tournament Bracket</h3>
          <BracketDisplay brackets={brackets} teams={teams} results={results} />
        </div>
      )}

      {/* Advance to Next Round */}
      {canAdvance && (
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={handleAdvanceRound}
            className="btn btn--outline-success"
            style={{ fontWeight: 600 }}
          >
            Start {maxRound === 0 ? 'Quarterfinals' : maxRound === 1 ? 'Semifinals' : 'Finals'}
          </button>
        </div>
      )}

      {/* Start Next Match */}
      {nextMatch && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 className="section-title">Start Next Match</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Array.from({ length: courtCount }, (_, i) => i + 1)
              .filter(courtNum => !activeBrackets.some(b => b.courtNumber === courtNum))
              .map(courtNum => (
                <button
                  key={courtNum}
                  type="button"
                  onClick={() => handleStartMatch(courtNum)}
                  className="btn btn--outline-success"
                >
                  Court {courtNum}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Match Completion Modal */}
      {completingBracket && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 style={{ marginBottom: '1rem' }}>Complete Match</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              {teams.find(t => t.id === completingBracket.teamAId)?.name} vs {teams.find(t => t.id === completingBracket.teamBId)?.name}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setCompletingBracket(null); setSubGameScores({}); }}
                className="btn btn--ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteMatch}
                className="btn btn--primary"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
