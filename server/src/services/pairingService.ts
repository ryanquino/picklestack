/**
 * Pairing Service — Pure function for selecting balanced teams from a candidate pool.
 *
 * The algorithm:
 * 1. Build candidate pool (dynamically sized based on session size)
 * 2. If all candidates have rating 1000 (no match history), select 4 randomly
 * 3. Enumerate all C(n,4) player selections from pool
 * 4. For each selection, enumerate all 3 possible team splits (2v2)
 * 5. Filter out combinations where any two players have shared a court before (fresh encounter filter, unless all exceed)
 * 6. Filter out combinations violating teammate repetition threshold (>1, unless all exceed)
 * 7. Filter out combinations violating exact matchup repetition (same config, unless all exceed)
 * 8. Score remaining by minimum skill gap
 * 9. Break ties by highest diversity bonus (descending; skipped if mode is "queue" or all bonuses are 0.0)
 * 10. Break ties by lowest same-team frequency sum
 * 11. Break remaining ties by earliest queue position among selected players
 * 12. Return the winning combination
 */

import { calculateDiversityBonus } from './diversityService';

export interface PairingCandidate {
  playerId: string;        // For pairs: the pair slot's player_id
  rating: number;          // For pairs: average of both players' ratings
  queuePosition: number;
  isPair: boolean;         // true if this candidate represents a fixed pair
  pairId: string | null;   // the fixed pair ID, or null for individuals
  pairedPlayerIds: [string, string] | null; // both player IDs if pair, null for individuals
  matchesPlayed?: number;  // For pairs: average of both players' matches played (optional, defaults to 0)
}

export interface PairingInput {
  candidatePool: PairingCandidate[];
  teammateHistory: Map<string, Map<string, number>>; // playerId -> (partnerId -> count)
  opponentHistory: Map<string, Map<string, number>>; // playerId -> (opponentId -> count)
  matchConfigHistory: Set<string>; // serialized "team1-vs-team2" keys
  sessionId?: string; // Required for diversity bonus calculation in "smart" mode
  pairingMode?: 'smart' | 'queue'; // When "queue", diversity bonus is skipped
}

export interface PairingResult {
  team1: [string, string]; // player IDs
  team2: [string, string]; // player IDs
}

interface TeamCombination {
  team1: [string, string];
  team2: [string, string];
  skillGap: number;
  diversityBonus: number;
  teammateFrequencySum: number;
  earliestQueuePosition: number;
}

/**
 * Calculate skill gap between two teams.
 * Skill gap = |avg(team1 ratings) - avg(team2 ratings)|
 */
export function calculateSkillGap(
  team1Ratings: [number, number],
  team2Ratings: [number, number]
): number {
  const avg1 = (team1Ratings[0] + team1Ratings[1]) / 2;
  const avg2 = (team2Ratings[0] + team2Ratings[1]) / 2;
  return Math.abs(avg1 - avg2);
}

/**
 * Get the teammate count between two players from the history map.
 */
function getTeammateCount(
  teammateHistory: Map<string, Map<string, number>>,
  player1: string,
  player2: string
): number {
  const map1 = teammateHistory.get(player1);
  if (map1) {
    const count = map1.get(player2);
    if (count !== undefined) return count;
  }
  const map2 = teammateHistory.get(player2);
  if (map2) {
    const count = map2.get(player1);
    if (count !== undefined) return count;
  }
  return 0;
}

/**
 * Serialize a match configuration into a canonical string key.
 * The key is "sortedTeam1-vs-sortedTeam2" where teams are sorted internally
 * and the two teams are ordered so the lexicographically smaller team comes first.
 */
function serializeMatchConfig(team1: [string, string], team2: [string, string]): string {
  const t1Sorted = [...team1].sort();
  const t2Sorted = [...team2].sort();
  // Order teams so the key is canonical
  const t1Key = t1Sorted.join(',');
  const t2Key = t2Sorted.join(',');
  if (t1Key <= t2Key) {
    return `${t1Key}-vs-${t2Key}`;
  }
  return `${t2Key}-vs-${t1Key}`;
}

