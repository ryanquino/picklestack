import { v4 as uuidv4 } from 'uuid';
import * as repo from '../repository';
import type { Club, ClubMember, ClubRaidConfig, ClubRaidMatch, ClubStandings } from '../types';

// ============================================================
// Club Raid Service
// ============================================================

/**
 * Select players from a club for a match, prioritizing FIFO:
 * Players who have been waiting longest in the queue get picked first.
 *
 * Returns `count` player IDs from the club.
 */
export function selectPlayersFromClub(
  clubId: string,
  sessionId: string,
  count: number,
): string[] {
  const members = repo.getClubMembersByClub(clubId);
  if (members.length < count) {
    throw new Error(`Club ${clubId} has only ${members.length} members, need ${count}`);
  }

  // Build queue time map
  const queue = repo.getQueueBySession(sessionId);
  const queueTimeMap = new Map<string, number>();
  for (const entry of queue) {
    queueTimeMap.set(entry.player_id, entry.queued_at ? new Date(entry.queued_at).getTime() : 0);
  }

  // Sort: longest queue wait first (ASC = older timestamp = waited longer = higher priority)
  // Players not in queue go last
  const sorted = [...members].sort((a, b) => {
    const aTime = queueTimeMap.get(a.player_id) ?? Infinity;
    const bTime = queueTimeMap.get(b.player_id) ?? Infinity;
    return aTime - bTime;
  });

  return sorted.slice(0, count).map(m => m.player_id);
}

/** Default club colors */
const CLUB_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
];

/** Create clubs for a session */
export function createClubs(sessionId: string, config: ClubRaidConfig): Club[] {
  const clubs: Club[] = [];

  for (let i = 0; i < config.clubCount; i++) {
    const club: Club = {
      id: uuidv4(),
      sessionId,
      name: `Club ${String.fromCharCode(65 + i)}`, // A, B, C, D, E, F
      color: CLUB_COLORS[i % CLUB_COLORS.length],
      createdAt: new Date().toISOString(),
    };

    repo.createClub({
      id: club.id,
      session_id: club.sessionId,
      name: club.name,
      color: club.color,
      created_at: club.createdAt,
    });

    clubs.push(club);
  }

  return clubs;
}

/** Add a player to a club */
export function addPlayerToClub(clubId: string, playerId: string): ClubMember {
  const member: ClubMember = {
    id: uuidv4(),
    clubId,
    playerId,
    joinedAt: new Date().toISOString(),
  };

  repo.addClubMember({
    id: member.id,
    club_id: member.clubId,
    player_id: member.playerId,
    joined_at: member.joinedAt,
  });

  return member;
}

/** Remove a player from all clubs in a session */
export function removePlayerFromClubs(sessionId: string, playerId: string): void {
  const clubs = repo.getClubsBySession(sessionId);
  for (const club of clubs) {
    repo.removeClubMember(club.id, playerId);
  }
}

/** Get all clubs for a session with their members */
export function getClubs(sessionId: string): Array<Club & { members: ClubMember[] }> {
  const clubs = repo.getClubsBySession(sessionId);
  return clubs.map(club => ({
    id: club.id,
    sessionId: club.session_id,
    name: club.name,
    color: club.color,
    createdAt: club.created_at,
    members: repo.getClubMembersByClub(club.id).map(m => {
      const player = repo.getPlayerById(m.player_id);
      return {
        id: m.id,
        clubId: m.club_id,
        playerId: m.player_id,
        playerName: player?.name ?? '(unknown)',
        joinedAt: m.joined_at,
      };
    }),
  }));
}

/** Get club for a player */
export function getPlayerClub(sessionId: string, playerId: string): Club | null {
  const club = repo.getClubForMember(sessionId, playerId);
  if (!club) return null;
  return {
    id: club.id,
    sessionId: club.session_id,
    name: club.name,
    color: club.color,
    createdAt: club.created_at,
  };
}

