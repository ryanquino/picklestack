/**
 * Session Awards Service — Computes end-of-session awards (1 winner per category).
 * All awards are derived from existing match data.
 */

import {
  getMatchResultsBySession,
  getMatchesBySession,
  getPlayersBySession,
  getPlayerRatingsBySession,
  getPairingHistoryBySession,
  MatchResultRow,
  MatchRow,
} from '../repository';
import { getPlayerStats } from './matchResultService';

export interface SessionAward {
  id: string;
  icon: string;
  title: string;
  description: string;
  playerId: string;
  playerName: string;
  value: string;
}

/**
 * Computes all session awards. Returns one winner per category.
 * Only includes awards where there's meaningful data (e.g., at least 3 matches total).
 */
export function computeSessionAwards(sessionId: string): SessionAward[] {
  const stats = getPlayerStats(sessionId);
  const resultRows = getMatchResultsBySession(sessionId);
  const matches = getMatchesBySession(sessionId);
  const players = getPlayersBySession(sessionId);
  const pairingHistory = getPairingHistoryBySession(sessionId);

  if (stats.length === 0 || resultRows.length < 3) return [];

  const playerNameMap = new Map(players.map(p => [p.id, p.name]));
  const awards: SessionAward[] = [];

  // 1. MVP — Highest win rate (min 3 matches)
  const mvpEligible = stats.filter(s => s.matchesPlayed >= 3);
  if (mvpEligible.length > 0) {
    const mvp = mvpEligible.sort((a, b) => b.winRate - a.winRate || b.matchesPlayed - a.matchesPlayed)[0];
    awards.push({
      id: 'mvp',
      icon: '🏆',
      title: 'MVP',
      description: 'Highest win rate',
      playerId: mvp.playerId,
      playerName: mvp.playerName,
      value: `${mvp.winRate.toFixed(0)}% win rate`,
    });
  }

  // 2. Dominant Force — Highest average point differential per match
  const withPD = stats.filter(s => s.matchesPlayed >= 3);
  if (withPD.length > 0) {
    const dominant = withPD.sort((a, b) => (b.pointDifferential / b.matchesPlayed) - (a.pointDifferential / a.matchesPlayed))[0];
    const avgPD = dominant.pointDifferential / dominant.matchesPlayed;
    if (avgPD > 0) {
      awards.push({
        id: 'dominant-force',
        icon: '💪',
        title: 'Dominant Force',
        description: 'Highest avg point differential',
        playerId: dominant.playerId,
        playerName: dominant.playerName,
        value: `+${avgPD.toFixed(1)} pts diff/game`,
      });
    }
  }

  // 3. Hot Streak — Longest win streak during session
  const streakWinners = computeLongestStreaks(sessionId, resultRows, players.map(p => p.id));
  if (streakWinners.longest > 1) {
    awards.push({
      id: 'hot-streak',
      icon: '🔥',
      title: 'Hot Streak',
      description: 'Longest consecutive wins',
      playerId: streakWinners.playerId,
      playerName: playerNameMap.get(streakWinners.playerId) || '',
      value: `${streakWinners.longest} wins in a row`,
    });
  }

  // 4. Iron Player — Most total court time
  const courtTimes = computeTotalCourtTime(matches);
  if (courtTimes.length > 0) {
    const ironPlayer = courtTimes.sort((a, b) => b.totalSeconds - a.totalSeconds)[0];
    if (ironPlayer.totalSeconds > 0) {
      const mins = Math.floor(ironPlayer.totalSeconds / 60);
      awards.push({
        id: 'iron-player',
        icon: '🏋️',
        title: 'Iron Player',
        description: 'Most court time',
        playerId: ironPlayer.playerId,
        playerName: playerNameMap.get(ironPlayer.playerId) || '',
        value: `${mins} min on court`,
      });
    }
  }

  // 6. Comeback King — Biggest streak turnaround (worst low → best recovery)
  const comebacks = computeComebacks(sessionId, resultRows, players.map(p => p.id));
  if (comebacks && comebacks.turnaround >= 3) {
    awards.push({
      id: 'comeback-king',
      icon: '👑',
      title: 'Comeback King',
      description: 'Biggest streak turnaround',
      playerId: comebacks.playerId,
      playerName: playerNameMap.get(comebacks.playerId) || '',
      value: `${comebacks.worstStreak}L → ${comebacks.bestStreak}W`,
    });
  }

  // 7. Clutch Player — Most close wins (margin ≤ 3 points)
  const clutchWins = computeClutchWins(resultRows, players.map(p => p.id));
  if (clutchWins.length > 0) {
    const clutch = clutchWins.sort((a, b) => b.count - a.count)[0];
    if (clutch.count >= 2) {
      awards.push({
        id: 'clutch-player',
        icon: '🎯',
        title: 'Clutch Player',
        description: 'Most close wins',
        playerId: clutch.playerId,
        playerName: playerNameMap.get(clutch.playerId) || '',
        value: `${clutch.count} close wins`,
      });
    }
  }

  // 8. Unbreakable — Fewest losses (min 3 matches)
  const unbreakableEligible = stats.filter(s => s.matchesPlayed >= 3);
  if (unbreakableEligible.length > 0) {
    const unbreakable = unbreakableEligible.sort((a, b) => a.losses - b.losses || b.matchesPlayed - a.matchesPlayed)[0];
    awards.push({
      id: 'unbreakable',
      icon: '🛡️',
      title: 'Unbreakable',
      description: 'Fewest losses',
      playerId: unbreakable.playerId,
      playerName: unbreakable.playerName,
      value: `Only ${unbreakable.losses} loss${unbreakable.losses !== 1 ? 'es' : ''}`,
    });
  }

  // 9. The Wall — Lowest points allowed per match (min 3 scored matches)
  const wallStats = computePointsAllowed(resultRows, players.map(p => p.id));
  if (wallStats.length > 0) {
    const wall = wallStats.sort((a, b) => a.avgAllowed - b.avgAllowed)[0];
    if (wall.scoredMatches >= 3) {
      awards.push({
        id: 'the-wall',
        icon: '🧱',
        title: 'The Wall',
        description: 'Best defense',
        playerId: wall.playerId,
        playerName: playerNameMap.get(wall.playerId) || '',
        value: `${wall.avgAllowed.toFixed(1)} pts allowed/game`,
      });
    }
  }

  return awards;
}