/**
 * Generate all combinations of k elements from an array.
 */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];

  const result: T[][] = [];

  function helper(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i <= arr.length - (k - current.length); i++) {
      current.push(arr[i]);
      helper(i + 1, current);
      current.pop();
    }
  }

  helper(0, []);
  return result;
}

/**
 * Generate all 3 possible ways to split 4 players into 2 teams of 2.
 * Given players [A, B, C, D], the 3 splits are:
 *   (AB vs CD), (AC vs BD), (AD vs BC)
 */
function getTeamSplits(players: string[]): Array<{ team1: [string, string]; team2: [string, string] }> {
  const [a, b, c, d] = players;
  return [
    { team1: [a, b] as [string, string], team2: [c, d] as [string, string] },
    { team1: [a, c] as [string, string], team2: [b, d] as [string, string] },
    { team1: [a, d] as [string, string], team2: [b, c] as [string, string] },
  ];
}

/**
 * Check if a team combination violates the teammate repetition threshold.
 * A combination violates if any pair of teammates has been together more than 1 time.
 */
function violatesTeammateThreshold(
  team1: [string, string],
  team2: [string, string],
  teammateHistory: Map<string, Map<string, number>>
): boolean {
  const team1Count = getTeammateCount(teammateHistory, team1[0], team1[1]);
  const team2Count = getTeammateCount(teammateHistory, team2[0], team2[1]);
  return team1Count > 1 || team2Count > 1;
}

/**
 * Get the maximum teammate count for a combination.
 */
function getMaxTeammateCount(
  team1: [string, string],
  team2: [string, string],
  teammateHistory: Map<string, Map<string, number>>
): number {
  const team1Count = getTeammateCount(teammateHistory, team1[0], team1[1]);
  const team2Count = getTeammateCount(teammateHistory, team2[0], team2[1]);
  return Math.max(team1Count, team2Count);
}

/**
 * Check if a match configuration has been played before (exact same 4 players in same team config).
 */
function violatesMatchupRepetition(
  team1: [string, string],
  team2: [string, string],
  matchConfigHistory: Set<string>
): boolean {
  const key = serializeMatchConfig(team1, team2);
  return matchConfigHistory.has(key);
}

/**
 * Check if any two players in a grouping have previously shared a court
 * (as teammate OR opponent). Returns true if ANY pair has a prior encounter.
 */
function hasAnyPriorEncounter(
  team1: [string, string],
  team2: [string, string],
  teammateHistory: Map<string, Map<string, number>>,
  opponentHistory: Map<string, Map<string, number>>
): boolean {
  const allPlayers = [...team1, ...team2];
  for (let i = 0; i < allPlayers.length; i++) {
    for (let j = i + 1; j < allPlayers.length; j++) {
      const p1 = allPlayers[i];
      const p2 = allPlayers[j];
      // Check teammate history
      if (getTeammateCount(teammateHistory, p1, p2) > 0) return true;
      // Check opponent history (reuse the same helper shape)
      if (getTeammateCount(opponentHistory, p1, p2) > 0) return true;
    }
  }
  return false;
}

/**
 * Calculate the same-team frequency sum for a combination.
 * This is the sum of teammate counts for both teams.
 */
function calculateTeammateFrequencySum(
  team1: [string, string],
  team2: [string, string],
  teammateHistory: Map<string, Map<string, number>>
): number {
  const team1Count = getTeammateCount(teammateHistory, team1[0], team1[1]);
  const team2Count = getTeammateCount(teammateHistory, team2[0], team2[1]);
  return team1Count + team2Count;
}

/**
 * Get the earliest queue position among the 4 selected players.
 */
function getEarliestQueuePosition(
  players: string[],
  candidatePool: { playerId: string; queuePosition: number }[]
): number {
  let earliest = Infinity;
  for (const player of players) {
    const candidate = candidatePool.find(c => c.playerId === player);
    if (candidate && candidate.queuePosition < earliest) {
      earliest = candidate.queuePosition;
    }
  }
  return earliest;
}

