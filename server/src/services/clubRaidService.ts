import { v4 as uuidv4 } from 'uuid';
import * as repo from '../repository';
import type { Club, ClubMember, ClubRaidConfig, ClubRaidMatch, ClubStandings, ClubRaidPlayOrder, ClubRaidPlayRound, ClubRaidPlayBlock, ClubRaidPlayMatch } from '../types';

// ============================================================
// Historical fairness memory
// ============================================================
// The in-function Maps (playerGamesPlayed / playerExtraAppearances /
// playerPartners / playerOpponents) are rebuilt each call. To remember past
// extra appearances, partners, and opponents across "+ Add Round", we persist
// them to club_raid_player_history and reload here.
type FairnessMaps = {
  games: Map<string, number>;
  extras: Map<string, number>;
  partners: Map<string, Map<string, number>>;
  opponents: Map<string, Set<string>>;
};

function loadFairnessMaps(sessionId: string): FairnessMaps {
  const maps: FairnessMaps = {
    games: new Map(),
    extras: new Map(),
    partners: new Map(),
    opponents: new Map(),
  };
  const rows = repo.getClubRaidPlayerHistory(sessionId);
  for (const r of rows) {
    maps.games.set(r.player_id, r.games_played);
    maps.extras.set(r.player_id, r.extra_appearances);
    const pc = JSON.parse(r.partner_counts || '{}') as Record<string, number>;
    const partners = new Map<string, number>();
    for (const [k, v] of Object.entries(pc)) partners.set(k, v);
    maps.partners.set(r.player_id, partners);
    const oc = JSON.parse(r.opponent_counts || '{}') as Record<string, number>;
    const opponents = new Set<string>();
    for (const k of Object.keys(oc)) opponents.add(k);
    maps.opponents.set(r.player_id, opponents);
  }
  return maps;
}

function writeFairnessMaps(sessionId: string, maps: FairnessMaps): void {
  const out: repo.ClubRaidPlayerHistoryRow[] = [];
  const now = new Date().toISOString();
  const allPlayerIds = new Set<string>([
    ...maps.games.keys(),
    ...maps.extras.keys(),
    ...maps.partners.keys(),
    ...maps.opponents.keys(),
  ]);
  for (const pid of allPlayerIds) {
    const partners = maps.partners.get(pid) ?? new Map();
    const opponents = maps.opponents.get(pid) ?? new Set();
    out.push({
      session_id: sessionId,
      player_id: pid,
      games_played: maps.games.get(pid) ?? 0,
      extra_appearances: maps.extras.get(pid) ?? 0,
      partner_counts: JSON.stringify(Object.fromEntries(partners)),
      opponent_counts: JSON.stringify(Object.fromEntries([...opponents].map(o => [o, 1]))),
      updated_at: now,
    });
  }
  repo.replaceClubRaidPlayerHistory(sessionId, out);
}

// ============================================================
// Per-club teammate pairing planner
// ============================================================
// Instead of picking teammates greedily (which converges on "fixed pairs"),
// we pre-plan each club's pairings with the round-robin "circle method". For an
// even-sized club this produces every unique teammate pair exactly once across
// (n-1) rounds, so no pair ever repeats until all pairs are exhausted. This
// guarantees maximal partner rotation.

function teamPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function rotate<T>(arr: T[], k: number): T[] {
  const n = arr.length;
  if (n === 0) return [];
  k = ((k % n) + n) % n;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

// Plan ONE round of pairings for a club using the circle (round-robin) method.
// `roundIndex` is the absolute round number (0-based). The circle method fixes
// one player and rotates the rest; pairing is CHAINED: (fixed, last),
// (i, last-i). Using a consistent rotation schedule (offset = roundIndex) makes
// every round's pairs fully disjoint from the others until all pairs are
// exhausted, so teammates never repeat until they must.
//
// For odd-sized clubs a single player sits out each round (rotated through the
// bye). `usedPairs` is only consulted as a tie-breaker for the odd case.
function planRoundPairs(members: string[], roundIndex: number, usedPairs?: Set<string>): Array<[string, string]> {
  const n = members.length;
  if (n < 2) return [];
  if (n % 2 === 0) {
    const ring = [members[0], ...rotate(members.slice(1), roundIndex % (n - 1))];
    const last = n - 1;
    const pairs: Array<[string, string]> = [];
    pairs.push([ring[0], ring[last]]);
    for (let i = 1; i < last / 2; i++) {
      pairs.push([ring[i], ring[last - i]]);
    }
    return pairs;
  }
  // Odd: insert a rotating bye, then run the even algorithm on n+1 slots.
  const pool = [...members, '__CLUB_RAID_BYE__'];
  const m = pool.length; // even
  const ring = [pool[0], ...rotate(pool.slice(1), roundIndex % (m - 1))];
  const last = m - 1;
  const pairs: Array<[string, string]> = [];
  {
    const a = ring[0], b = ring[last];
    if (a !== '__CLUB_RAID_BYE__' && b !== '__CLUB_RAID_BYE__') pairs.push([a, b]);
  }
  for (let i = 1; i < last / 2; i++) {
    const c = ring[i], d = ring[last - i];
    if (c !== '__CLUB_RAID_BYE__' && d !== '__CLUB_RAID_BYE__') pairs.push([c, d]);
  }
  return pairs;
}

// Plan all rounds for all clubs. `usedPairsByClub` seeds already-used pairs
// (from prior rounds / durable history) so planned rounds never repeat them.
function planAllClubPairings(
  clubMembers: Map<string, string[]>,
  totalRounds: number,
  usedPairsByClub: Map<string, Set<string>>,
  startRound = 0,
): Map<string, Array<Array<[string, string]>>> {
  const plan = new Map<string, Array<Array<[string, string]>>>();
  for (const [clubId, members] of clubMembers) {
    const used = new Set(usedPairsByClub.get(clubId) || []);
    const rounds: Array<Array<[string, string]>> = [];
    for (let r = 0; r < totalRounds; r++) {
      const pairs = planRoundPairs(members, startRound + r, used);
      rounds.push(pairs);
    }
    plan.set(clubId, rounds);
  }
  return plan;
}

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
  // Clear any existing schedule AND fairness history first (Regenerate starts fresh)
  repo.deleteClubRaidMatchesBySession(sessionId);
  repo.deleteClubRaidPlayerHistory(sessionId);

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
      partnerPenalty = partnerCount(pid, potentialTeammate) * 20000;
    }
    let oppPenalty = 0;
    const opponents = playerOpponents.get(pid);
    if (opponents) {
      for (const opp of potentialOpponents) {
        if (opponents.has(opp)) oppPenalty += 1000;
      }
    }
    return games * 100 + extras * 1000 + partnerPenalty + oppPenalty;
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

  // Pre-plan each club's teammate pairings for every round using the circle
  // method. This guarantees partner rotation (no repeated pair until all pairs
  // are exhausted) instead of relying on greedy selection. Plans are empty for
  // a fresh generation; "+ Add Round" seeds them from prior pairings below.
  const clubPairPlan = planAllClubPairings(clubSortedMembers, clubIds.length - 1, new Map());

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

      // Sub-matches per pairing: CEIL of the LARGER club's half, so every
      // member of an odd-sized club also gets to play each round (no one sits
      // out). For an odd club this is one more than the number of planned
      // (non-repeating) teammate pairs, so the final sub-match reuses the bye
      // player in a *smart* repeat (least-repeated teammate + freshest
      // opponents) rather than an arbitrary greedy pick.
      const subMatchesPerPairing = Math.max(1, Math.ceil(Math.max(clubAMembers.length, clubBMembers.length) / 2));

      // Track per-player usage count within this club matchup (no repeats)
      const usageA = new Map<string, number>();
      const usageB = new Map<string, number>();

      function normalizeMatchup(teamA: string[], teamB: string[]): string {
        const a = [...teamA].sort().join('+');
        const b = [...teamB].sort().join('+');
        return a < b ? `${a}|${b}` : `${b}|${a}`;
      }

      // Shared H2H repeat scoring. Teammate repeats are weighted far higher than
      // opponent repeats (players notice repeated partners more), and an exact
      // 2v2 rematch is blocked outright.
      function repeatScore(pid: string, teammate: string | null, opponentPool: string[]): number {
        let s = 0;
        if (teammate) {
          s += partnerCount(teammate, pid) * 20000;
        }
        const myPartners = playerPartners.get(pid);
        if (myPartners) {
          let totalWeight = 0;
          for (const w of myPartners.values()) totalWeight += w;
          s += totalWeight * 50;
        }
        if (opponentPool.length > 0) {
          const myOpponents = playerOpponents.get(pid);
          if (myOpponents) {
            for (const opp of opponentPool) {
              if (myOpponents.has(opp)) s += 1000;
            }
          }
        }
        if (teammate && opponentPool.length > 0) {
          const key = normalizeMatchup(opponentPool, [teammate, pid]);
          if (usedMatchups.has(key)) s += 50000;
        }
        return s;
      }

      function pickOne(usage: Map<string, number>, pool: string[], teammate: string | null, opponentPool: string[], allowRepeat: boolean): string {
        // Pass 1: Score every unused player — avoid partner/opponent repeats, spread partnerships evenly
        {
          let bestIdx = -1;
          let bestScore = Infinity;
          // Count total unused players in pool (needed for stale fraction)
          let unusedCount = 0;
          for (let i = 0; i < pool.length; i++) {
            if ((usage.get(pool[i]) ?? 0) === 0) unusedCount++;
          }
          // When a teammate is being chosen, prefer forming a teammate pair that
          // has NEVER occurred before. Only allow a repeated pair once every
          // unused player has already been paired with this teammate at least once.
          // This forces maximal partner rotation and breaks "fixed partnerships".
          let freshPairAvailable = false;
          if (teammate) {
            for (let i = 0; i < pool.length; i++) {
              if ((usage.get(pool[i]) ?? 0) !== 0) continue;
              if (partnerCount(teammate, pool[i]) === 0) { freshPairAvailable = true; break; }
            }
          }
          for (let i = 0; i < pool.length; i++) {
            if ((usage.get(pool[i]) ?? 0) !== 0) continue;
            // Skip repeated teammate pairs while a fresh pair is still available
            if (teammate && freshPairAvailable && partnerCount(teammate, pool[i]) !== 0) continue;
            const pid = pool[i];
            let score = 0;
            score += repeatScore(pid, teammate, opponentPool);
            // Look-ahead: penalize based on FRACTION of unused pool that are past partners
            const myPartners = playerPartners.get(pid);
            if (myPartners && unusedCount > 1) {
              let staleWeight = 0;
              for (let j = 0; j < pool.length; j++) {
                if (pool[j] === pid) continue;
                if ((usage.get(pool[j]) ?? 0) !== 0) continue;
                staleWeight += myPartners.get(pool[j]) ?? 0;
              }
              score += Math.round((staleWeight / (unusedCount - 1)) * 3000);
            }
            if (score < bestScore) { bestScore = score; bestIdx = i; }
          }
          if (bestIdx >= 0) {
            const pid = pool[bestIdx];
            usage.set(pid, 1);
            return pid;
          }
        }
        // Pass 2: All players used once — pick the least-scored one for the extra appearance.
        // Only allowed on the LAST sub-match of the pairing (exhaust everyone first).
        if (!allowRepeat) {
          // No unused players remain but repeats are disallowed — fall back to first pool member
          // to avoid returning undefined (should not normally happen within a round).
          const fb = pool[0];
          playerExtraAppearances.set(fb, (playerExtraAppearances.get(fb) ?? 0) + 1);
          return fb;
        }
        let bestIdx = -1;
        let bestScore = Infinity;
        // Force fresh teammate pairs here too, so even the duplicate slot rotates
        // partners instead of re-forming a fixed pair.
        let freshPairAvailable = false;
        if (teammate) {
          for (let i = 0; i < pool.length; i++) {
            if ((usage.get(pool[i]) ?? 0) >= 2) continue;
            if (pool[i] === teammate) continue;
            if (partnerCount(teammate, pool[i]) === 0) { freshPairAvailable = true; break; }
          }
        }
        for (let i = 0; i < pool.length; i++) {
          if ((usage.get(pool[i]) ?? 0) >= 2) continue;
          if (pool[i] === teammate) continue;
          if (teammate && freshPairAvailable && partnerCount(teammate, pool[i]) !== 0) continue;
          const s = playerFairnessScore(pool[i], teammate, opponentPool);
          if (s < bestScore) { bestScore = s; bestIdx = i; }
        }
        if (bestIdx >= 0) {
          const pid = pool[bestIdx];
          usage.set(pid, 2);
          playerExtraAppearances.set(pid, (playerExtraAppearances.get(pid) ?? 0) + 1);
          return pid;
        }
        const pid = pool[0];
        usage.set(pid, (usage.get(pid) ?? 0) + 1);
        playerExtraAppearances.set(pid, (playerExtraAppearances.get(pid) ?? 0) + 1);
        return pid;
      }

      // Smart selection for the forced "extra" sub-match of an odd-sized club,
      // where every planned (non-repeating) pair is already used and one more
      // pair is needed so nobody sits out. The bye player (who hasn't played
      // this round) is paired with a partner who will therefore play TWICE this
      // round — that partner is the "extra appearance". To keep the extra
      // appearances fair we rotate that double player across the club: among
      // partners that keep the (bye, partner) pair novel, we strongly prefer
      // the player with the FEWEST prior extra appearances, so the 15 players
      // share the double slot evenly instead of the same few players repeating.
      function pickExtraPair(usage: Map<string, number>, pool: string[], opponentPool: string[]): [string, string] {
        let bye = pool.find(p => (usage.get(p) ?? 0) === 0);
        if (!bye) {
          let minU = Infinity;
          for (const p of pool) { const u = usage.get(p) ?? 0; if (u < minU) { minU = u; bye = p; } }
        }
        bye = bye!;
        let bestPartner = bye;
        let bestScore = Infinity;
        for (const p of pool) {
          if (p === bye) continue;
          // Tier 1: avoid repeating an already-used teammate pair (dominant, so
          // partner variety is preserved). Tier 2: rotate the extra appearance
          // by strongly preferring the least-doubled player. Tier 3: freshest
          // opponents / matchup.
          let score = partnerCount(bye, p) * 100000;
          score += (playerExtraAppearances.get(p) ?? 0) * 8000;
          const myOpp = playerOpponents.get(p);
          if (myOpp) for (const o of opponentPool) if (myOpp.has(o)) score += 1000;
          if (opponentPool.length > 0) {
            const key = normalizeMatchup(opponentPool, [bye, p]);
            if (usedMatchups.has(key)) score += 50000;
          }
          if (score < bestScore) { bestScore = score; bestPartner = p; }
        }
        usage.set(bye, (usage.get(bye) ?? 0) + 1);
        usage.set(bestPartner, (usage.get(bestPartner) ?? 0) + 1);
        playerExtraAppearances.set(bestPartner, (playerExtraAppearances.get(bestPartner) ?? 0) + 1);
        return [bye, bestPartner];
      }

      for (let sub = 0; sub < subMatchesPerPairing; sub++) {
        // Repeats only permitted on the final sub-match of this pairing
        const allowRepeat = sub === subMatchesPerPairing - 1;
        // Prefer pre-planned teammate pairs (guarantees rotation). Fall back to
        // greedy pickOne for odd-sized clubs where planning can't cover everyone.
        const planA = clubPairPlan.get(clubAId)?.[round]?.[sub];
        const planB = clubPairPlan.get(clubBId)?.[round]?.[sub];
        let clubAPlayer1: string, clubAPlayer2: string, clubBPlayer1: string, clubBPlayer2: string;
        if (planA) {
          [clubAPlayer1, clubAPlayer2] = planA;
          usageA.set(clubAPlayer1, (usageA.get(clubAPlayer1) ?? 0) + 1);
          usageA.set(clubAPlayer2, (usageA.get(clubAPlayer2) ?? 0) + 1);
        } else {
          [clubAPlayer1, clubAPlayer2] = pickExtraPair(usageA, clubAMembers, clubBMembers);
        }
        const aAssigned = [clubAPlayer1, clubAPlayer2].filter(Boolean) as string[];
        if (planB) {
          [clubBPlayer1, clubBPlayer2] = planB;
          usageB.set(clubBPlayer1, (usageB.get(clubBPlayer1) ?? 0) + 1);
          usageB.set(clubBPlayer2, (usageB.get(clubBPlayer2) ?? 0) + 1);
        } else {
          [clubBPlayer1, clubBPlayer2] = pickExtraPair(usageB, clubBMembers, aAssigned);
        }

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

  // Persist accumulated fairness memory so "+ Add Round" can build on it
  writeFairnessMaps(sessionId, {
    games: playerGamesPlayed,
    extras: playerExtraAppearances,
    partners: playerPartners,
    opponents: playerOpponents,
  });

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

  // Seed already-used teammate pairs (from prior rounds / durable history) so
  // the newly planned round never repeats a pair that already occurred.
  const playerClub = new Map<string, string>();
  for (const [cid, members] of clubSortedMembers) {
    for (const pid of members) playerClub.set(pid, cid);
  }
  const usedPairsByClub = new Map<string, Set<string>>();
  for (const m of existingMatches) {
    for (const [a, b] of [
      [m.club_a_player_1, m.club_a_player_2],
      [m.club_b_player_1, m.club_b_player_2],
    ] as Array<[string | null, string | null]>) {
      if (!a || !b) continue;
      const cid = playerClub.get(a);
      if (!cid) continue;
      if (!usedPairsByClub.has(cid)) usedPairsByClub.set(cid, new Set());
      usedPairsByClub.get(cid)!.add(teamPairKey(a, b));
    }
  }

  // Pre-plan this single additional round's teammate pairs (circle method) at
  // the correct continuing offset (nextRound - 1) so partner rotation carries
  // across "+ Add Round" without repeating prior pairs.
  const clubPairPlan = planAllClubPairings(clubSortedMembers, 1, usedPairsByClub, nextRound - 1);

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

  // Load durable fairness memory (carried across prior "+ Add Round" calls).
  // This is what lets the scheduler remember past extra appearances, partners,
  // and opponents so the scarce duplicate slot keeps rotating.
  const historyLoaded = loadFairnessMaps(sessionId);
  for (const [pid, v] of historyLoaded.games) playerGamesPlayed.set(pid, v);
  for (const [pid, v] of historyLoaded.extras) playerExtraAppearances.set(pid, v);
  for (const [pid, v] of historyLoaded.partners) playerPartners.set(pid, v);
  for (const [pid, v] of historyLoaded.opponents) playerOpponents.set(pid, v);
  const hasHistory = historyLoaded.games.size > 0;

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
    return games * 100 + extras * 1000 + partnerPenalty + oppPenalty;
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

  // Seed from existing matches — only when durable history is absent (defensive
  // fallback). When history exists it is already authoritative, so re-seeding
  // here would double-count.
  if (!hasHistory) {
  for (const m of existingMatches) {
    const teamA = [m.club_a_player_1, m.club_a_player_2].filter(Boolean) as string[];
    const teamB = [m.club_b_player_1, m.club_b_player_2].filter(Boolean) as string[];
    recordMatch(teamA, teamB);
    const a = [...teamA].sort().join('+');
    const b = [...teamB].sort().join('+');
    usedMatchups.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  }
  }

  // Seed double-game counts from existing matches so the scarce duplicate slot
  // is spread across rounds, not concentrated on the same players. Only when
  // durable history is absent; otherwise history.extras is authoritative.
  if (!hasHistory) {
    const appearances = new Map<string, number>();
    const allPlayerIds: string[] = [];
    for (const m of existingMatches) {
      for (const pid of [m.club_a_player_1, m.club_a_player_2, m.club_b_player_1, m.club_b_player_2]) {
        if (!pid) continue;
        appearances.set(pid, (appearances.get(pid) ?? 0) + 1);
        allPlayerIds.push(pid);
      }
    }
    const clubMin = new Map<string, number>();
    for (const pid of allPlayerIds) {
      const c = playerClub.get(pid);
      if (!c) continue;
      const cnt = appearances.get(pid) ?? 0;
      clubMin.set(c, Math.min(clubMin.get(c) ?? Infinity, cnt));
    }
    for (const [pid, cnt] of appearances) {
      const c = playerClub.get(pid);
      if (!c) continue;
      playerExtraAppearances.set(pid, Math.max(0, cnt - (clubMin.get(c) ?? cnt)));
    }
  }

  for (const [clubAId, clubBId] of roundPairings) {
    const clubAMembers = [...new Set(clubSortedMembers.get(clubAId) || [])];
    const clubBMembers = [...new Set(clubSortedMembers.get(clubBId) || [])];

    const subMatchesPerPairing = Math.max(1, Math.ceil(Math.max(clubAMembers.length, clubBMembers.length) / 2));

    const usageA = new Map<string, number>();
    const usageB = new Map<string, number>();

    function normalizeMatchup(teamA: string[], teamB: string[]): string {
      const a = [...teamA].sort().join('+');
      const b = [...teamB].sort().join('+');
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    function pickOne(usage: Map<string, number>, pool: string[], teammate: string | null, opponentPool: string[], allowRepeat: boolean): string {
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
      // Pass 2: All players used once — pick the least-scored one for the extra appearance.
      // Only allowed on the LAST sub-match of the pairing (exhaust everyone first).
      if (!allowRepeat) {
        // No unused players remain but repeats are disallowed — fall back to first pool member
        // to avoid returning undefined (should not normally happen within a round).
        return pool[0];
      }
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

    // Smart selection for the forced "extra" sub-match of an odd-sized club,
    // where every planned (non-repeating) pair is already used and one more
    // pair is needed so nobody sits out. Pair the bye player (hasn't played
    // this round) with the least-repeated partner against freshest opponents.
    function pickExtraPair(usage: Map<string, number>, pool: string[], opponentPool: string[]): [string, string] {
      let bye = pool.find(p => (usage.get(p) ?? 0) === 0);
      if (!bye) {
        let minU = Infinity;
        for (const p of pool) { const u = usage.get(p) ?? 0; if (u < minU) { minU = u; bye = p; } }
      }
      bye = bye!;
      let bestPartner = bye;
      let bestScore = Infinity;
      for (const p of pool) {
        if (p === bye) continue;
        let score = partnerCount(bye, p) * 100000;
        score += (playerExtraAppearances.get(p) ?? 0) * 8000;
        const myOpp = playerOpponents.get(p);
        if (myOpp) for (const o of opponentPool) if (myOpp.has(o)) score += 1000;
        if (opponentPool.length > 0) {
          const key = normalizeMatchup(opponentPool, [bye, p]);
          if (usedMatchups.has(key)) score += 50000;
        }
        if (score < bestScore) { bestScore = score; bestPartner = p; }
      }
      usage.set(bye, (usage.get(bye) ?? 0) + 1);
      usage.set(bestPartner, (usage.get(bestPartner) ?? 0) + 1);
      playerExtraAppearances.set(bestPartner, (playerExtraAppearances.get(bestPartner) ?? 0) + 1);
      return [bye, bestPartner];
    }

    for (let sub = 0; sub < subMatchesPerPairing; sub++) {
      // Repeats only permitted on the final sub-match of this pairing
      const allowRepeat = sub === subMatchesPerPairing - 1;
      // Prefer pre-planned teammate pairs (guarantees rotation). Fall back to
      // a smart extra-pair pick for odd-sized clubs. Plan index is 0 (single new round).
      const planA = clubPairPlan.get(clubAId)?.[0]?.[sub];
      const planB = clubPairPlan.get(clubBId)?.[0]?.[sub];
      let clubAPlayer1: string, clubAPlayer2: string, clubBPlayer1: string, clubBPlayer2: string;
        if (planA) {
          [clubAPlayer1, clubAPlayer2] = planA;
          usageA.set(clubAPlayer1, (usageA.get(clubAPlayer1) ?? 0) + 1);
          usageA.set(clubAPlayer2, (usageA.get(clubAPlayer2) ?? 0) + 1);
        } else {
          [clubAPlayer1, clubAPlayer2] = pickExtraPair(usageA, clubAMembers, clubBMembers);
        }
        const aAssigned = [clubAPlayer1, clubAPlayer2].filter(Boolean) as string[];
        if (planB) {
          [clubBPlayer1, clubBPlayer2] = planB;
          usageB.set(clubBPlayer1, (usageB.get(clubBPlayer1) ?? 0) + 1);
          usageB.set(clubBPlayer2, (usageB.get(clubBPlayer2) ?? 0) + 1);
        } else {
          [clubBPlayer1, clubBPlayer2] = pickExtraPair(usageB, clubBMembers, aAssigned);
        }

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

  // Persist accumulated fairness memory (prior history + this round)
  writeFairnessMaps(sessionId, {
    games: playerGamesPlayed,
    extras: playerExtraAppearances,
    partners: playerPartners,
    opponents: playerOpponents,
  });

  return matches;
}

/** Get club standings */
export function getStandings(sessionId: string): ClubStandings[] {
  const clubs = repo.getClubsBySession(sessionId);
  const standingsData = repo.getClubStandings(sessionId);

  const standingsMap = new Map(standingsData.map(s => [s.club_id, s]));

  return clubs.map(club => {
    const data = standingsMap.get(club.id) || { wins: 0, losses: 0, matches_played: 0, points_for: 0, points_against: 0 };
    const members = repo.getClubMembersByClub(club.id).map(m => ({
      id: m.id,
      clubId: m.club_id,
      playerId: m.player_id,
      joinedAt: m.joined_at,
    }));

    const pointsFor = data.points_for || 0;
    const pointsAgainst = data.points_against || 0;
    return {
      clubId: club.id,
      clubName: club.name,
      clubColor: club.color,
      wins: data.wins,
      losses: data.losses,
      matchesPlayed: data.matches_played,
      winRate: data.matches_played > 0 ? Math.round((data.wins / data.matches_played) * 100) : 0,
      pointDifferential: pointsFor - pointsAgainst,
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

/**
 * Compute a fair play order for the full Club Raid schedule.
 *
 * Goal: equal average rest time per player. A round is split into club-pairing
 * blocks (e.g. A vs B, C vs D). Each block's sub-matches are packed into waves
 * across the courts allocated to that block (courtCount / numBlocks). Within a
 * block every player appears exactly once — except the unavoidable "double"
 * player (who plays twice to fill the extra slot in an odd club). We order the
 * block's matches so the double player's two matches land in the FIRST and LAST
 * waves (maximizing their idle gap), and the remaining matches fill the middle
 * waves; because every other player appears only once, their rest is
 * automatically equal (they sit out all-but-one wave). This yields a fair,
 * rest-balanced sequence without changing any pairings.
 *
 * Pure function: does not read/write the DB or mutate inputs.
 */
export function computeClubRaidPlayOrder(
  matches: ClubRaidMatch[],
  courtCount: number,
): ClubRaidPlayOrder {
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
  const totalCourts = Math.max(1, courtCount);

  // Track per-player wave appearances across the whole event for rest metrics.
  const playerWaves = new Map<string, Array<{ round: number; wave: number }>>();

  const playersOf = (m: ClubRaidMatch): string[] =>
    [m.clubAPlayer1, m.clubAPlayer2, m.clubBPlayer1, m.clubBPlayer2].filter(Boolean) as string[];

  type BlockPlan = {
    clubAId: string;
    clubBId: string;
    doublePlayerId: string | null;
    firstDouble: ClubRaidMatch | null;
    lastDouble: ClubRaidMatch | null;
    others: ClubRaidMatch[];
  };

  // Build, for each round, the list of "blocks" (club pairings) and a continuous
  // feed order: round-robin across blocks (so pairings mix within a wave), with
  // each block's double match pinned to the START and END of the round's feed.
  const roundData: {
    round: number;
    matches: ClubRaidMatch[];
    plans: BlockPlan[];
    feed: ClubRaidMatch[];
    unplaced: ClubRaidMatch[];   // matches not yet assigned a wave
    waveOf: Map<string, number>; // matchId -> local wave (filled later)
  }[] = [];

  for (const round of rounds) {
    const roundMatches = matches.filter(m => m.round === round);
    const blockMap = new Map<string, ClubRaidMatch[]>();
    for (const m of roundMatches) {
      const key = [m.clubAId, m.clubBId].sort().join('|');
      if (!blockMap.has(key)) blockMap.set(key, []);
      blockMap.get(key)!.push(m);
    }

    const plans: BlockPlan[] = [];
    for (const [, blockMatchesRaw] of blockMap) {
      const counts = new Map<string, number>();
      for (const m of blockMatchesRaw) {
        for (const p of playersOf(m)) counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      let doublePlayer: string | null = null;
      for (const [p, c] of counts) if (c > 1) { doublePlayer = p; break; }

      const doubleMatches: ClubRaidMatch[] = [];
      const others: ClubRaidMatch[] = [];
      if (doublePlayer) {
        for (const m of blockMatchesRaw) {
          const has = playersOf(m).includes(doublePlayer);
          (has ? doubleMatches : others).push(m);
        }
      } else {
        others.push(...blockMatchesRaw);
      }
      plans.push({
        clubAId: blockMatchesRaw[0].clubAId,
        clubBId: blockMatchesRaw[0].clubBId,
        doublePlayerId: doublePlayer,
        firstDouble: doubleMatches[0] ?? null,
        lastDouble: doubleMatches[1] ?? null,
        others,
      });
    }

    const feed: ClubRaidMatch[] = [];
    const othersQueues = plans.map(p => [...p.others]);
    for (const p of plans) if (p.firstDouble) feed.push(p.firstDouble);
    let progress = true;
    while (progress) {
      progress = false;
      for (let bi = 0; bi < othersQueues.length; bi++) {
        if (othersQueues[bi].length > 0) {
          feed.push(othersQueues[bi].shift()!);
          progress = true;
        }
      }
    }
    for (const p of plans) if (p.lastDouble) feed.push(p.lastDouble);

    roundData.push({
      round,
      matches: roundMatches,
      plans,
      feed,
      unplaced: [...feed],
      waveOf: new Map(),
    });
  }

  // --- Packing ------------------------------------------------------------
  // We pack round-by-round, but the LAST (partial) wave of one round is topped
  // up with matches borrowed from the NEXT round (conflict-checked), so the
  // courts stay full. Within a round no player ever repeats (each plays once,
  // or twice if they're the block's double), so there are no intra-round
  // conflicts; the only conflicts possible are cross-round (same player in the
  // outgoing tail wave and a borrowed match) which we simply avoid by skipping.
  const playersInWave: Set<string>[] = [new Set()]; // local-wave w -> players
  const perWave = [0];
  let waveCursor = 0; // current (local) wave index across the whole event

  const ensureWave = (w: number) => {
    while (playersInWave.length <= w) {
      playersInWave.push(new Set());
      perWave.push(0);
    }
  };
  const conflictInWave = (m: ClubRaidMatch, w: number): boolean => {
    ensureWave(w);
    for (const p of playersOf(m)) if (playersInWave[w].has(p)) return true;
    return false;
  };
  const placeInto = (m: ClubRaidMatch, w: number, target: typeof roundData[number]) => {
    ensureWave(w);
    target.waveOf.set(m.id, w);
    perWave[w]++;
    for (const p of playersOf(m)) playersInWave[w].add(p);
  };

  // --- Per-round packing without cross-round borrow -----------------------
  // Each round is packed into waves of `totalCourts` from its OWN matches only.
  // Cross-round borrowing is intentionally NOT used: in Club Raid every player
  // plays every round, so the very next round's matches involve the SAME players
  // (verified: ~100% of players appear in both consecutive rounds). Any next-
  // round match would therefore re-use a player already busy in this round's
  // tail wave, breaking the no-same-player-per-wave rule. The round's final wave
  // is thus the only (unavoidable) partial wave, sized `matchesThisRound mod
  // totalCourts`. Interior waves are always full. Choosing a court count that
  // divides the per-round match count keeps every wave full.
  for (let ri = 0; ri < roundData.length; ri++) {
    const rd = roundData[ri];
    while (rd.unplaced.length > 0) {
      ensureWave(waveCursor);
      let placed = false;
      for (let i = rd.unplaced.length - 1; i >= 0; i--) {
        if (perWave[waveCursor] >= totalCourts) break;
        if (conflictInWave(rd.unplaced[i], waveCursor)) continue;
        const m = rd.unplaced.splice(i, 1)[0];
        placeInto(m, waveCursor, rd);
        placed = true;
      }
      if (!placed) break; // safety (all remaining conflict with current wave)
      if (perWave[waveCursor] >= totalCourts) waveCursor++;
    }
  }

  // --- Build output -------------------------------------------------------
  // Waves use a GLOBAL continuous index (never reset per round) so the whole
  // schedule reads as one continuous stream of waves. numWaves = the span of
  // global waves this round occupies (local wave index = global − firstGlobal).
  const playRounds: ClubRaidPlayRound[] = [];
  for (const rd of roundData) {
    // Only matches actually placed in THIS round (borrowed-out matches moved to
    // the borrowing round, so they're absent from rd.waveOf here).
    const ownMatches = rd.matches.filter(m => rd.waveOf.has(m.id));
    const usedWaves = [...new Set(ownMatches.map(m => rd.waveOf.get(m.id)!))].sort((a, b) => a - b);
    const firstGW = usedWaves[0];
    const lastGW = usedWaves[usedWaves.length - 1];
    const numWaves = (lastGW - firstGW) + 1;

    const blocks: ClubRaidPlayBlock[] = [];
    for (const p of rd.plans) {
      const allBlockMatches = ([p.firstDouble, p.lastDouble, ...p.others].filter(Boolean) as ClubRaidMatch[])
        .filter(m => rd.waveOf.has(m.id));
      const slotCounter = new Array(numWaves).fill(0);
      const playMatches: ClubRaidPlayMatch[] = allBlockMatches.map((m) => {
        const players: [string, string, string, string] = [
          m.clubAPlayer1!, m.clubAPlayer2!, m.clubBPlayer1!, m.clubBPlayer2!,
        ];
        const globalWave = rd.waveOf.get(m.id)!;
        const wave = globalWave - firstGW;
        const courtSlot = slotCounter[wave]++;
        for (const pl of players) {
          if (!playerWaves.has(pl)) playerWaves.set(pl, []);
          playerWaves.get(pl)!.push({ round: rd.round, wave: globalWave });
        }
        return {
          matchId: m.id,
          clubAId: m.clubAId,
          clubBId: m.clubBId,
          players,
          isDouble: p.doublePlayerId ? players.includes(p.doublePlayerId) : false,
          wave,
          courtSlot,
        };
      });
      blocks.push({
        clubAId: p.clubAId,
        clubBId: p.clubBId,
        numWaves,
        courtsPerBlock: totalCourts,
        doublePlayerId: p.doublePlayerId,
        matches: playMatches,
      });
    }
    playRounds.push({ round: rd.round, numWaves, blocks });
  }

  // Rest metric: average number of GLOBAL waves between a player's appearances.
  // `wave` already holds the global continuous wave index, so gaps are exact.
  const restByPlayer: Record<string, number> = {};
  for (const [pid, appearances] of playerWaves) {
    if (appearances.length <= 1) { restByPlayer[pid] = 0; continue; }
    const sorted = [...appearances].sort((a, b) => a.wave - b.wave);
    let gaps = 0;
    for (let i = 1; i < sorted.length; i++) {
      gaps += sorted[i].wave - sorted[i - 1].wave;
    }
    restByPlayer[pid] = gaps / (sorted.length - 1);
  }

  return { courtCount: totalCourts, rounds: playRounds, restByPlayer };
}
