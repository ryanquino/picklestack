import { useState } from 'react';
import type { TournamentBracket, TournamentTeam } from '../types';
import { completeTournamentMatch } from '../api';

const SUB_MATCHES = [
  { key: 'womens', label: "Women's Doubles", icon: '♀', required: true },
  { key: 'mens', label: "Men's Doubles", icon: '♂', required: true },
  { key: 'mixed1', label: 'Mixed 1', icon: '⚥', required: true },
  { key: 'mixed2', label: 'Mixed 2', icon: '⚥', required: true },
  { key: 'dreambreaker', label: 'Dreambreaker', icon: '⚡', required: false },
] as const;

type SubGameKey = typeof SUB_MATCHES[number]['key'];

interface SubScore {
  team1Score: number;
  team2Score: number;
}

interface MatchScoring {
  [key: string]: 'teamA' | 'teamB' | null;
}

interface TournamentMatchPanelProps {
  sessionId: string;
  activeBrackets: TournamentBracket[];
  teams: TournamentTeam[];
  onMatchCompleted?: () => void;
}

export default function TournamentMatchPanel({ sessionId, activeBrackets, teams, onMatchCompleted }: TournamentMatchPanelProps) {
  const [scoring, setScoring] = useState<Record<string, MatchScoring>>({});
  const [scores, setScores] = useState<Record<string, Record<string, SubScore>>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamMap = new Map(teams.map(t => [t.id, t]));

  function getScoring(bracketId: string): MatchScoring {
    return scoring[bracketId] ?? {};
  }

  function getScore(bracketId: string, subGame: string): SubScore {
    return scores[bracketId]?.[subGame] ?? { team1Score: 0, team2Score: 0 };
  }

  function setWinner(bracketId: string, subGame: string, winner: 'teamA' | 'teamB') {
    const currentWinner = scoring[bracketId]?.[subGame];
    const isDeselect = currentWinner === winner;

    setScoring(prev => ({
      ...prev,
      [bracketId]: {
        ...prev[bracketId],
        [subGame]: isDeselect ? null : winner,
      },
    }));

    // Auto-set scores: winner gets 11, loser gets 0; reset on deselect
    setScores(prev => ({
      ...prev,
      [bracketId]: {
        ...prev[bracketId],
        [subGame]: isDeselect
          ? { team1Score: 0, team2Score: 0 }
          : winner === 'teamA'
            ? { team1Score: 11, team2Score: 0 }
            : { team1Score: 0, team2Score: 11 },
      },
    }));
  }

  function setSubScore(bracketId: string, subGame: string, field: 'team1Score' | 'team2Score', value: number) {
    setScores(prev => ({
      ...prev,
      [bracketId]: {
        ...prev[bracketId],
        [subGame]: {
          ...(prev[bracketId]?.[subGame] ?? { team1Score: 0, team2Score: 0 }),
          [field]: Math.max(0, value),
        },
      },
    }));
  }

  function getCounts(s: MatchScoring) {
    let teamA = 0, teamB = 0;
    for (const sub of SUB_MATCHES) {
      if (s[sub.key] === 'teamA') teamA++;
      else if (s[sub.key] === 'teamB') teamB++;
    }
    return { teamA, teamB };
  }

  function getRegularCounts(s: MatchScoring) {
    let teamA = 0, teamB = 0;
    for (const sub of SUB_MATCHES) {
      if (sub.key === 'dreambreaker') continue;
      if (s[sub.key] === 'teamA') teamA++;
      else if (s[sub.key] === 'teamB') teamB++;
    }
    return { teamA, teamB };
  }

  function canSubmit(s: MatchScoring): boolean {
    const { teamA, teamB } = getRegularCounts(s);
    if (teamA + teamB < 4) return false;
    if (teamA === 2 && teamB === 2 && !s.dreambreaker) return false;
    return true;
  }

  async function handleSubmit(bracket: TournamentBracket) {
    const s = getScoring(bracket.id);
    if (!canSubmit(s)) return;

    setSubmitting(bracket.id);
    setError(null);

    try {
      const { teamA: regularAWins, teamB: regularBWins } = getRegularCounts(s);
      const dreamBreakerPlayed = regularAWins === 2 && regularBWins === 2;

      const subGames = SUB_MATCHES
        .filter(sub => s[sub.key])
        .map(sub => {
          const subScore = getScore(bracket.id, sub.key);
          return {
            subGame: sub.key,
            winningTeamId: s[sub.key] === 'teamA' ? bracket.teamAId! : bracket.teamBId!,
            team1Score: s[sub.key] === 'teamA' ? (subScore.team1Score || 11) : (subScore.team2Score || 0),
            team2Score: s[sub.key] === 'teamB' ? (subScore.team1Score || 11) : (subScore.team2Score || 0),
          };
        });

      const { teamA: totalAWins, teamB: totalBWins } = getCounts(s);
      const winnerTeamId = totalAWins > totalBWins ? bracket.teamAId! : bracket.teamBId!;

      await completeTournamentMatch(
        sessionId,
        bracket.id,
        bracket.matchId!,
        subGames,
        winnerTeamId,
        dreamBreakerPlayed
      );

      setScoring(prev => {
        const next = { ...prev };
        delete next[bracket.id];
        return next;
      });
      setScores(prev => {
        const next = { ...prev };
        delete next[bracket.id];
        return next;
      });

      onMatchCompleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete match');
    } finally {
      setSubmitting(null);
    }
  }

  if (activeBrackets.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Active Matches</h3>

      {error && (
        <div className="toast toast--error" style={{ marginBottom: '0.75rem' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="toast__close">✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {activeBrackets.map(bracket => {
          const teamA = teamMap.get(bracket.teamAId!);
          const teamB = teamMap.get(bracket.teamBId!);
          const s = getScoring(bracket.id);
          const { teamA: teamAWins, teamB: teamBWins } = getCounts(s);
          const isDreambreakerReady = teamAWins === 2 && teamBWins === 2;
          const ready = canSubmit(s);
          const isSubmitting = submitting === bracket.id;

          return (
            <div key={bracket.id} className="glass-card match-score-card">
              <div className="match-score-card__header">
                <div className="match-score-card__teams">
                  <span className="match-score-card__team-name match-score-card__team-name--a">
                    {teamA?.name ?? 'TBD'}
                  </span>
                  <span className="match-score-card__vs">vs</span>
                  <span className="match-score-card__team-name match-score-card__team-name--b">
                    {teamB?.name ?? 'TBD'}
                  </span>
                </div>
                <div className="match-score-card__tally">
                  <span className={`match-score-card__tally-num ${teamAWins > teamBWins ? 'match-score-card__tally-num--lead' : ''}`}>
                    {teamAWins}
                  </span>
                  <span className="match-score-card__tally-sep">-</span>
                  <span className={`match-score-card__tally-num ${teamBWins > teamAWins ? 'match-score-card__tally-num--lead' : ''}`}>
                    {teamBWins}
                  </span>
                </div>
              </div>

              <div className="match-score-card__submatches">
                {SUB_MATCHES.map(sub => {
                  const winner = s[sub.key];
                  const isDreambreaker = sub.key === 'dreambreaker';
                  const disabled = isDreambreaker ? !isDreambreakerReady : false;
                  const subScore = getScore(bracket.id, sub.key);

                  return (
                    <div
                      key={sub.key}
                      className={`submatch-row ${isDreambreaker && !isDreambreakerReady ? 'submatch-row--locked' : ''} ${winner ? 'submatch-row--done' : ''}`}
                    >
                      <span className="submatch-row__label">
                        <span className="submatch-row__icon">{sub.icon}</span>
                        {sub.label}
                        {isDreambreaker && !isDreambreakerReady && (
                          <span className="submatch-row__badge">Locked (need 2-2)</span>
                        )}
                        {isDreambreaker && isDreambreakerReady && !winner && (
                          <span className="submatch-row__badge submatch-row__badge--live">Play now!</span>
                        )}
                      </span>
                      <div className="submatch-row__score-btns">
                        {winner && (
                          <div className="submatch-row__scores">
                            <input
                              type="number"
                              min={0}
                              value={subScore.team1Score || ''}
                              placeholder={winner === 'teamA' ? '11' : '0'}
                              onChange={(e) => setSubScore(bracket.id, sub.key, 'team1Score', parseInt(e.target.value) || 0)}
                              className={`submatch-row__score-input ${winner === 'teamA' ? 'submatch-row__score-input--winner' : ''}`}
                              disabled={isSubmitting}
                            />
                            <span className="submatch-row__score-sep">-</span>
                            <input
                              type="number"
                              min={0}
                              value={subScore.team2Score || ''}
                              placeholder={winner === 'teamB' ? '11' : '0'}
                              onChange={(e) => setSubScore(bracket.id, sub.key, 'team2Score', parseInt(e.target.value) || 0)}
                              className={`submatch-row__score-input ${winner === 'teamB' ? 'submatch-row__score-input--winner' : ''}`}
                              disabled={isSubmitting}
                            />
                          </div>
                        )}
                        <div className="submatch-row__btns">
                          <button
                            type="button"
                            onClick={() => setWinner(bracket.id, sub.key, 'teamA')}
                            className={`submatch-btn submatch-btn--a ${winner === 'teamA' ? 'submatch-btn--selected' : ''}`}
                            disabled={disabled || isSubmitting}
                          >
                            {teamA?.name ?? 'A'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setWinner(bracket.id, sub.key, 'teamB')}
                            className={`submatch-btn submatch-btn--b ${winner === 'teamB' ? 'submatch-btn--selected' : ''}`}
                            disabled={disabled || isSubmitting}
                          >
                            {teamB?.name ?? 'B'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="match-score-card__footer">
                <button
                  type="button"
                  onClick={() => handleSubmit(bracket)}
                  disabled={!ready || isSubmitting}
                  className="btn btn--primary"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Results'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