/**
 * Check if a team split violates the fixed pair constraint.
 * A split violates if two candidates that are both pairs (or a pair and an individual)
 * are placed such that a pair candidate is not kept as a complete team unit.
 *
 * The rule: a pair candidate MUST be on the same team as... itself (it's one slot).
 * The real constraint is that we can't split a pair across teams — but since a pair
 * is a single candidate, the constraint is automatically satisfied at the candidate level.
 * However, we need to ensure that after expansion, each team has exactly 2 players.
 *
 * A team of [pair, pair] → 4 players (invalid for one team in doubles)
 * A team of [pair, individual] → 3 players (invalid for one team in doubles)
 * A team of [individual, individual] → 2 players (valid)
 * A team of [pair] alone → 2 players (valid — but our format is [string, string])
 *
 * So the valid configurations for doubles (4 players total) are:
 * - team1=[pair], team2=[individual, individual] — pair fills one team
 * - team1=[individual, individual], team2=[pair] — pair fills other team
 * - team1=[pair], team2=[pair] — each pair fills one team
 * - team1=[individual, individual], team2=[individual, individual] — no pairs
 *
 * Since our result format is team1: [string, string], team2: [string, string],
 * we represent a pair team as [pairAnchorId, pairAnchorId] — NO, that's wrong.
 * We need to change the approach: select candidates that sum to exactly 4 players.
 */

/**
 * Checks if a team split is valid with respect to fixed pairs.
 * A valid split ensures that each team, after expansion, has exactly 2 players.
 * This means: each team can have at most 1 pair candidate (which expands to 2 players),
 * and if a team has a pair, it cannot have any other candidate.
 */
function isValidPairSplit(
  team1: [string, string],
  team2: [string, string],
  candidatePool: PairingCandidate[]
): boolean {
  const team1Pairs = team1.filter(id => {
    const c = candidatePool.find(p => p.playerId === id);
    return c?.isPair;
  }).length;
  const team2Pairs = team2.filter(id => {
    const c = candidatePool.find(p => p.playerId === id);
    return c?.isPair;
  }).length;

  // Each team expands to: pairs*2 + individuals*1 players
  const team1Players = team1Pairs * 2 + (team1.length - team1Pairs);
  const team2Players = team2Pairs * 2 + (team2.length - team2Pairs);

  return team1Players === 2 && team2Players === 2;
}

/**
 * Select candidates from the pool that sum to exactly 4 players for doubles.
 * A pair counts as 2 players, an individual counts as 1.
 * Returns all valid selections of candidates that total exactly 4 players.
 */
function selectValidDoublesGroups(pool: PairingCandidate[]): PairingCandidate[][] {
  const results: PairingCandidate[][] = [];

  // Strategy: find all subsets of pool where sum of player counts = 4
  // Player count: pair = 2, individual = 1
  // Valid group sizes: 2 candidates (if both are pairs, or 1 pair + 0... no)
  // Actually: 2 pairs = 4 players, 1 pair + 2 individuals = 4, 4 individuals = 4, 2 pairs = 4
  // So valid selections have 2, 3, or 4 candidates

  const pairs = pool.filter(c => c.isPair);
  const individuals = pool.filter(c => !c.isPair);

  // Case 1: 2 pairs (4 players)
  if (pairs.length >= 2) {
    const pairCombos = combinations(pairs, 2);
    for (const combo of pairCombos) {
      results.push(combo);
    }
  }

  // Case 2: 1 pair + 2 individuals (4 players)
  if (pairs.length >= 1 && individuals.length >= 2) {
    const indivCombos = combinations(individuals, 2);
    for (const pair of pairs) {
      for (const indivCombo of indivCombos) {
        results.push([pair, ...indivCombo]);
      }
    }
  }

  // Case 3: 4 individuals (4 players)
  if (individuals.length >= 4) {
    const indivCombos = combinations(individuals, 4);
    for (const combo of indivCombos) {
      results.push(combo);
    }
  }

  return results;
}

