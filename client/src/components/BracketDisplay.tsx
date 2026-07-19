import type { TournamentBracket, TournamentTeam, MLPTeamMatchResult } from '../types';

const MATCH_H = 72;
const MATCH_W = 180;
const CONN_W = 44;
const BASE_GAP = 40;
const HEADER_H = 32;

interface BracketDisplayProps {
  brackets: TournamentBracket[];
  teams: TournamentTeam[];
  results: MLPTeamMatchResult[];
  onMatchClick?: (bracket: TournamentBracket) => void;
}

export default function BracketDisplay({ brackets, teams, results, onMatchClick }: BracketDisplayProps) {
  const teamMap = new Map(teams.map(t => [t.id, t]));
  const resultMap = new Map(results.map(r => [r.bracketId, r]));

  const allRounds = new Map<number, TournamentBracket[]>();
  for (const b of brackets) {
    if (!allRounds.has(b.round)) allRounds.set(b.round, []);
    allRounds.get(b.round)!.push(b);
  }

  const thirdPlaceBrackets = allRounds.get(99) ?? [];
  allRounds.delete(99);

  const sortedAllRounds = [...allRounds.entries()].sort(([a], [b]) => a - b);

  const rounds = new Map<number, TournamentBracket[]>();
  for (const [rn, rbs] of sortedAllRounds) {
    rounds.set(rn, rbs);
  }

  const sortedRounds = [...rounds.entries()].sort(([a], [b]) => a - b);
  const s = MATCH_H + BASE_GAP;

  const maxCount = Math.max(...sortedRounds.map(([, b]) => b.length), 1);
  const lastCompRound = sortedRounds.length > 0 ? sortedRounds[sortedRounds.length - 1][0] : 0;

  const matchPositions = new Map<string, number>();
  for (const [rn, rbs] of sortedRounds) {
    const sorted = [...rbs].sort((a, b) => a.matchIndex - b.matchIndex);
    for (let i = 0; i < sorted.length; i++) {
      const key = `${rn}:${sorted[i].matchIndex}`;
      matchPositions.set(key, 0);
    }
  }

  function positionKey(round: number, idx: number): string { return `${round}:${idx}`; }

  function setPos(round: number, idx: number, y: number) {
    matchPositions.set(positionKey(round, idx), y);
  }

  function getPos(round: number, idx: number): number {
    return matchPositions.get(positionKey(round, idx)) ?? 0;
  }

  const firstRbs = sortedRounds[0]?.[1] ?? [];
  const firstSorted = [...firstRbs].sort((a, b) => a.matchIndex - b.matchIndex);
  for (let i = 0; i < firstSorted.length; i++) {
    setPos(sortedRounds[0][0], firstSorted[i].matchIndex, HEADER_H + i * s);
  }

  for (let ri = 1; ri < sortedRounds.length; ri++) {
    const [rn, rbs] = sortedRounds[ri];
    const sorted = [...rbs].sort((a, b) => a.matchIndex - b.matchIndex);
    const [prevRn, prevRbs] = sortedRounds[ri - 1];
    for (const br of sorted) {
      const pA = br.matchIndex * 2;
      const pB = br.matchIndex * 2 + 1;
      const hasA = matchPositions.has(positionKey(prevRn, pA));
      const hasB = matchPositions.has(positionKey(prevRn, pB));
      if (hasA && hasB) {
        setPos(rn, br.matchIndex, (getPos(prevRn, pA) + getPos(prevRn, pB)) / 2);
      } else if (hasA) {
        setPos(rn, br.matchIndex, getPos(prevRn, pA));
      } else if (hasB) {
        setPos(rn, br.matchIndex, getPos(prevRn, pB));
      } else {
        const prevSorted = [...prevRbs].sort((a, b) => a.matchIndex - b.matchIndex);
        const lastPrev = prevSorted[prevSorted.length - 1];
        const lastY = lastPrev ? getPos(prevRn, lastPrev.matchIndex) + s : HEADER_H + s;
        setPos(rn, br.matchIndex, lastY);
      }
    }
  }

  function matchY(index: number, roundNum: number): number {
    return getPos(roundNum, index);
  }

  function roundX(roundNum: number): number {
    return roundNum * (MATCH_W + CONN_W + 16);
  }

  const bracketH = (() => {
    let maxY = 0;
    for (const [, y] of matchPositions) {
      if (y + MATCH_H > maxY) maxY = y + MATCH_H;
    }
    return maxY + 24;
  })();

  const tpYOffset = thirdPlaceBrackets.length > 0 ? HEADER_H + MATCH_H + 64 : 0;
  const totalH = bracketH + tpYOffset;
  const totalW = roundX(lastCompRound) + MATCH_W + 24;

  const tn = (id: string | null) => (id ? (teamMap.get(id)?.name ?? 'TBD') : 'TBD');
  const ts = (id: string | null) => (id ? teamMap.get(id)?.seed ?? null : null);
  const mr = (b: TournamentBracket) => resultMap.get(b.id) ?? null;

  function card(b: TournamentBracket, x: number, y: number) {
    const r = mr(b);
    const done = b.winnerTeamId != null;
    const live = !!b.matchId && !done;
    const bye = b.isBye;

    return (
      <div
        key={b.id}
        className={`bracket-match${done ? ' bracket-match--complete' : ''}${live ? ' bracket-match--live' : ''}${bye ? ' bracket-match--bye' : ''}`}
        onClick={() => onMatchClick?.(b)}
        style={{
          position: 'absolute', left: x, top: y, width: MATCH_W,
          background: done ? 'rgba(132,195,65,0.08)' : live ? 'rgba(59,130,246,0.08)' : 'var(--glass-bg)',
          border: bye
            ? '1px dashed var(--color-text-secondary)'
            : done ? '1px solid rgba(132,195,65,0.3)' : live ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--glass-border)',
          borderRadius: 8, padding: 0,
          cursor: onMatchClick ? 'pointer' : 'default',
          transition: 'all 0.2s ease', opacity: bye ? 0.7 : 1, zIndex: 1,
        }}
      >
        {bye && (
          <div style={{
            padding: '0.35rem 0.75rem', fontSize: '0.65rem', fontWeight: 700,
            color: 'var(--color-text-secondary)', textAlign: 'center',
            borderBottom: '1px dashed var(--color-text-secondary)',
            letterSpacing: '0.5px', textTransform: 'uppercase',
          }}>BYE</div>
        )}
        <div style={{
          padding: '0.5rem 0.75rem',
          borderBottom: bye ? '1px dashed var(--color-text-secondary)' : '1px solid var(--glass-border)',
          background: b.winnerTeamId === b.teamAId ? 'rgba(132,195,65,0.1)' : 'transparent',
          borderRadius: bye ? '8px 8px 0 0' : '8px 8px 0 0',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', minWidth: 24 }}>{ts(b.teamAId) ? `#${ts(b.teamAId)}` : ''}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: b.winnerTeamId === b.teamAId ? 700 : 500, color: b.winnerTeamId === b.teamAId ? 'var(--color-success)' : 'var(--color-text-primary)', textAlign: 'center', flex: 1 }}>{tn(b.teamAId)}</span>
            {r && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 16, textAlign: 'right' }}>{r.teamAWins}</span>}
          </div>
        </div>
        <div style={{
          padding: '0.5rem 0.75rem',
          background: b.winnerTeamId === b.teamBId ? 'rgba(132,195,65,0.1)' : 'transparent',
          borderRadius: '0 0 8px 8px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', minWidth: 24 }}>{ts(b.teamBId) ? `#${ts(b.teamBId)}` : ''}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: b.winnerTeamId === b.teamBId ? 700 : 500, color: b.winnerTeamId === b.teamBId ? 'var(--color-success)' : 'var(--color-text-primary)', textAlign: 'center', flex: 1 }}>{tn(b.teamBId)}</span>
            {r && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 16, textAlign: 'right' }}>{r.teamBWins}</span>}
          </div>
        </div>
        {live && (
          <div style={{ padding: '0.25rem 0.75rem', background: 'rgba(59,130,246,0.1)', fontSize: '0.65rem', fontWeight: 600, color: '#3b82f6', textAlign: 'center', borderRadius: '0 0 8px 8px' }}>
            <span className="live-badge__dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', marginRight: 4, animation: 'pulse 1.5s infinite' }} />
            IN PROGRESS
          </div>
        )}
      </div>
    );
  }

  const totalRounds = sortedRounds.length;

  return (
    <div className="bracket-display" style={{ overflowX: 'auto', padding: '1rem 0' }}>
      <div style={{ position: 'relative', width: totalW, height: totalH, minWidth: totalW }}>
        {sortedRounds.map(([rn, rbs]) => {
          const allBracketsForRound = allRounds.get(rn) ?? rbs;
          const name = allBracketsForRound[0]?.roundName ?? rbs[0]?.roundName ?? `Round ${rn}`;
          return (
            <div key={`h${rn}`} style={{
              position: 'absolute', left: roundX(rn), top: 0, width: MATCH_W,
              textAlign: 'center', fontSize: '0.75rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.5px',
              color: 'var(--color-text-secondary)', lineHeight: `${HEADER_H}px`,
            }}>{name}</div>
          );
        })}

        {sortedRounds.map(([rn, rbs], ri) => {
          if (ri >= totalRounds - 1) return null;
          const sorted = [...rbs].sort((a, b) => a.matchIndex - b.matchIndex);
          const nextRbs = sortedRounds[ri + 1][1];
          const lx = roundX(rn) + MATCH_W;
          const nx = roundX(rn + 1);

          const connectors: JSX.Element[] = [];

          for (let i = 0; i < sorted.length; i++) {
            const paired = i + 1 < sorted.length;
            if (paired) {
              const tY = matchY(sorted[i].matchIndex, rn) + MATCH_H / 2;
              const bY = matchY(sorted[i + 1].matchIndex, rn) + MATCH_H / 2;
              connectors.push(
                <div key={`c${sorted[i].id}`} style={{ position: 'absolute', left: lx, top: tY, width: CONN_W, height: bY - tY, zIndex: 0 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: 2, background: 'var(--color-text-secondary)', opacity: 0.3 }} />
                  <div style={{ position: 'absolute', left: 0, bottom: 0, width: '50%', height: 2, background: 'var(--color-text-secondary)', opacity: 0.3 }} />
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'var(--color-text-secondary)', opacity: 0.3, transform: 'translateX(-50%)' }} />
                  <div style={{ position: 'absolute', right: 0, top: '50%', width: '50%', height: 2, background: 'var(--color-text-secondary)', opacity: 0.3, transform: 'translateY(-50%)' }} />
                </div>
              );
              i++;
            } else {
              const br = sorted[i];
              const nextIdx = Math.floor(br.matchIndex / 2);
              const target = nextRbs.find(m => m.matchIndex === nextIdx);
              if (target) {
                const fromY = matchY(br.matchIndex, rn) + MATCH_H / 2;
                const toY = matchY(target.matchIndex, rn + 1) + MATCH_H / 2;
                const midX = lx + (nx - lx) / 2;
                connectors.push(
                  <div key={`cs${br.id}`} style={{ position: 'absolute', left: lx, top: Math.min(fromY, toY), width: nx - lx, height: Math.abs(toY - fromY) || 2, zIndex: 0 }}>
                    <div style={{ position: 'absolute', left: 0, top: fromY - Math.min(fromY, toY), width: midX - lx, height: 2, background: 'var(--color-text-secondary)', opacity: 0.3 }} />
                    <div style={{ position: 'absolute', left: midX - lx - 1, top: Math.min(fromY, toY), width: 2, height: Math.abs(toY - fromY) || 2, background: 'var(--color-text-secondary)', opacity: 0.3 }} />
                    <div style={{ position: 'absolute', left: midX - lx, top: toY - Math.min(fromY, toY), width: nx - midX, height: 2, background: 'var(--color-text-secondary)', opacity: 0.3 }} />
                  </div>
                );
              }
            }
          }

          return connectors;
        })}

        {sortedRounds.map(([rn, rbs]) => {
          const sorted = [...rbs].sort((a, b) => a.matchIndex - b.matchIndex);
          return sorted.map(b => card(b, roundX(rn), matchY(b.matchIndex, rn)));
        })}

        {thirdPlaceBrackets.length > 0 && (() => {
          const lastRound = sortedRounds[sortedRounds.length - 1];
          const lastBrackets = lastRound ? [...lastRound[1]].sort((a, b) => a.matchIndex - b.matchIndex) : [];
          const lastMatch = lastBrackets[lastBrackets.length - 1];
          const lastY = lastMatch ? matchY(lastMatch.matchIndex, lastRound![0]) : bracketH / 2;
          const tpX = roundX(lastCompRound);
          const tpY = lastY + MATCH_H + HEADER_H + 64;

          return (
            <>
              <div style={{
                position: 'absolute', left: tpX, top: tpY - HEADER_H, width: MATCH_W,
                textAlign: 'center', fontSize: '0.75rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                color: 'var(--color-text-secondary)', lineHeight: `${HEADER_H}px`,
              }}>Third Place</div>
              {thirdPlaceBrackets.map(b => card(b, tpX, tpY))}
            </>
          );
        })()}
      </div>
    </div>
  );
}