/** Generate round-robin schedule */
export function generateRoundRobinSchedule(sessionId: string, clubs: Club[]): ClubRaidMatch[] {
  // Clear any existing schedule first
  repo.deleteClubRaidMatchesBySession(sessionId);

  const matches: ClubRaidMatch[] = [];

  // ============================================================
  // Fairness tracking — per-player metrics for optimized selection
  // ============================================================
  const playerGamesPlayed = new Map<string, number>();
  const playerExtraAppearances = new Map<string, number>();
  const playerPartners = new Map<string, Map<string, number>>();
  const playerOpponents = new Map<string, Set<string>>();
  // Track exact 2v2 matchup compositions to avoid full duplicates
  const usedMatchups = new Set<string>();

  function partnerCount(a: string, b: string): number {
    return playerPartners.get(a)?.get(b) ?? 0;
  }

  function playerFairnessScore(pid: string, potentialTeammate: string | null, potentialOpponents: string[]): number {
    const games = playerGamesPlayed.get(pid) ?? 0;
    const extras = playerExtraAppearances.get(pid) ?? 0;
    let partnerPenalty = 0;
    if (potentialTeammate) {
      partnerPenalty = partnerCount(pid, potentialTeammate) * 200;
    }
    let oppPenalty = 0;
    const opponents = playerOpponents.get(pid);
    if (opponents) {
      for (const opp of potentialOpponents) {
        if (opponents.has(opp)) oppPenalty += 10;
      }
    }
    return games * 100 + extras * 50 + partnerPenalty + oppPenalty;
  }

  function recordMatch(teamA: string[], teamB: string[]): void {
    for (const a of teamA) {
      if (!a) continue;
      playerGamesPlayed.set(a, (playerGamesPlayed.get(a) ?? 0) + 1);
      if (!playerPartners.has(a)) playerPartners.set(a, new Map());
      if (!playerOpponents.has(a)) playerOpponents.set(a, new Set());
      for (const teammate of teamA) {
        if (teammate && teammate !== a) {
          const m = playerPartners.get(a)!;
          m.set(teammate, (m.get(teammate) ?? 0) + 1);
        }
      }
      for (const opp of teamB) { if (opp) playerOpponents.get(a)!.add(opp); }
    }
    for (const b of teamB) {
      if (!b) continue;
      playerGamesPlayed.set(b, (playerGamesPlayed.get(b) ?? 0) + 1);
      if (!playerPartners.has(b)) playerPartners.set(b, new Map());
      if (!playerOpponents.has(b)) playerOpponents.set(b, new Set());
      for (const teammate of teamB) {
        if (teammate && teammate !== b) {
          const m = playerPartners.get(b)!;
          m.set(teammate, (m.get(teammate) ?? 0) + 1);
        }
      }
      for (const opp of teamA) { if (opp) playerOpponents.get(b)!.add(opp); }
    }
  }

  // Standard round-robin: each club plays every other club once
  const clubIds = clubs.map(c => c.id);
  const n = clubIds.length;

  if (n < 2) return matches;

  // Snapshot FIFO queue order for each club at schedule generation time
  const queue = repo.getQueueBySession(sessionId);
  const queueTimeMap = new Map<string, number>();
  for (const entry of queue) {
    queueTimeMap.set(entry.player_id, entry.queued_at ? new Date(entry.queued_at).getTime() : 0);
  }

  const clubSortedMembers = new Map<string, string[]>();
  for (const clubId of clubIds) {
    const members = repo.getClubMembersByClub(clubId);
    const sorted = [...members].sort((a, b) => {
      const aTime = queueTimeMap.get(a.player_id) ?? Infinity;
      const bTime = queueTimeMap.get(b.player_id) ?? Infinity;
      return aTime - bTime;
    });
    clubSortedMembers.set(clubId, sorted.map(m => m.player_id));
  }

  // If odd number, add a bye placeholder
  const ids = [...clubIds];
  if (n % 2 !== 0) {
    ids.push('BYE');
  }

  const totalRounds = ids.length - 1;
  const pairingsPerRound = ids.length / 2;

  // Circle method: fix first element, rotate the rest
  const fixed = ids[0];
  const rotating = ids.slice(1);

  for (let round = 0; round < totalRounds; round++) {
    const roundPairings: Array<[string, string]> = [];

    // Fixed club vs rotating club at this round's position
    const rotIdx = round % rotating.length;
    if (fixed !== 'BYE' && rotating[rotIdx] !== 'BYE') {
      roundPairings.push(round % 2 === 0 ? [fixed, rotating[rotIdx]] : [rotating[rotIdx], fixed]);
    }

    // Other pairs
    for (let i = 1; i < pairingsPerRound; i++) {
      const club1Idx = (rotIdx + i) % rotating.length;
      const club2Idx = (rotIdx + rotating.length - i) % rotating.length;
      const club1 = rotating[club1Idx];
      const club2 = rotating[club2Idx];

      if (club1 !== 'BYE' && club2 !== 'BYE') {
        roundPairings.push((round + i) % 2 === 0 ? [club1, club2] : [club2, club1]);
      }
    }

    // Create sub-matches for each pairing so all players participate
    for (const [clubAId, clubBId] of roundPairings) {
      // Deduplicate pools
      const clubAMembers = [...new Set(clubSortedMembers.get(clubAId) || [])];
      const clubBMembers = [...new Set(clubSortedMembers.get(clubBId) || [])];

      // Sub-matches per pairing: limited by the smaller club so no player repeats
      const subMatchesPerPairing = Math.max(1, Math.floor(Math.min(clubAMembers.length, clubBMembers.length) / 2));

      // Track per-player usage count within this club matchup (no repeats)
      const usageA = new Map<string, number>();
      const usageB = new Map<string, number>();

      function normalizeMatchup(teamA: string[], teamB: string[]): string {
        const a = [...teamA].sort().join('+');
        const b = [...teamB].sort().join('+');
        return a < b ? `${a}|${b}` : `${b}|${a}`;
      }

      function pickOne(usage: Map<string, number>, pool: string[], teammate: string | null, opponentPool: string[]): string {
        // Pass 1: Score every unused player — avoid partner/opponent repeats, spread partnerships evenly
        {
          let bestIdx = -1;
          let bestScore = Infinity;
          // Count total unused players in pool (needed for stale fraction)
          let unusedCount = 0;
          for (let i = 0; i < pool.length; i++) {
            if ((usage.get(pool[i]) ?? 0) === 0) unusedCount++;
          }
          for (let i = 0; i < pool.length; i++) {
            if ((usage.get(pool[i]) ?? 0) !== 0) continue;
            const pid = pool[i];
            let score = 0;
            // Penalize partner repeats — must dominate stale fraction to prevent ANY repeat
            if (teammate) {
              const pc = partnerCount(teammate, pid);
              if (pc > 0) score += pc * 20000;
            }
            // Penalize total partnership weight — prefer less-connected players
            const myPartners = playerPartners.get(pid);
            if (myPartners) {
              let totalWeight = 0;
              for (const w of myPartners.values()) totalWeight += w;
              score += totalWeight * 50;
            }
            // Look-ahead: penalize based on FRACTION of unused pool that are past partners
            if (myPartners && unusedCount > 1) {
              let staleWeight = 0;
              for (let j = 0; j < pool.length; j++) {
                if (pool[j] === pid) continue;
                if ((usage.get(pool[j]) ?? 0) !== 0) continue;
                staleWeight += myPartners.get(pool[j]) ?? 0;
              }
              score += Math.round((staleWeight / (unusedCount - 1)) * 3000);
            }
            // Penalize opponent repeats
            if (opponentPool.length > 0) {
              const myOpponents = playerOpponents.get(pid);
              if (myOpponents) {
                for (const opp of opponentPool) {
                  if (myOpponents.has(opp)) score += 25;
                }
              }
            }
            // Exact matchup duplicate check (only when selecting 4th player)
            if (teammate && opponentPool.length > 0) {
              const key = normalizeMatchup(opponentPool, [teammate, pid]);
              if (usedMatchups.has(key)) score += 10000;
            }
            if (score < bestScore) { bestScore = score; bestIdx = i; }
          }
          if (bestIdx >= 0) {
            const pid = pool[bestIdx];
            usage.set(pid, 1);
            return pid;
          }
        }
        // Pass 2: All players used once — pick the least-scored one for the extra appearance
        let bestIdx = -1;
        let bestScore = Infinity;
        for (let i = 0; i < pool.length; i++) {
          if ((usage.get(pool[i]) ?? 0) >= 2) continue;
          if (pool[i] === teammate) continue;
          const s = playerFairnessScore(pool[i], teammate, opponentPool);
          if (s < bestScore) { bestScore = s; bestIdx = i; }
        }
        if (bestIdx >= 0) {
          const pid = pool[bestIdx];
          usage.set(pid, 2);
          return pid;
        }
        const pid = pool[0];
        usage.set(pid, (usage.get(pid) ?? 0) + 1);
        return pid;
      }

      for (let sub = 0; sub < subMatchesPerPairing; sub++) {
        const clubAPlayer1 = pickOne(usageA, clubAMembers, null, []);
        const clubAPlayer2 = pickOne(usageA, clubAMembers, clubAPlayer1, []);

        const aAssigned = [clubAPlayer1, clubAPlayer2].filter(Boolean) as string[];
        const clubBPlayer1 = pickOne(usageB, clubBMembers, null, aAssigned);
        const clubBPlayer2 = pickOne(usageB, clubBMembers, clubBPlayer1, aAssigned);

        // Track fairness metrics
        const teamA = [clubAPlayer1, clubAPlayer2].filter(Boolean) as string[];
        const teamB = [clubBPlayer1, clubBPlayer2].filter(Boolean) as string[];
        usedMatchups.add(normalizeMatchup(teamA, teamB));
        recordMatch(teamA, teamB);

        const match: ClubRaidMatch = {
          id: uuidv4(),
          sessionId,
          round: round + 1,
          clubAId,
          clubBId,
          clubAPlayer1,
          clubAPlayer2,
          clubBPlayer1,
          clubBPlayer2,
          matchId: null,
          status: 'scheduled',
          winnerClubId: null,
          createdAt: new Date().toISOString(),
        };

        repo.createClubRaidMatch({
          id: match.id,
          session_id: match.sessionId,
          round: match.round,
          club_a_id: match.clubAId,
          club_b_id: match.clubBId,
          club_a_player_1: match.clubAPlayer1,
          club_a_player_2: match.clubAPlayer2,
          club_b_player_1: match.clubBPlayer1,
          club_b_player_2: match.clubBPlayer2,
          match_id: match.matchId,
          status: match.status,
          winner_club_id: match.winnerClubId,
          created_at: match.createdAt,
        });

        matches.push(match);
      }
    }
  }

  return matches;
}