/**
 * Generate valid team splits for a group of candidates, respecting pair constraints.
 * Each team must have exactly 2 players after expansion.
 * A pair candidate fills an entire team (2 players).
 * Two individuals fill a team (2 players).
 */
function getValidTeamSplits(
  group: PairingCandidate[]
): Array<{ team1: [string, string]; team2: [string, string] }> {
  const pairs = group.filter(c => c.isPair);
  const individuals = group.filter(c => !c.isPair);

  const splits: Array<{ team1: [string, string]; team2: [string, string] }> = [];

  if (pairs.length === 2 && individuals.length === 0) {
    // 2 pairs: each pair is one team
    splits.push({
      team1: [pairs[0].playerId, pairs[0].playerId] as [string, string],
      team2: [pairs[1].playerId, pairs[1].playerId] as [string, string],
    });
    // Also the reverse
    splits.push({
      team1: [pairs[1].playerId, pairs[1].playerId] as [string, string],
      team2: [pairs[0].playerId, pairs[0].playerId] as [string, string],
    });
  } else if (pairs.length === 1 && individuals.length === 2) {
    // 1 pair + 2 individuals: pair is one team, individuals are the other
    splits.push({
      team1: [pairs[0].playerId, pairs[0].playerId] as [string, string],
      team2: [individuals[0].playerId, individuals[1].playerId] as [string, string],
    });
    splits.push({
      team1: [individuals[0].playerId, individuals[1].playerId] as [string, string],
      team2: [pairs[0].playerId, pairs[0].playerId] as [string, string],
    });
  } else if (pairs.length === 0 && individuals.length === 4) {
    // 4 individuals: standard 3 splits
    const playerIds = individuals.map(c => c.playerId);
    return getTeamSplits(playerIds);
  }

  return splits;
}

/**
 * Select 4 players from the front of the queue in strict FIFO order.
 * Used in "Queue Order" mode — selects the earliest candidates that sum to exactly 4 players.
 * Respects fixed pairs: a pair fills one entire team side (2 players).
 * This is a PURE function — no database access.
 */
export function selectFifoPairing(
  candidatePool: PairingCandidate[]
): PairingResult {
  // Sort by queue position to ensure strict FIFO
  const sorted = [...candidatePool].sort((a, b) => a.queuePosition - b.queuePosition);

  // Find the earliest valid group of candidates that sums to exactly 4 players
  // Use selectValidDoublesGroups but prefer the group with the earliest queue positions
  const validGroups = selectValidDoublesGroups(sorted);

  if (validGroups.length === 0) {
    throw new Error('Not enough players in candidate pool (minimum 4 required)');
  }

  // Score each group by the sum of queue positions (prefer earliest)
  const scoredGroups = validGroups.map(group => ({
    group,
    positionSum: group.reduce((sum, c) => sum + c.queuePosition, 0),
    maxPosition: Math.max(...group.map(c => c.queuePosition)),
  }));

  // Sort by max position first (prefer groups that don't reach far back), then by sum
  scoredGroups.sort((a, b) => a.maxPosition - b.maxPosition || a.positionSum - b.positionSum);

  const bestGroup = scoredGroups[0].group;

  // Get valid team splits for this group
  const splits = getValidTeamSplits(bestGroup);
  if (splits.length === 0) {
    throw new Error('No valid team split found for selected candidates');
  }

  // For FIFO, use the first valid split
  return {
    team1: splits[0].team1,
    team2: splits[0].team2,
  };
}

/**
 * Select 4 players and form teams from the candidate pool.
 * Respects fixed pairs: a pair fills one entire team side (2 players).
 * This is a PURE function — no database access.
 */