// --- Helper functions ---

function computeLongestStreaks(sessionId: string, results: MatchResultRow[], playerIds: string[]) {
  let bestPlayerId = '';
  let bestStreak = 0;

  for (const playerId of playerIds) {
    let currentStreak = 0;
    let maxStreak = 0;

    // Get matches in chronological order
    const playerResults = results.filter(r => {
      const winners: string[] = JSON.parse(r.winner_player_ids);
      const losers: string[] = JSON.parse(r.loser_player_ids);
      return winners.includes(playerId) || losers.includes(playerId);
    });

    for (const r of playerResults) {
      const winners: string[] = JSON.parse(r.winner_player_ids);
      if (winners.includes(playerId)) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    if (maxStreak > bestStreak) {
      bestStreak = maxStreak;
      bestPlayerId = playerId;
    }
  }

  return { playerId: bestPlayerId, longest: bestStreak };
}

function computeUniqueOpponents(sessionId: string, results: MatchResultRow[], playerIds: string[]) {
  const counts: Array<{ playerId: string; count: number }> = [];

  for (const playerId of playerIds) {
    const opponents = new Set<string>();
    for (const r of results) {
      const winners: string[] = JSON.parse(r.winner_player_ids);
      const losers: string[] = JSON.parse(r.loser_player_ids);
      const allPlayers = [...winners, ...losers];
      if (allPlayers.includes(playerId)) {
        for (const id of allPlayers) {
          if (id !== playerId) opponents.add(id);
        }
      }
    }
    counts.push({ playerId, count: opponents.size });
  }

  return counts;
}

function computeComebacks(sessionId: string, results: MatchResultRow[], playerIds: string[]) {
  let bestPlayerId = '';
  let bestTurnaround = 0;
  let bestWorst = 0;
  let bestBest = 0;

  for (const playerId of playerIds) {
    let currentStreak = 0;
    let worstLoss = 0;
    let bestWin = 0;

    const playerResults = results.filter(r => {
      const winners: string[] = JSON.parse(r.winner_player_ids);
      const losers: string[] = JSON.parse(r.loser_player_ids);
      return winners.includes(playerId) || losers.includes(playerId);
    });

    for (const r of playerResults) {
      const winners: string[] = JSON.parse(r.winner_player_ids);
      if (winners.includes(playerId)) {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        bestWin = Math.max(bestWin, currentStreak);
      } else {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        worstLoss = Math.min(worstLoss, currentStreak);
      }
    }

    const turnaround = bestWin + Math.abs(worstLoss);
    if (turnaround > bestTurnaround && worstLoss < -1) {
      bestTurnaround = turnaround;
      bestPlayerId = playerId;
      bestWorst = Math.abs(worstLoss);
      bestBest = bestWin;
    }
  }

  if (!bestPlayerId) return null;
  return { playerId: bestPlayerId, turnaround: bestTurnaround, worstStreak: bestWorst, bestStreak: bestBest };
}

function computeClutchWins(results: MatchResultRow[], playerIds: string[]) {
  const counts: Array<{ playerId: string; count: number }> = [];

  for (const playerId of playerIds) {
    let closeWins = 0;
    for (const r of results) {
      if (r.team1_score == null || r.team2_score == null) continue;
      const winners: string[] = JSON.parse(r.winner_player_ids);
      if (!winners.includes(playerId)) continue;
      const margin = Math.abs(r.team1_score - r.team2_score);
      if (margin <= 3) closeWins++;
    }
    if (closeWins > 0) counts.push({ playerId, count: closeWins });
  }

  return counts;
}

function computeTotalCourtTime(matches: MatchRow[]): Array<{ playerId: string; totalSeconds: number }> {
  const timeMap = new Map<string, number>();

  for (const match of matches) {
    if (match.status !== 'completed' || !match.completed_at || !match.started_at) continue;
    const duration = (new Date(match.completed_at).getTime() - new Date(match.started_at).getTime()) / 1000;
    if (duration <= 0) continue;

    const playerIds: string[] = JSON.parse(match.player_ids);
    for (const id of playerIds) {
      timeMap.set(id, (timeMap.get(id) ?? 0) + duration);
    }
  }

  return Array.from(timeMap.entries()).map(([playerId, totalSeconds]) => ({ playerId, totalSeconds }));
}

function computePointsAllowed(results: MatchResultRow[], playerIds: string[]) {
  const stats: Array<{ playerId: string; avgAllowed: number; scoredMatches: number }> = [];

  for (const playerId of playerIds) {
    let totalAllowed = 0;
    let scoredMatches = 0;

    for (const r of results) {
      if (r.team1_score == null || r.team2_score == null) continue;
      const winners: string[] = JSON.parse(r.winner_player_ids);
      const losers: string[] = JSON.parse(r.loser_player_ids);

      if (winners.includes(playerId)) {
        // Player won — points allowed = loser's score
        totalAllowed += Math.min(r.team1_score, r.team2_score);
        scoredMatches++;
      } else if (losers.includes(playerId)) {
        // Player lost — points allowed = winner's score
        totalAllowed += Math.max(r.team1_score, r.team2_score);
        scoredMatches++;
      }
    }

    if (scoredMatches >= 3) {
      stats.push({ playerId, avgAllowed: totalAllowed / scoredMatches, scoredMatches });
    }
  }

  return stats;
}
