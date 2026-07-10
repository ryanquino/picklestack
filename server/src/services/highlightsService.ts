import {
  getMatchResultsBySession,
  getMatchesBySession,
  getPlayerById,
  getPlayerRatingsBySession,
  getFixedPairsBySession,
  MatchResultRow,
  MatchRow,
} from '../repository';

export interface MatchHighlight {
  id: string;
  emoji: string;
  text: string;
  matchNumber: number;
  timestamp: string;
}

/**
 * Computes session highlights based on match results.
 * Returns the most recent 20 highlights sorted newest first.
 */
export function computeSessionHighlights(sessionId: string): MatchHighlight[] {
  const results = getMatchResultsBySession(sessionId);
  const matches = getMatchesBySession(sessionId);
  const ratings = getPlayerRatingsBySession(sessionId);
  const fixedPairs = getFixedPairsBySession(sessionId);

  if (results.length === 0) return [];

  const matchById = new Map(matches.map(m => [m.id, m]));
  const ratingByPlayer = new Map(ratings.map(r => [r.player_id, r]));

  // Build fixed pair lookup: playerId -> partnerId
  const pairPartner = new Map<string, string>();
  for (const pair of fixedPairs) {
    pairPartner.set(pair.player1_id, pair.player2_id);
    pairPartner.set(pair.player2_id, pair.player1_id);
  }

  // Build player name cache
  const playerNameCache = new Map<string, string>();
  function getPlayerName(playerId: string): string {
    if (playerNameCache.has(playerId)) return playerNameCache.get(playerId)!;
    const player = getPlayerById(playerId);
    const name = player ? player.name : 'Unknown';
    playerNameCache.set(playerId, name);
    return name;
  }

  // Track per-player results sequence
  const playerResults: Map<string, Array<{ result: 'win' | 'loss'; timestamp: string; matchIdx: number }>> = new Map();
  // Track H2H encounters: "pidA-pidB" -> count (sorted IDs)
  const h2hCount = new Map<string, number>();
  // Track pair wins: "p1-p2" sorted -> consecutive wins
  const pairWinStreaks = new Map<string, number>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const match = matchById.get(result.match_id);
    const winners: string[] = JSON.parse(result.winner_player_ids);
    const losers: string[] = JSON.parse(result.loser_player_ids);
    const ts = result.recorded_at;
    const allPlayers = [...winners, ...losers];

    for (const pid of winners) {
      if (!playerResults.has(pid)) playerResults.set(pid, []);
      playerResults.get(pid)!.push({ result: 'win', timestamp: ts, matchIdx: i });
    }
    for (const pid of losers) {
      if (!playerResults.has(pid)) playerResults.set(pid, []);
      playerResults.get(pid)!.push({ result: 'loss', timestamp: ts, matchIdx: i });
    }

    // Track H2H
    for (const w of winners) {
      for (const l of losers) {
        const key = [w, l].sort().join('-');
        h2hCount.set(key, (h2hCount.get(key) || 0) + 1);
      }
    }
  }

  const highlights: MatchHighlight[] = [];
  let highlightId = 0;

  function addHighlight(emoji: string, text: string, matchNumber: number, timestamp: string) {
    highlights.push({ id: `h-${highlightId++}`, emoji, text, matchNumber, timestamp });
  }

  // Process each result for highlights
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const match = matchById.get(result.match_id);
    const winners: string[] = JSON.parse(result.winner_player_ids);
    const losers: string[] = JSON.parse(result.loser_player_ids);
    const allPlayers = [...winners, ...losers];
    const ts = result.recorded_at;
    const matchNum = i + 1;

    // --- Blowout win (point diff >= 5) ---
    if (result.team1_score !== null && result.team2_score !== null) {
      const diff = Math.abs(result.team1_score - result.team2_score);
      if (diff >= 5) {
        const winnerNames = winners.map(getPlayerName).join(' & ');
        const score = `${Math.max(result.team1_score, result.team2_score)}-${Math.min(result.team1_score, result.team2_score)}`;
        addHighlight('💪', `${winnerNames} dominated ${score}`, matchNum, ts);
      }
    }

    // --- Shutout (opponent scored 0) ---
    if (result.team1_score !== null && result.team2_score !== null) {
      if (result.team1_score === 0 || result.team2_score === 0) {
        const winnerNames = winners.map(getPlayerName).join(' & ');
        const score = `${Math.max(result.team1_score, result.team2_score)}-0`;
        addHighlight('🧹', `Clean sweep! ${winnerNames} won ${score}`, matchNum, ts);
      }
    }

    // --- Close game (margin <= 2 with scores) ---
    if (result.team1_score !== null && result.team2_score !== null) {
      const diff = Math.abs(result.team1_score - result.team2_score);
      if (diff <= 2 && diff > 0 && result.team1_score !== 0 && result.team2_score !== 0) {
        const winnerNames = winners.map(getPlayerName).join(' & ');
        const score = `${Math.max(result.team1_score, result.team2_score)}-${Math.min(result.team1_score, result.team2_score)}`;
        addHighlight('🎯', `Nail-biter! ${winnerNames} edged it ${score}`, matchNum, ts);
      }
    }

    // --- Win streak (3, 5) ---
    for (const pid of winners) {
      const history = playerResults.get(pid);
      if (!history) continue;
      let streak = 0;
      for (let j = history.length - 1; j >= 0; j--) {
        if (history[j].result === 'win') streak++;
        else break;
      }
      if (streak === 3) {
        addHighlight('🔥', `${getPlayerName(pid)} is on a 3-game win streak!`, matchNum, ts);
      } else if (streak === 5) {
        addHighlight('🔥🔥', `${getPlayerName(pid)} is unstoppable — 5 wins in a row!`, matchNum, ts);
      }
    }

    // --- Loss streak (3+) ---
    for (const pid of losers) {
      const history = playerResults.get(pid);
      if (!history) continue;
      let streak = 0;
      for (let j = history.length - 1; j >= 0; j--) {
        if (history[j].result === 'loss') streak++;
        else break;
      }
      if (streak === 3) {
        addHighlight('💀', `${getPlayerName(pid)} drops 3 in a row...`, matchNum, ts);
      }
    }

    // --- Comeback: won after 2+ losses in a row ---
    for (const pid of winners) {
      const history = playerResults.get(pid);
      if (!history || history.length < 3) continue;
      const lastIdx = history.length - 1;
      if (history[lastIdx].result === 'win' && lastIdx >= 2) {
        let lossStreak = 0;
        for (let j = lastIdx - 1; j >= 0; j--) {
          if (history[j].result === 'loss') lossStreak++;
          else break;
        }
        if (lossStreak >= 2) {
          addHighlight('⚡', `${getPlayerName(pid)} snaps a ${lossStreak}-game skid!`, matchNum, ts);
        }
      }
    }

    // --- First win of the session ---
    for (const pid of winners) {
      const history = playerResults.get(pid);
      if (!history) continue;
      const wins = history.filter(h => h.result === 'win');
      if (wins.length === 1 && history.length >= 2) {
        // First win and they've played at least 2 games (so it's meaningful)
        addHighlight('🎉', `${getPlayerName(pid)} gets their first win!`, matchNum, ts);
      }
    }

    // --- Upset: lower-rated team beats higher-rated team ---
    if (winners.length > 0 && losers.length > 0) {
      const winnerAvgRating = winners.reduce((sum, pid) => {
        const r = ratingByPlayer.get(pid);
        return sum + (r ? r.star_rating : 3);
      }, 0) / winners.length;
      const loserAvgRating = losers.reduce((sum, pid) => {
        const r = ratingByPlayer.get(pid);
        return sum + (r ? r.star_rating : 3);
      }, 0) / losers.length;
      if (winnerAvgRating < loserAvgRating - 0.5) {
        const winnerNames = winners.map(getPlayerName).join(' & ');
        addHighlight('🫨', `Upset! ${winnerNames} took down the favorites`, matchNum, ts);
      }
    }

    // --- Perfect record (100% after 3+ games) ---
    for (const pid of winners) {
      const history = playerResults.get(pid);
      if (!history || history.length < 3) continue;
      const allWins = history.every(h => h.result === 'win');
      if (allWins && history.length === 3) {
        addHighlight('👑', `${getPlayerName(pid)} is perfect — 3-0!`, matchNum, ts);
      } else if (allWins && history.length === 5) {
        addHighlight('👑', `${getPlayerName(pid)} still undefeated — 5-0!`, matchNum, ts);
      }
    }

    // --- Rivalry rematch (H2H >= 2 between same players) ---
    for (const w of winners) {
      for (const l of losers) {
        const key = [w, l].sort().join('-');
        const count = h2hCount.get(key) || 0;
        if (count === 2) {
          addHighlight('⚔️', `Rivalry! ${getPlayerName(w)} vs ${getPlayerName(l)} meet again (2nd time)`, matchNum, ts);
        } else if (count === 3) {
          addHighlight('⚔️', `Trilogy! ${getPlayerName(w)} vs ${getPlayerName(l)} — 3rd meeting`, matchNum, ts);
        }
      }
    }

    // --- Pair dominance (fixed pair wins together) ---
    if (winners.length === 2) {
      const [w1, w2] = winners;
      const isPair = pairPartner.get(w1) === w2 || pairPartner.get(w2) === w1;
      if (isPair) {
        const pairKey = [w1, w2].sort().join('-');
        pairWinStreaks.set(pairKey, (pairWinStreaks.get(pairKey) || 0) + 1);
        const pairStreak = pairWinStreaks.get(pairKey)!;
        if (pairStreak === 3) {
          addHighlight('🤝', `${getPlayerName(w1)} & ${getPlayerName(w2)} dominating as a pair — 3 wins!`, matchNum, ts);
        }
      }
    }
    // Reset pair streak on loss
    if (losers.length === 2) {
      const [l1, l2] = losers;
      const isPair = pairPartner.get(l1) === l2 || pairPartner.get(l2) === l1;
      if (isPair) {
        const pairKey = [l1, l2].sort().join('-');
        pairWinStreaks.set(pairKey, 0);
      }
    }

    // --- Games played milestone (every 5 games) ---
    for (const pid of allPlayers) {
      const history = playerResults.get(pid);
      if (!history) continue;
      const gamesPlayed = history.length;
      if (gamesPlayed > 0 && gamesPlayed % 5 === 0) {
        const isLatest = history[history.length - 1].matchIdx === i;
        if (isLatest) {
          addHighlight('🏃', `${getPlayerName(pid)} just played their ${gamesPlayed}th game!`, matchNum, ts);
        }
      }
    }

    // --- Win rate milestone (first time crossing 75% with 4+ games) ---
    for (const pid of winners) {
      const history = playerResults.get(pid);
      if (!history || history.length < 4) continue;
      const wins = history.filter(h => h.result === 'win').length;
      const total = history.length;
      const winRate = (wins / total) * 100;
      const prevWins = wins - 1;
      const prevTotal = total - 1;
      const prevWinRate = prevTotal > 0 ? (prevWins / prevTotal) * 100 : 0;
      if (winRate >= 75 && prevWinRate < 75 && total >= 4) {
        addHighlight('🎯', `${getPlayerName(pid)} hit ${Math.round(winRate)}% win rate!`, matchNum, ts);
      }
    }
  }

  // Sort newest first and return top 20
  highlights.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return highlights.slice(0, 20);
}
