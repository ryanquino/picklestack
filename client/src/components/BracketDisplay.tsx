import type { TournamentBracket, TournamentTeam, MLPTeamMatchResult } from '../types';

interface BracketDisplayProps {
  brackets: TournamentBracket[];
  teams: TournamentTeam[];
  results: MLPTeamMatchResult[];
  onMatchClick?: (bracket: TournamentBracket) => void;
}

export default function BracketDisplay({ brackets, teams, results, onMatchClick }: BracketDisplayProps) {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const resultMap = new Map(results.map(r => [r.bracketId, r]));

  // Group brackets by round
  const rounds = new Map<number, TournamentBracket[]>();
  for (const b of brackets) {
    if (!rounds.has(b.round)) rounds.set(b.round, []);
    rounds.get(b.round)!.push(b);
  }

  const sortedRounds = [...rounds.entries()].sort(([a], [b]) => a - b);
  const totalRounds = sortedRounds.length;

  function getTeamName(teamId: string | null): string {
    if (!teamId) return 'TBD';
    const team = teamMap.get(teamId);
    return team?.name ?? 'Unknown';
  }

  function getTeamSeed(teamId: string | null): number | null {
    if (!teamId) return null;
    const team = teamMap.get(teamId);
    return team?.seed ?? null;
  }

  function getMatchResult(bracket: TournamentBracket): MLPTeamMatchResult | null {
    return resultMap.get(bracket.id) ?? null;
  }

  return (
    <div className="bracket-display" style={{ overflowX: 'auto', padding: '1rem 0' }}>
      <div style={{ display: 'flex', gap: '2rem', minWidth: 'fit-content' }}>
        {sortedRounds.map(([roundNum, roundBrackets]) => {
          const roundName = roundBrackets[0]?.roundName ?? `Round ${roundNum}`;
          const matchSpacing = roundNum >= 99 ? 80 : Math.pow(2, roundNum) * 80;

          return (
            <div key={roundNum} className="bracket-round" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '180px' }}>
              <h4 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                {roundName}
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: `${matchSpacing}px`, justifyContent: 'center' }}>
                {roundBrackets
                  .sort((a, b) => a.matchIndex - b.matchIndex)
                  .map((bracket) => {
                    const result = getMatchResult(bracket);
                    const isComplete = bracket.winnerTeamId != null;
                    const isBye = bracket.isBye;
                    const isLive = bracket.matchId && !isComplete;

                    return (
                      <div
                        key={bracket.id}
                        className={`bracket-match ${isComplete ? 'bracket-match--complete' : ''} ${isLive ? 'bracket-match--live' : ''} ${isBye ? 'bracket-match--bye' : ''}`}
                        onClick={() => onMatchClick?.(bracket)}
                        style={{
                          background: isComplete
                            ? 'rgba(132, 195, 65, 0.08)'
                            : isLive
                            ? 'rgba(59, 130, 246, 0.08)'
                            : 'var(--glass-bg)',
                          border: isComplete
                            ? '1px solid rgba(132, 195, 65, 0.3)'
                            : isLive
                            ? '1px solid rgba(59, 130, 246, 0.3)'
                            : '1px solid var(--glass-border)',
                          borderRadius: '8px',
                          padding: '0',
                          minWidth: '170px',
                          cursor: onMatchClick ? 'pointer' : 'default',
                          transition: 'all 0.2s ease',
                          opacity: isBye ? 0.5 : 1,
                        }}
                      >
                        {/* Team A */}
                        <div style={{
                          padding: '0.5rem 0.75rem',
                          borderBottom: '1px solid var(--glass-border)',
                          background: bracket.winnerTeamId === bracket.teamAId ? 'rgba(132, 195, 65, 0.1)' : 'transparent',
                          borderRadius: '8px 8px 0 0',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                              {getTeamSeed(bracket.teamAId) ? `#${getTeamSeed(bracket.teamAId)}` : ''}
                            </span>
                            <span style={{
                              fontSize: '0.8rem',
                              fontWeight: bracket.winnerTeamId === bracket.teamAId ? 700 : 500,
                              color: bracket.winnerTeamId === bracket.teamAId ? 'var(--color-success)' : 'var(--color-text-primary)',
                            }}>
                              {getTeamName(bracket.teamAId)}
                            </span>
                            {result && (
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {result.teamAWins}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Team B */}
                        <div style={{
                          padding: '0.5rem 0.75rem',
                          background: bracket.winnerTeamId === bracket.teamBId ? 'rgba(132, 195, 65, 0.1)' : 'transparent',
                          borderRadius: '0 0 8px 8px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                              {getTeamSeed(bracket.teamBId) ? `#${getTeamSeed(bracket.teamBId)}` : ''}
                            </span>
                            <span style={{
                              fontSize: '0.8rem',
                              fontWeight: bracket.winnerTeamId === bracket.teamBId ? 700 : 500,
                              color: bracket.winnerTeamId === bracket.teamBId ? 'var(--color-success)' : 'var(--color-text-primary)',
                            }}>
                              {getTeamName(bracket.teamBId)}
                            </span>
                            {result && (
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {result.teamBWins}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Live indicator */}
                        {isLive && (
                          <div style={{
                            padding: '0.25rem 0.75rem',
                            background: 'rgba(59, 130, 246, 0.1)',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: '#3b82f6',
                            textAlign: 'center',
                            borderRadius: '0 0 8px 8px',
                          }}>
                            <span className="live-badge__dot" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', marginRight: '4px', animation: 'pulse 1.5s infinite' }} />
                            IN PROGRESS
                          </div>
                        )}

                        {/* Bye indicator */}
                        {isBye && bracket.winnerTeamId && (
                          <div style={{
                            padding: '0.25rem 0.75rem',
                            fontSize: '0.65rem',
                            color: 'var(--color-text-secondary)',
                            textAlign: 'center',
                          }}>
                            BYE
                          </div>
                        )}
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
}