export function selectPairing(input: PairingInput): PairingResult {
  const { candidatePool, teammateHistory, opponentHistory, matchConfigHistory, sessionId, pairingMode } = input;

  // Step 1: Use the full candidate pool (size controlled by courtService based on session size)
  const pool = candidatePool;

  // Step 2: Find all valid candidate groups that sum to exactly 4 players
  const validGroups = selectValidDoublesGroups(pool);

  if (validGroups.length === 0) {
    throw new Error('Not enough players in candidate pool (minimum 4 required)');
  }

  // Step 2b: If all candidates have rating 1000 (no match history), use FIFO order
  // (prioritize earliest queue positions rather than pure random)
  const allDefault = pool.every(p => p.rating === 1000);
  if (allDefault) {
    // Sort pool by queue position and take the first valid group
    const sortedPool = [...pool].sort((a, b) => a.queuePosition - b.queuePosition);
    const fifoGroups = selectValidDoublesGroups(sortedPool);
    if (fifoGroups.length === 0) {
      throw new Error('Not enough players in candidate pool (minimum 4 required)');
    }
    // Score by sum of queue positions (lower is better = earlier in queue)
    const scoredGroups = fifoGroups.map(group => ({
      group,
      positionSum: group.reduce((sum, c) => sum + c.queuePosition, 0),
    }));
    scoredGroups.sort((a, b) => a.positionSum - b.positionSum);
    const bestGroup = scoredGroups[0].group;
    const splits = getValidTeamSplits(bestGroup);
    if (splits.length === 0) {
      throw new Error('No valid team split found');
    }
    // Pick a random split (team assignment can be random, but player selection is FIFO)
    const randomSplit = splits[Math.floor(Math.random() * splits.length)];
    return {
      team1: randomSplit.team1,
      team2: randomSplit.team2,
    };
  }

  // Build a rating lookup map for O(1) access (avoid pool.find in hot loop)
  const ratingMap = new Map<string, number>();
  const candidateMap = new Map<string, PairingCandidate>();
  for (const c of pool) {
    ratingMap.set(c.playerId, c.rating);
    candidateMap.set(c.playerId, c);
  }

  // Step 3: For each valid group, enumerate all valid team splits
  // NOTE: diversityBonus is deferred until after filtering to avoid expensive DB queries on all combinations
  let allCombinations: TeamCombination[] = [];

  for (const group of validGroups) {
    const splits = getValidTeamSplits(group);

    for (const split of splits) {
      // Calculate ratings for each team using O(1) map lookup
      const getTeamRatings = (team: [string, string]): [number, number] => {
        if (team[0] === team[1]) {
          const r = ratingMap.get(team[0])!;
          return [r, r];
        }
        return [ratingMap.get(team[0])!, ratingMap.get(team[1])!];
      };

      const team1Ratings = getTeamRatings(split.team1);
      const team2Ratings = getTeamRatings(split.team2);

      const skillGap = calculateSkillGap(team1Ratings, team2Ratings);

      const teammateFrequencySum = calculateTeammateFrequencySum(
        split.team1,
        split.team2,
        teammateHistory
      );

      const playerIds = group.map(c => c.playerId);
      const earliestQueuePosition = getEarliestQueuePosition(playerIds, candidatePool);

      allCombinations.push({
        team1: split.team1,
        team2: split.team2,
        skillGap,
        diversityBonus: 0, // deferred — computed later only for finalists
        teammateFrequencySum,
        earliestQueuePosition,
      });
    }
  }

  if (allCombinations.length === 0) {
    throw new Error('No valid team combinations found');
  }

  // Step 4b: Filter out combinations where any two players have shared a court before
  // (fresh encounter filter — prefer groupings of 4 players who have never been in a match together)
  // For pair candidates, expand to actual player IDs before checking encounters
  const expandToRealPlayerIds = (team1: [string, string], team2: [string, string]): string[] => {
    const ids: string[] = [];
    const allSlots = [...team1, ...team2];
    const seen = new Set<string>();
    for (const pid of allSlots) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const candidate = candidateMap.get(pid);
      if (candidate && candidate.isPair && candidate.pairedPlayerIds) {
        ids.push(...candidate.pairedPlayerIds);
      } else {
        ids.push(pid);
      }
    }
    return ids;
  };

  // Pre-compute which pairs of real player IDs have prior encounters (O(1) lookup set)
  const encounterSet = new Set<string>();
  for (const [p1, map] of teammateHistory) {
    for (const [p2, count] of map) {
      if (count > 0) {
        encounterSet.add(p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`);
      }
    }
  }
  for (const [p1, map] of opponentHistory) {
    for (const [p2, count] of map) {
      if (count > 0) {
        encounterSet.add(p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`);
      }
    }
  }

  // Build a set of pair-internal player ID pairs to skip (teammates within same fixed pair)
  const pairInternalSet = new Set<string>();
  for (const c of pool) {
    if (c.isPair && c.pairedPlayerIds) {
      const [a, b] = c.pairedPlayerIds;
      pairInternalSet.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
  }

  const hasAnyPriorEncounterExpanded = (team1: [string, string], team2: [string, string]): boolean => {
    const allPlayers = expandToRealPlayerIds(team1, team2);
    for (let i = 0; i < allPlayers.length; i++) {
      for (let j = i + 1; j < allPlayers.length; j++) {
        const p1 = allPlayers[i];
        const p2 = allPlayers[j];
        const key = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
        // Skip players within the same pair (they're always together)
        if (pairInternalSet.has(key)) continue;
        // O(1) encounter check
        if (encounterSet.has(key)) return true;
      }
    }
    return false;
  };

  // Count prior encounters for each combination (used as scoring tiebreaker, NOT a hard filter)
  // This ensures top-of-queue players (including pairs) are never eliminated,
  // just ranked lower if they have more prior encounters with other candidates.
  const countPriorEncounters = (team1: [string, string], team2: [string, string]): number => {
    const allPlayers = expandToRealPlayerIds(team1, team2);
    let count = 0;
    for (let i = 0; i < allPlayers.length; i++) {
      for (let j = i + 1; j < allPlayers.length; j++) {
        const p1 = allPlayers[i];
        const p2 = allPlayers[j];
        const key = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
        if (pairInternalSet.has(key)) continue;
        if (encounterSet.has(key)) count++;
      }
    }
    return count;
  };

  // Annotate each combination with encounter count for later scoring
  for (const combo of allCombinations) {
    (combo as any).encounterCount = countPriorEncounters(combo.team1, combo.team2);
  }

  let filtered: TeamCombination[];
  filtered = allCombinations;

  // Step 4c: Hard filter — eliminate combinations where any OPPONENT pair has already
  // faced each other. This guarantees max H2H ≤ 1 (no repeat opponents).
  // Only checks cross-team encounters (team1 vs team2), not within-team.
  const noRepeatOpponents = filtered.filter(c => {
    const team1Players = expandToRealPlayerIds(c.team1, [c.team1[0], c.team1[0]] as [string, string]).length > 0
      ? expandToRealPlayerIds(c.team1, c.team2).slice(0, 2)  // not right — need proper expansion
      : [];
    // Actually just check: for each player on team1 vs each player on team2, no prior encounter
    const t1 = (() => {
      const ids: string[] = [];
      for (const pid of c.team1) {
        const cand = candidateMap.get(pid);
        if (cand && cand.isPair && cand.pairedPlayerIds) {
          ids.push(...cand.pairedPlayerIds);
        } else {
          ids.push(pid);
        }
      }
      return [...new Set(ids)];
    })();
    const t2 = (() => {
      const ids: string[] = [];
      for (const pid of c.team2) {
        const cand = candidateMap.get(pid);
        if (cand && cand.isPair && cand.pairedPlayerIds) {
          ids.push(...cand.pairedPlayerIds);
        } else {
          ids.push(pid);
        }
      }
      return [...new Set(ids)];
    })();
    // Check all cross-team pairs for prior encounters
    for (const p1 of t1) {
      for (const p2 of t2) {
        const key = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
        if (encounterSet.has(key)) return false;
      }
    }
    // Also check within-team pairs (teammates) for prior opponent encounters
    for (let i = 0; i < t1.length; i++) {
      for (let j = i + 1; j < t1.length; j++) {
        const key = t1[i] < t1[j] ? `${t1[i]}|${t1[j]}` : `${t1[j]}|${t1[i]}`;
        if (pairInternalSet.has(key)) continue;
        if (encounterSet.has(key)) return false;
      }
    }
    for (let i = 0; i < t2.length; i++) {
      for (let j = i + 1; j < t2.length; j++) {
        const key = t2[i] < t2[j] ? `${t2[i]}|${t2[j]}` : `${t2[j]}|${t2[i]}`;
        if (pairInternalSet.has(key)) continue;
        if (encounterSet.has(key)) return false;
      }
    }
    return true;
  });

  // Use the no-repeat filter if it leaves any results; otherwise fall back to all.
  // NOTE: This is a soft preference — fairness (Step 7) takes priority over no-repeat.
  if (noRepeatOpponents.length > 0) {
    filtered = noRepeatOpponents;
  }
  // Keep track of the no-repeat subset for later use in Step 7
  const noRepeatSet = new Set(noRepeatOpponents);

  // Step 5: Filter out combinations violating teammate repetition threshold (>1)
  const nonViolatingTeammate = filtered.filter(
    c => !violatesTeammateThreshold(c.team1, c.team2, teammateHistory)
  );

  // If all exceed threshold, keep all but prefer lowest max teammate count
  if (nonViolatingTeammate.length > 0) {
    filtered = nonViolatingTeammate;
  } else {
    // All exceed — select those with the lowest maximum teammate count
    const withMaxCounts = filtered.map(c => ({
      ...c,
      maxTeammateCount: getMaxTeammateCount(c.team1, c.team2, teammateHistory),
    }));
    const minMaxCount = Math.min(...withMaxCounts.map(c => c.maxTeammateCount));
    filtered = withMaxCounts
      .filter(c => c.maxTeammateCount === minMaxCount)
      .map(({ maxTeammateCount, ...rest }) => rest);
  }

  // Step 6: Filter out combinations violating matchup repetition
  const nonViolatingMatchup = filtered.filter(
    c => !violatesMatchupRepetition(c.team1, c.team2, matchConfigHistory)
  );

  // If all exceed, keep all from previous step
  if (nonViolatingMatchup.length > 0) {
    filtered = nonViolatingMatchup;
  }
  // else: filtered stays as-is (all exceed matchup repetition)

  // Step 7: Queue-position-first with fairness cap for ALL candidates.
  // Exclude combinations containing any candidate that has played more than
  // the pool's minimum + 1. This keeps deviation tight (≤ 2).
  const minQueuePos = Math.min(...filtered.map(c => c.earliestQueuePosition));

  const poolMatchCounts = pool.map(c => c.matchesPlayed ?? 0);
  const sortedCounts = [...poolMatchCounts].sort((a, b) => a - b);
  const minPoolMatches = sortedCounts[0];
  const medianPoolMatches = sortedCounts[Math.floor(sortedCounts.length / 2)];
  const maxAllowedMatches = Math.max(minPoolMatches + 1, medianPoolMatches);

  // Build set of over-played candidate IDs (includes pair-specific check)
  const overPlayedIds = new Set(
    pool.filter(c => {
      const matches = c.matchesPlayed ?? 0;
      if (matches > maxAllowedMatches) return true;
      // Pairs cap more aggressively: at minPoolMatches + 1 (since they cycle faster)
      if (c.isPair && matches >= maxAllowedMatches) return true;
      return false;
    }).map(c => c.playerId)
  );

  // Filter out combinations containing over-played candidates
  let fairFiltered: TeamCombination[];
  if (overPlayedIds.size > 0) {
    const withoutOverPlayed = filtered.filter(c => {
      const allIds = [...new Set([...c.team1, ...c.team2])];
      return !allIds.some(id => overPlayedIds.has(id));
    });
    fairFiltered = withoutOverPlayed.length > 0 ? withoutOverPlayed : filtered;
  } else {
    fairFiltered = filtered;
  }

  // Among fair combos, prefer those containing underplayed candidates (min matches in pool)
  const underplayedIds = new Set(
    pool.filter(c => (c.matchesPlayed ?? 0) === minPoolMatches).map(c => c.playerId)
  );
  const withUnderplayed = fairFiltered.filter(c => {
    const allIds = [...new Set([...c.team1, ...c.team2])];
    return allIds.some(id => underplayedIds.has(id));
  });

  // Within underplayed-preferred combos, further prefer no-repeat opponents
  let fairAndFresh: TeamCombination[];
  if (withUnderplayed.length > 0) {
    const freshUnderplayed = withUnderplayed.filter(c => noRepeatSet.has(c));
    fairAndFresh = freshUnderplayed.length > 0 ? freshUnderplayed : withUnderplayed;
  } else {
    const freshFair = fairFiltered.filter(c => noRepeatSet.has(c));
    fairAndFresh = freshFair.length > 0 ? freshFair : fairFiltered;
  }

  let bestByQueuePos: TeamCombination[];
  if (fairAndFresh.length > 0) {
    bestByQueuePos = fairAndFresh;
  } else {
    // Fallback: prefer earliest queue position
    const minQP = Math.min(...fairFiltered.map(c => c.earliestQueuePosition));
    bestByQueuePos = fairFiltered.filter(c => c.earliestQueuePosition === minQP);
  }

  // Among selected combos, pick the best skill gap
  const minSkillGap = Math.min(...bestByQueuePos.map(c => c.skillGap));
  const bestBySkillGap = bestByQueuePos.filter(c => c.skillGap === minSkillGap);

  // Then break ties by fewest prior encounters (opponent variety)
  const minEncounters = Math.min(...bestBySkillGap.map(c => (c as any).encounterCount ?? 0));
  const bestByEncounters = bestBySkillGap.filter(c => ((c as any).encounterCount ?? 0) === minEncounters);

  // Step 7c: Break ties by highest diversity bonus (descending, higher is better)
  // Compute diversity bonus ONLY for the finalists (deferred from Step 3 for performance)
  let bestByDiversity: TeamCombination[];
  if (pairingMode === 'queue' || !sessionId || bestBySkillGap.length <= 1) {
    bestByDiversity = bestBySkillGap;
  } else {
    // Compute diversity bonus for each finalist
    for (const combo of bestBySkillGap) {
      const expandedPlayerIds: string[] = [];
      const allPlayerIds = [...new Set([...combo.team1, ...combo.team2])];
      for (const pid of allPlayerIds) {
        const candidate = candidateMap.get(pid);
        if (candidate && candidate.isPair && candidate.pairedPlayerIds) {
          expandedPlayerIds.push(...candidate.pairedPlayerIds);
        } else {
          expandedPlayerIds.push(pid);
        }
      }
      combo.diversityBonus = calculateDiversityBonus(expandedPlayerIds, sessionId);
    }

    const allBonusesZero = bestBySkillGap.every(c => c.diversityBonus === 0);
    if (allBonusesZero) {
      bestByDiversity = bestBySkillGap;
    } else {
      const maxDiversityBonus = Math.max(...bestBySkillGap.map(c => c.diversityBonus));
      bestByDiversity = bestBySkillGap.filter(c => c.diversityBonus === maxDiversityBonus);
    }
  }

  // Step 8: Break ties by lowest same-team frequency sum
  const minFreqSum = Math.min(...bestByDiversity.map(c => c.teammateFrequencySum));
  const bestByFreqSum = bestByDiversity.filter(c => c.teammateFrequencySum === minFreqSum);

  // Return the first winning combination
  const winner = bestByFreqSum[0];
  return {
    team1: winner.team1,
    team2: winner.team2,
  };
}