/** Generate one additional round of matches (continuation of round-robin) */
export function generateNextRound(sessionId: string): ClubRaidMatch[] {
  const clubs = repo.getClubsBySession(sessionId);
  const clubIds = clubs.map(c => c.id);
  const n = clubIds.length;
  if (n < 2) return [];

  const existingMatches = repo.getClubRaidMatchesBySession(sessionId);
  const maxRound = existingMatches.length > 0 ? Math.max(...existingMatches.map(m => m.round)) : 0;
  const nextRound = maxRound + 1;

  // Snapshot FIFO queue order
  const queue = repo.getQueueBySession(sessionId);
  const queueTimeMap = new Map<string, number>();
  for (const entry of queue) {
    queueTimeMap.set(entry.player_id, entry.queued_at ? new Date(entry.queued_at).getTime() : 0);
  }

  const clubSortedMembers = new Map<string, string[]>();
  for (const clubId of clubIds) {
    const members = repo.getClubMembersByClub(clubId);
    const sorted = [...members].sort((a, b) => {
      const aTime = queueTimeMap.get(a.player_id) ?? Infinity;
      const bTime = queueTimeMap.get(b.player_id) ?? Infinity;
      return aTime - bTime;
    });
    clubSortedMembers.set(clubId, sorted.map(m => m.player_id));
  }

  // If odd number, add a bye placeholder
  const ids = [...clubIds];
  if (n % 2 !== 0) {
    ids.push('BYE');
  }

  const pairingsPerRound = ids.length / 2;
  const fixed = ids[0];
  const rotating = ids.slice(1);

  // Use nextRound - 1 as the 0-based round index for circle method
  const roundIdx = nextRound - 1;
  const roundPairings: Array<[string, string]> = [];

  const rotIdx = roundIdx % rotating.length;
  if (fixed !== 'BYE' && rotating[rotIdx] !== 'BYE') {
    roundPairings.push(roundIdx % 2 === 0 ? [fixed, rotating[rotIdx]] : [rotating[rotIdx], fixed]);
  }

  for (let i = 1; i < pairingsPerRound; i++) {
    const club1Idx = (rotIdx + i) % rotating.length;
    const club2Idx = (rotIdx + rotating.length - i) % rotating.length;
    const club1 = rotating[club1Idx];
    const club2 = rotating[club2Idx];

    if (club1 !== 'BYE' && club2 !== 'BYE') {
      roundPairings.push((roundIdx + i) % 2 === 0 ? [club1, club2] : [club2, club1]);
    }
  }

  const matches: ClubRaidMatch[] = [];

  // Build fairness tracking from existing matches
  const playerGamesPlayed = new Map<string, number>();
  const playerExtraAppearances = new Map<string, number>();
  const playerPartners = new Map<string, Map<string, number>>();
  const playerOpponents = new Map<string, Set<string>>();
  // Track exact 2v2 matchup compositions to avoid full duplicates
  const usedMatchups = new Set<string>();

  function partnerCount(a: string, b: string): number {
    return playerPartners.get(a)?.get(b) ?? 0;
  }

  function playerFairnessScore(pid: string, potentialTeammate: string | null, potentialOpponents: string[]): number {
    const games = playerGamesPlayed.get(pid) ?? 0;
    const extras = playerExtraAppearances.get(pid) ?? 0;
    let partnerPenalty = 0;
    if (potentialTeammate) {
      partnerPenalty = partnerCount(pid, potentialTeammate) * 200;
    }
    let oppPenalty = 0;
    const opponents = playerOpponents.get(pid);
    if (opponents) {
      for (const opp of potentialOpponents) { if (opponents.has(opp)) oppPenalty += 10; }
    }
    return games * 100 + extras * 50 + partnerPenalty + oppPenalty;
  }

  function recordMatch(teamA: string[], teamB: string[]): void {
    for (const a of teamA) {
      if (!a) continue;
      playerGamesPlayed.set(a, (playerGamesPlayed.get(a) ?? 0) + 1);
      if (!playerPartners.has(a)) playerPartners.set(a, new Map());
      if (!playerOpponents.has(a)) playerOpponents.set(a, new Set());
      for (const teammate of teamA) {
        if (teammate && teammate !== a) {
          const m = playerPartners.get(a)!;
          m.set(teammate, (m.get(teammate) ?? 0) + 1);
        }
      }
      for (const opp of teamB) { if (opp) playerOpponents.get(a)!.add(opp); }
    }
    for (const b of teamB) {
      if (!b) continue;
      playerGamesPlayed.set(b, (playerGamesPlayed.get(b) ?? 0) + 1);
      if (!playerPartners.has(b)) playerPartners.set(b, new Map());
      if (!playerOpponents.has(b)) playerOpponents.set(b, new Set());
      for (const teammate of teamB) {
        if (teammate && teammate !== b) {
          const m = playerPartners.get(b)!;
          m.set(teammate, (m.get(teammate) ?? 0) + 1);
        }
      }
      for (const opp of teamA) { if (opp) playerOpponents.get(b)!.add(opp); }
    }
  }

  // Seed from existing matches
  for (const m of existingMatches) {
    const teamA = [m.club_a_player_1, m.club_a_player_2].filter(Boolean) as string[];
    const teamB = [m.club_b_player_1, m.club_b_player_2].filter(Boolean) as string[];
    recordMatch(teamA, teamB);
    const a = [...teamA].sort().join('+');
    const b = [...teamB].sort().join('+');
    usedMatchups.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }

  for (const [clubAId, clubBId] of roundPairings) {
    const clubAMembers = [...new Set(clubSortedMembers.get(clubAId) || [])];
    const clubBMembers = [...new Set(clubSortedMembers.get(clubBId) || [])];

    const subMatchesPerPairing = Math.max(1, Math.floor(Math.min(clubAMembers.length, clubBMembers.length) / 2));

    const usageA = new Map<string, number>();
    const usageB = new Map<string, number>();

    function normalizeMatchup(teamA: string[], teamB: string[]): string {
      const a = [...teamA].sort().join('+');
      const b = [...teamB].sort().join('+');
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    function pickOne(usage: Map<string, number>, pool: string[], teammate: string | null, opponentPool: string[]): string {
      // Pass 1: Score every unused player — avoid partner/opponent repeats, spread partnerships evenly
      {
        let bestIdx = -1;
        let bestScore = Infinity;
        // Count total unused players in pool (needed for stale fraction)
        let unusedCount = 0;
        for (let i = 0; i < pool.length; i++) {
          if ((usage.get(pool[i]) ?? 0) === 0) unusedCount++;
        }
        for (let i = 0; i < pool.length; i++) {
          if ((usage.get(pool[i]) ?? 0) !== 0) continue;
          const pid = pool[i];
          let score = 0;
          // Penalize partner repeats — must dominate stale fraction to prevent ANY repeat
          if (teammate) {
            const pc = partnerCount(teammate, pid);
            if (pc > 0) score += pc * 20000;
          }
          // Penalize total partnership weight — prefer less-connected players
          const myPartners = playerPartners.get(pid);
          if (myPartners) {
            let totalWeight = 0;
            for (const w of myPartners.values()) totalWeight += w;
            score += totalWeight * 50;
          }
          // Look-ahead: penalize based on FRACTION of unused pool that are past partners
          if (myPartners && unusedCount > 1) {
            let staleWeight = 0;
            for (let j = 0; j < pool.length; j++) {
              if (pool[j] === pid) continue;
              if ((usage.get(pool[j]) ?? 0) !== 0) continue;
              staleWeight += myPartners.get(pool[j]) ?? 0;
            }
            score += Math.round((staleWeight / (unusedCount - 1)) * 3000);
          }
          if (opponentPool.length > 0) {
            const myOpponents = playerOpponents.get(pid);
            if (myOpponents) {
              for (const opp of opponentPool) {
                if (myOpponents.has(opp)) score += 25;
              }
            }
          }
          // Exact matchup duplicate check (only when selecting 4th player)
          if (teammate && opponentPool.length > 0) {
            const key = normalizeMatchup(opponentPool, [teammate, pid]);
            if (usedMatchups.has(key)) score += 10000;
          }
          if (score < bestScore) { bestScore = score; bestIdx = i; }
        }
        if (bestIdx >= 0) {
          const pid = pool[bestIdx];
          usage.set(pid, 1);
          return pid;
        }
      }
      // Pass 2: All used once — pick least-scored for extra appearance
      let bestIdx = -1;
      let bestScore = Infinity;
      for (let i = 0; i < pool.length; i++) {
        if ((usage.get(pool[i]) ?? 0) >= 2) continue;
        if (pool[i] === teammate) continue;
        const s = playerFairnessScore(pool[i], teammate, opponentPool);
        if (s < bestScore) { bestScore = s; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        const pid = pool[bestIdx];
        usage.set(pid, 2);
        return pid;
      }
      const pid = pool[0];
      usage.set(pid, (usage.get(pid) ?? 0) + 1);
      return pid;
    }

    for (let sub = 0; sub < subMatchesPerPairing; sub++) {
      const clubAPlayer1 = pickOne(usageA, clubAMembers, null, []);
      const clubAPlayer2 = pickOne(usageA, clubAMembers, clubAPlayer1, []);

      const aAssigned = [clubAPlayer1, clubAPlayer2].filter(Boolean) as string[];
      const clubBPlayer1 = pickOne(usageB, clubBMembers, null, aAssigned);
      const clubBPlayer2 = pickOne(usageB, clubBMembers, clubBPlayer1, aAssigned);

      const teamA = [clubAPlayer1, clubAPlayer2].filter(Boolean) as string[];
      const teamB = [clubBPlayer1, clubBPlayer2].filter(Boolean) as string[];
      usedMatchups.add(normalizeMatchup(teamA, teamB));
      recordMatch(teamA, teamB);

      const match: ClubRaidMatch = {
        id: uuidv4(),
        sessionId,
        round: nextRound,
        clubAId,
        clubBId,
        clubAPlayer1,
        clubAPlayer2,
        clubBPlayer1,
        clubBPlayer2,
        matchId: null,
        status: 'scheduled',
        winnerClubId: null,
        createdAt: new Date().toISOString(),
      };

      repo.createClubRaidMatch({
        id: match.id,
        session_id: match.sessionId,
        round: match.round,
        club_a_id: match.clubAId,
        club_b_id: match.clubBId,
        club_a_player_1: match.clubAPlayer1,
        club_a_player_2: match.clubAPlayer2,
        club_b_player_1: match.clubBPlayer1,
        club_b_player_2: match.clubBPlayer2,
        match_id: match.matchId,
        status: match.status,
        winner_club_id: match.winnerClubId,
        created_at: match.createdAt,
      });

      matches.push(match);
    }
  }

  return matches;
}

/** Get club standings */
export function getStandings(sessionId: string): ClubStandings[] {
  const clubs = repo.getClubsBySession(sessionId);
  const standingsData = repo.getClubStandings(sessionId);

  const standingsMap = new Map(standingsData.map(s => [s.club_id, s]));

  return clubs.map(club => {
    const data = standingsMap.get(club.id) || { wins: 0, losses: 0, matches_played: 0 };
    const members = repo.getClubMembersByClub(club.id).map(m => ({
      id: m.id,
      clubId: m.club_id,
      playerId: m.player_id,
      joinedAt: m.joined_at,
    }));

    return {
      clubId: club.id,
      clubName: club.name,
      clubColor: club.color,
      wins: data.wins,
      losses: data.losses,
      matchesPlayed: data.matches_played,
      winRate: data.matches_played > 0 ? Math.round((data.wins / data.matches_played) * 100) : 0,
      members,
    };
  });
}

/** Get current round number */
export function getCurrentRound(sessionId: string): number {
  const matches = repo.getClubRaidMatchesBySession(sessionId);
  if (matches.length === 0) return 0;

  // Find the latest round that has completed or active matches
  const maxRound = Math.max(...matches.map(m => m.round));
  return maxRound;
}

/** Get next scheduled match */
export function getNextScheduledMatch(sessionId: string): ClubRaidMatch | null {
  const matches = repo.getClubRaidMatchesBySession(sessionId);
  const next = matches.find(m => m.status === 'scheduled');
  if (!next) return null;

  return {
    id: next.id,
    sessionId: next.session_id,
    round: next.round,
    clubAId: next.club_a_id,
    clubBId: next.club_b_id,
    clubAPlayer1: next.club_a_player_1,
    clubAPlayer2: next.club_a_player_2,
    clubBPlayer1: next.club_b_player_1,
    clubBPlayer2: next.club_b_player_2,
    matchId: next.match_id,
    status: next.status as 'scheduled' | 'active' | 'completed',
    winnerClubId: next.winner_club_id,
    createdAt: next.created_at,
  };
}

/** Get club raid matches for a round */
export function getRoundMatches(sessionId: string, round: number): ClubRaidMatch[] {
  const matches = repo.getClubRaidMatchesByRound(sessionId, round);
  return matches.map(m => ({
    id: m.id,
    sessionId: m.session_id,
    round: m.round,
    clubAId: m.club_a_id,
    clubBId: m.club_b_id,
    clubAPlayer1: m.club_a_player_1,
    clubAPlayer2: m.club_a_player_2,
    clubBPlayer1: m.club_b_player_1,
    clubBPlayer2: m.club_b_player_2,
    matchId: m.match_id,
    status: m.status as 'scheduled' | 'active' | 'completed',
    winnerClubId: m.winner_club_id,
    createdAt: m.created_at,
  }));
}

/** Update club raid match result */
export function updateMatchResult(clubRaidMatchId: string, matchId: string, winnerClubId: string): void {
  repo.updateClubRaidMatch(clubRaidMatchId, {
    match_id: matchId,
    status: 'completed',
    winner_club_id: winnerClubId,
  });
}

/** Delete all club raid data for a session */
export function deleteSessionData(sessionId: string): void {
  repo.deleteClubRaidMatchesBySession(sessionId);
  repo.deleteClubMembersBySession(sessionId);
  repo.deleteClubsBySession(sessionId);
}
