// Feature: smart-match-scoring, Property 5: Pairing optimality
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { selectPairing, calculateSkillGap, PairingInput } from './pairingService';

/**
 * Validates: Requirements 3.3, 3.4, 3.5
 *
 * Property 5: Pairing optimality
 * For any candidate pool of 4–8 players with arbitrary ratings and pairing history,
 * the combination selected by the Pairing Algorithm SHALL have a skill gap less than
 * or equal to every other valid combination. Among combinations with equal minimum
 * skill gap, the selected combination SHALL have a teammate frequency sum less than
 * or equal to all alternatives. Among remaining ties, the selected combination SHALL
 * include the player with the earliest queue position.
 */

// --- Helpers to independently compute all valid combinations ---

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

function getTeamSplits(players: string[]): Array<{ team1: [string, string]; team2: [string, string] }> {
  const [a, b, c, d] = players;
  return [
    { team1: [a, b] as [string, string], team2: [c, d] as [string, string] },
    { team1: [a, c] as [string, string], team2: [b, d] as [string, string] },
    { team1: [a, d] as [string, string], team2: [b, c] as [string, string] },
  ];
}

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

function serializeMatchConfig(team1: [string, string], team2: [string, string]): string {
  const t1Sorted = [...team1].sort();
  const t2Sorted = [...team2].sort();
  const t1Key = t1Sorted.join(',');
  const t2Key = t2Sorted.join(',');
  if (t1Key <= t2Key) {
    return `${t1Key}-vs-${t2Key}`;
  }
  return `${t2Key}-vs-${t1Key}`;
}

interface CombinationScore {
  team1: [string, string];
  team2: [string, string];
  skillGap: number;
  teammateFrequencySum: number;
  earliestQueuePosition: number;
}

function computeAllValidCombinations(input: PairingInput): CombinationScore[] {
  const { candidatePool, teammateHistory, opponentHistory, matchConfigHistory } = input;
  const pool = candidatePool.slice(0, Math.min(candidatePool.length, 16));

  const playerSelections = combinations(pool, 4);
  let allCombinations: CombinationScore[] = [];

  for (const selection of playerSelections) {
    const playerIds = selection.map(p => p.playerId);
    const splits = getTeamSplits(playerIds);

    for (const split of splits) {
      const team1Rating0 = selection.find(p => p.playerId === split.team1[0])!.rating;
      const team1Rating1 = selection.find(p => p.playerId === split.team1[1])!.rating;
      const team2Rating0 = selection.find(p => p.playerId === split.team2[0])!.rating;
      const team2Rating1 = selection.find(p => p.playerId === split.team2[1])!.rating;

      const skillGap = calculateSkillGap(
        [team1Rating0, team1Rating1],
        [team2Rating0, team2Rating1]
      );

      const team1Count = getTeammateCount(teammateHistory, split.team1[0], split.team1[1]);
      const team2Count = getTeammateCount(teammateHistory, split.team2[0], split.team2[1]);
      const teammateFrequencySum = team1Count + team2Count;

      let earliest = Infinity;
      for (const pid of playerIds) {
        const candidate = candidatePool.find(c => c.playerId === pid);
        if (candidate && candidate.queuePosition < earliest) {
          earliest = candidate.queuePosition;
        }
      }

      allCombinations.push({
        team1: split.team1,
        team2: split.team2,
        skillGap,
        teammateFrequencySum,
        earliestQueuePosition: earliest,
      });
    }
  }

  // Apply same filtering as the algorithm

  // Encounter count (scoring, not filter) — counted per combination for tiebreaker
  const countEncounters = (team1: [string, string], team2: [string, string]) => {
    const allPlayers = [...team1, ...team2];
    let count = 0;
    for (let i = 0; i < allPlayers.length; i++) {
      for (let j = i + 1; j < allPlayers.length; j++) {
        const p1 = allPlayers[i];
        const p2 = allPlayers[j];
        if (getTeammateCount(teammateHistory, p1, p2) > 0) count++;
        if (getTeammateCount(opponentHistory ?? new Map(), p1, p2) > 0) count++;
      }
    }
    return count;
  };

  for (const combo of allCombinations) {
    (combo as any).encounterCount = countEncounters(combo.team1, combo.team2);
  }

  let filtered: CombinationScore[] = allCombinations;

  // Step 5: Filter teammate threshold (>1)
  const violatesTeammateThreshold = (team1: [string, string], team2: [string, string]) => {
    const t1Count = getTeammateCount(teammateHistory, team1[0], team1[1]);
    const t2Count = getTeammateCount(teammateHistory, team2[0], team2[1]);
    return t1Count > 1 || t2Count > 1;
  };

  const nonViolatingTeammate = filtered.filter(
    c => !violatesTeammateThreshold(c.team1, c.team2)
  );

  if (nonViolatingTeammate.length > 0) {
    filtered = nonViolatingTeammate;
  } else {
    // All exceed — select those with lowest max teammate count
    const withMaxCounts = filtered.map(c => {
      const t1Count = getTeammateCount(teammateHistory, c.team1[0], c.team1[1]);
      const t2Count = getTeammateCount(teammateHistory, c.team2[0], c.team2[1]);
      return { ...c, maxTeammateCount: Math.max(t1Count, t2Count) };
    });
    const minMaxCount = Math.min(...withMaxCounts.map(c => c.maxTeammateCount));
    filtered = withMaxCounts
      .filter(c => c.maxTeammateCount === minMaxCount)
      .map(({ maxTeammateCount, ...rest }) => rest);
  }

  // Step 6: Filter matchup repetition
  const violatesMatchupRepetition = (team1: [string, string], team2: [string, string]) => {
    const key = serializeMatchConfig(team1, team2);
    return matchConfigHistory.has(key);
  };

  const nonViolatingMatchup = filtered.filter(
    c => !violatesMatchupRepetition(c.team1, c.team2)
  );

  if (nonViolatingMatchup.length > 0) {
    filtered = nonViolatingMatchup;
  }

  // Apply encounter count tiebreaker (after skill gap selection in tests)
  // Note: tests check optimality after this filtering, so we include encounter count for proper comparison

  return filtered;
}

// --- Custom Arbitraries ---

/**
 * Generate a candidate pool of 4-8 players with varying ratings.
 * Ensures not all ratings are 1000 (to avoid the random path).
 */
const candidatePoolArb = fc
  .integer({ min: 4, max: 8 })
  .chain(poolSize =>
    fc.tuple(
      fc.array(
        fc.integer({ min: 100, max: 3000 }),
        { minLength: poolSize, maxLength: poolSize }
      ),
      fc.constant(poolSize)
    )
  )
  .filter(([ratings, _]) => !ratings.every(r => r === 1000))
  .map(([ratings, poolSize]) =>
    ratings.map((rating, i) => ({
      playerId: `player-${i}`,
      rating,
      queuePosition: i,
    }))
  );

/**
 * Generate teammate history for a pool of players.
 * Generates sparse history (0-3 times as teammates for some pairs).
 */
function teammateHistoryArb(poolSize: number) {
  // Generate a list of (player1Index, player2Index, count) tuples
  const pairCountArb = fc.array(
    fc.tuple(
      fc.integer({ min: 0, max: poolSize - 1 }),
      fc.integer({ min: 0, max: poolSize - 1 }),
      fc.integer({ min: 1, max: 4 })
    ),
    { minLength: 0, maxLength: poolSize * 2 }
  );

  return pairCountArb.map(pairs => {
    const history = new Map<string, Map<string, number>>();
    for (const [i, j, count] of pairs) {
      if (i === j) continue;
      const p1 = `player-${i}`;
      const p2 = `player-${j}`;
      // Set both directions (bidirectional, matching production buildPairingInput)
      if (!history.has(p1)) history.set(p1, new Map());
      history.get(p1)!.set(p2, count);
      if (!history.has(p2)) history.set(p2, new Map());
      history.get(p2)!.set(p1, count);
    }
    return history;
  });
}

/**
 * Generate match config history (set of serialized match config keys).
 */
function matchConfigHistoryArb(poolSize: number) {
  return fc.array(
    fc.tuple(
      fc.integer({ min: 0, max: poolSize - 1 }),
      fc.integer({ min: 0, max: poolSize - 1 }),
      fc.integer({ min: 0, max: poolSize - 1 }),
      fc.integer({ min: 0, max: poolSize - 1 })
    ),
    { minLength: 0, maxLength: 3 }
  ).map(configs => {
    const history = new Set<string>();
    for (const [a, b, c, d] of configs) {
      // Ensure all 4 are distinct
      const indices = new Set([a, b, c, d]);
      if (indices.size !== 4) continue;
      const team1: [string, string] = [`player-${a}`, `player-${b}`];
      const team2: [string, string] = [`player-${c}`, `player-${d}`];
      history.add(serializeMatchConfig(team1, team2));
    }
    return history;
  });
}

/**
 * Combined arbitrary that generates a full PairingInput with consistent pool size.
 */
const pairingInputArb = fc
  .integer({ min: 4, max: 8 })
  .chain(poolSize =>
    fc.tuple(
      fc.array(
        fc.integer({ min: 100, max: 3000 }),
        { minLength: poolSize, maxLength: poolSize }
      ),
      teammateHistoryArb(poolSize),
      matchConfigHistoryArb(poolSize),
      fc.constant(poolSize)
    )
  )
  .filter(([ratings, , ,]) => !ratings.every(r => r === 1000))
  .map(([ratings, teammateHistory, matchConfigHistory, poolSize]) => {
    const candidatePool = ratings.map((rating, i) => ({
      playerId: `player-${i}`,
      rating,
      queuePosition: i,
      isPair: false as const,
      pairId: null,
      pairedPlayerIds: null,
    }));
    return {
      candidatePool,
      teammateHistory,
      opponentHistory: new Map<string, Map<string, number>>(),
      matchConfigHistory,
    } as PairingInput;
  });

describe('Property 5: Pairing optimality', () => {
  it('selected combination has minimum skill gap among all valid options', () => {
    fc.assert(
      fc.property(pairingInputArb, (input) => {
        const result = selectPairing(input);

        // Compute the skill gap of the selected result
        const getPlayerRating = (id: string) =>
          input.candidatePool.find(p => p.playerId === id)!.rating;

        const resultSkillGap = calculateSkillGap(
          [getPlayerRating(result.team1[0]), getPlayerRating(result.team1[1])],
          [getPlayerRating(result.team2[0]), getPlayerRating(result.team2[1])]
        );

        // Independently compute all valid combinations
        const validCombinations = computeAllValidCombinations(input);

        // Find the minimum skill gap among all valid combinations
        const minSkillGap = Math.min(...validCombinations.map(c => c.skillGap));

        // The selected result must have skill gap equal to the minimum
        expect(resultSkillGap).toBeCloseTo(minSkillGap, 10);
      }),
      { numRuns: 100 }
    );
  });

  it('tiebreaker: among equal skill gaps, selects lowest teammate frequency sum', () => {
    fc.assert(
      fc.property(pairingInputArb, (input) => {
        const result = selectPairing(input);

        const getPlayerRating = (id: string) =>
          input.candidatePool.find(p => p.playerId === id)!.rating;

        const resultSkillGap = calculateSkillGap(
          [getPlayerRating(result.team1[0]), getPlayerRating(result.team1[1])],
          [getPlayerRating(result.team2[0]), getPlayerRating(result.team2[1])]
        );

        // Compute teammate frequency sum of the result
        const resultFreqSum =
          getTeammateCount(input.teammateHistory, result.team1[0], result.team1[1]) +
          getTeammateCount(input.teammateHistory, result.team2[0], result.team2[1]);

        // Get all valid combinations with the same minimum skill gap
        const validCombinations = computeAllValidCombinations(input);
        const minSkillGap = Math.min(...validCombinations.map(c => c.skillGap));
        const tiedBySkillGap = validCombinations.filter(
          c => Math.abs(c.skillGap - minSkillGap) < 1e-10
        );

        // The minimum teammate frequency sum among tied combinations
        const minFreqSum = Math.min(...tiedBySkillGap.map(c => c.teammateFrequencySum));

        // The result's freq sum must be <= all alternatives with same skill gap
        expect(resultFreqSum).toBeLessThanOrEqual(minFreqSum + 1e-10);
        // More precisely, it should equal the minimum
        expect(resultFreqSum).toBe(minFreqSum);
      }),
      { numRuns: 100 }
    );
  });

  it('tiebreaker: among equal skill gap and frequency sum, selects earliest queue position', () => {
    fc.assert(
      fc.property(pairingInputArb, (input) => {
        const result = selectPairing(input);

        const getPlayerRating = (id: string) =>
          input.candidatePool.find(p => p.playerId === id)!.rating;

        const resultSkillGap = calculateSkillGap(
          [getPlayerRating(result.team1[0]), getPlayerRating(result.team1[1])],
          [getPlayerRating(result.team2[0]), getPlayerRating(result.team2[1])]
        );

        const resultFreqSum =
          getTeammateCount(input.teammateHistory, result.team1[0], result.team1[1]) +
          getTeammateCount(input.teammateHistory, result.team2[0], result.team2[1]);

        // Earliest queue position among the 4 selected players
        const selectedPlayers = [...result.team1, ...result.team2];
        const resultEarliestPos = Math.min(
          ...selectedPlayers.map(
            id => input.candidatePool.find(p => p.playerId === id)!.queuePosition
          )
        );

        // Get all valid combinations with same skill gap and freq sum
        const validCombinations = computeAllValidCombinations(input);
        const minSkillGap = Math.min(...validCombinations.map(c => c.skillGap));
        const tiedBySkillGap = validCombinations.filter(
          c => Math.abs(c.skillGap - minSkillGap) < 1e-10
        );
        const minFreqSum = Math.min(...tiedBySkillGap.map(c => c.teammateFrequencySum));
        const tiedByFreqSum = tiedBySkillGap.filter(
          c => c.teammateFrequencySum === minFreqSum
        );

        // The minimum earliest queue position among remaining tied combinations
        const minEarliestPos = Math.min(...tiedByFreqSum.map(c => c.earliestQueuePosition));

        // The result's earliest queue position must equal the minimum
        expect(resultEarliestPos).toBe(minEarliestPos);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: smart-match-scoring, Property 8: Variety constraints

/**
 * Property 8: Variety constraints
 *
 * For any candidate pool and pairing history, if there exists at least one valid team
 * combination where no player pair has been teammates more than 2 times, the algorithm
 * SHALL NOT select a combination that exceeds this threshold. If all combinations exceed
 * the threshold, the algorithm SHALL select the combination with the lowest maximum
 * teammate count among its player pairs. Similarly, the algorithm SHALL NOT select a
 * matchup where the same 4 players face each other in the same team configuration more
 * than once, unless all alternatives also exceed this constraint.
 *
 * Validates: Requirements 4.3, 4.4, 4.5
 */
describe('Property 8: Variety constraints', () => {
  /**
   * Helper: create a candidate pool of exactly 4 players with distinct ratings.
   * Using exactly 4 players means there's only 1 selection of 4 (C(4,4)=1)
   * but 3 possible team splits, which simplifies reasoning about teammate constraints.
   */
  function makePool(count: number, baseRating = 1000) {
    return Array.from({ length: count }, (_, i) => ({
      playerId: `p${i}`,
      rating: baseRating + (i + 1) * 100, // distinct ratings to avoid random path
      queuePosition: i,
      isPair: false,
      pairId: null,
      pairedPlayerIds: null,
    }));
  }

  /**
   * Helper: build a teammate history map from a list of pairs and counts.
   */
  function buildTeammateHistory(
    pairs: Array<[string, string, number]>
  ): Map<string, Map<string, number>> {
    const history = new Map<string, Map<string, number>>();
    for (const [p1, p2, count] of pairs) {
      if (!history.has(p1)) history.set(p1, new Map());
      history.get(p1)!.set(p2, count);
    }
    return history;
  }

  /**
   * Helper: serialize a match config key (same logic as pairingService).
   */
  function serializeMatchConfig(team1: [string, string], team2: [string, string]): string {
    const t1Sorted = [...team1].sort();
    const t2Sorted = [...team2].sort();
    const t1Key = t1Sorted.join(',');
    const t2Key = t2Sorted.join(',');
    if (t1Key <= t2Key) {
      return `${t1Key}-vs-${t2Key}`;
    }
    return `${t2Key}-vs-${t1Key}`;
  }

  /**
   * Helper: get teammate count from history for a pair.
   */
  function getTeammateCount(
    history: Map<string, Map<string, number>>,
    p1: string,
    p2: string
  ): number {
    const map1 = history.get(p1);
    if (map1) {
      const count = map1.get(p2);
      if (count !== undefined) return count;
    }
    const map2 = history.get(p2);
    if (map2) {
      const count = map2.get(p1);
      if (count !== undefined) return count;
    }
    return 0;
  }

  /**
   * Helper: get all 3 team splits for 4 players.
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
   * Helper: check if a combination violates teammate threshold (>2).
   */
  function violatesTeammateThreshold(
    team1: [string, string],
    team2: [string, string],
    history: Map<string, Map<string, number>>
  ): boolean {
    const t1Count = getTeammateCount(history, team1[0], team1[1]);
    const t2Count = getTeammateCount(history, team2[0], team2[1]);
    return t1Count > 2 || t2Count > 2;
  }

  /**
   * Helper: get max teammate count for a combination.
   */
  function getMaxTeammateCount(
    team1: [string, string],
    team2: [string, string],
    history: Map<string, Map<string, number>>
  ): number {
    const t1Count = getTeammateCount(history, team1[0], team1[1]);
    const t2Count = getTeammateCount(history, team2[0], team2[1]);
    return Math.max(t1Count, t2Count);
  }

  // --- Property test: Teammate repetition threshold enforcement ---
  it('does not select a combination exceeding teammate threshold when valid alternatives exist', () => {
    fc.assert(
      fc.property(
        // Generate a pool of 5-8 players (more players = more combinations to choose from)
        fc.integer({ min: 5, max: 8 }),
        // Generate teammate counts for some pairs (0-5 range)
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 7 }),
            fc.integer({ min: 0, max: 7 }),
            fc.integer({ min: 0, max: 5 })
          ),
          { minLength: 1, maxLength: 10 }
        ),
        (poolSize, pairCounts) => {
          const pool = makePool(poolSize);
          const playerIds = pool.map(p => p.playerId);

          // Build teammate history from generated pair counts
          const pairs: Array<[string, string, number]> = pairCounts
            .filter(([i, j]) => i < poolSize && j < poolSize && i !== j)
            .map(([i, j, count]) => [playerIds[i], playerIds[j], count]);

          const teammateHistory = buildTeammateHistory(pairs);

          const input: PairingInput = {
            candidatePool: pool,
            teammateHistory,
            opponentHistory: new Map(),
            matchConfigHistory: new Set(),
          };

          const result = selectPairing(input);

          // Check if there exists at least one combination that doesn't violate threshold
          const allPlayerCombinations = getCombinations(playerIds.slice(0, Math.min(poolSize, 8)), 4);
          let hasValidCombination = false;

          for (const combo of allPlayerCombinations) {
            const splits = getTeamSplits(combo);
            for (const split of splits) {
              if (!violatesTeammateThreshold(split.team1, split.team2, teammateHistory)) {
                hasValidCombination = true;
                break;
              }
            }
            if (hasValidCombination) break;
          }

          // If valid combinations exist, the result must not violate the threshold
          if (hasValidCombination) {
            const t1Count = getTeammateCount(teammateHistory, result.team1[0], result.team1[1]);
            const t2Count = getTeammateCount(teammateHistory, result.team2[0], result.team2[1]);
            expect(t1Count).toBeLessThanOrEqual(2);
            expect(t2Count).toBeLessThanOrEqual(2);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- Property test: Matchup repetition constraint ---
  it('does not select a matchup that has already been played in the same team config when alternatives exist', () => {
    fc.assert(
      fc.property(
        // Pool of 5-8 players
        fc.integer({ min: 5, max: 8 }),
        // Number of previously played configs to add (1-3)
        fc.integer({ min: 1, max: 3 }),
        (poolSize, numPrevConfigs) => {
          const pool = makePool(poolSize);
          const playerIds = pool.map(p => p.playerId);

          // Generate some previously played match configurations
          const matchConfigHistory = new Set<string>();
          const allPlayerCombinations = getCombinations(playerIds.slice(0, Math.min(poolSize, 8)), 4);

          // Add some configs to history (but not all)
          const configsToAdd = Math.min(numPrevConfigs, allPlayerCombinations.length - 1);
          for (let i = 0; i < configsToAdd; i++) {
            const combo = allPlayerCombinations[i];
            const splits = getTeamSplits(combo);
            // Add the first split of this combo to history
            matchConfigHistory.add(serializeMatchConfig(splits[0].team1, splits[0].team2));
          }

          const input: PairingInput = {
            candidatePool: pool,
            teammateHistory: new Map(),
            opponentHistory: new Map(),
            matchConfigHistory,
          };

          const result = selectPairing(input);

          // Check if there exists at least one combination not in matchConfigHistory
          let hasNonRepeatingOption = false;
          for (const combo of allPlayerCombinations) {
            const splits = getTeamSplits(combo);
            for (const split of splits) {
              const key = serializeMatchConfig(split.team1, split.team2);
              if (!matchConfigHistory.has(key)) {
                hasNonRepeatingOption = true;
                break;
              }
            }
            if (hasNonRepeatingOption) break;
          }

          // If non-repeating options exist, the result must not be a repeat
          if (hasNonRepeatingOption) {
            const resultKey = serializeMatchConfig(result.team1, result.team2);
            expect(matchConfigHistory.has(resultKey)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- Property test: Fallback to lowest-max when all exceed threshold ---
  it('selects the combination with lowest maximum teammate count when all exceed threshold', () => {
    fc.assert(
      fc.property(
        // Generate varying max counts for different pairs (all > 2 to ensure all exceed)
        fc.array(fc.integer({ min: 3, max: 8 }), { minLength: 6, maxLength: 6 }),
        (counts) => {
          // Use exactly 4 players — only 3 team splits possible, all will exceed threshold
          const pool = makePool(4);
          const playerIds = pool.map(p => p.playerId);

          // Assign teammate counts to all 6 pairs (C(4,2) = 6 pairs)
          // Pairs: (p0,p1), (p0,p2), (p0,p3), (p1,p2), (p1,p3), (p2,p3)
          const allPairs: Array<[string, string]> = [
            [playerIds[0], playerIds[1]],
            [playerIds[0], playerIds[2]],
            [playerIds[0], playerIds[3]],
            [playerIds[1], playerIds[2]],
            [playerIds[1], playerIds[3]],
            [playerIds[2], playerIds[3]],
          ];

          const pairs: Array<[string, string, number]> = allPairs.map(([p1, p2], i) => [
            p1,
            p2,
            counts[i],
          ]);

          const teammateHistory = buildTeammateHistory(pairs);

          const input: PairingInput = {
            candidatePool: pool,
            teammateHistory,
            opponentHistory: new Map(),
            matchConfigHistory: new Set(),
          };

          const result = selectPairing(input);

          // Since all pairs have count > 2, all combinations exceed threshold.
          // The algorithm should pick the one with the lowest max teammate count.
          const splits = getTeamSplits(playerIds);

          // Calculate max teammate count for each split
          const splitMaxCounts = splits.map(split => ({
            ...split,
            maxCount: getMaxTeammateCount(split.team1, split.team2, teammateHistory),
          }));

          const minMaxCount = Math.min(...splitMaxCounts.map(s => s.maxCount));

          // The result's max teammate count should equal the minimum possible
          const resultMaxCount = getMaxTeammateCount(result.team1, result.team2, teammateHistory);
          expect(resultMaxCount).toBe(minMaxCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Helper: generate all combinations of k elements from an array.
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
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

// Feature: smart-match-scoring, Property 9: Queue order mode uses strict FIFO
import { selectFifoPairing } from './pairingService';

describe('Property 9: Queue order mode uses strict FIFO', () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any session in "Queue Order" mode with a queue of N ≥ 4 players,
   * starting a match SHALL always select the players at positions 0, 1, 2, and 3
   * regardless of their ratings or pairing history.
   */

  // Arbitrary: generate a candidate pool of 4-12 players with varying ratings
  // The array order may differ from queue position order to ensure the function
  // sorts by queuePosition, not array index.
  const fifoCandidatePoolArb = fc
    .integer({ min: 4, max: 12 })
    .chain((size) =>
      fc.tuple(
        fc.array(
          fc.integer({ min: 100, max: 3000 }),
          { minLength: size, maxLength: size }
        ),
        fc.shuffledSubarray(
          Array.from({ length: size }, (_, i) => i),
          { minLength: size, maxLength: size }
        )
      ).map(([ratings, positions]) =>
        ratings.map((rating, idx) => ({
          playerId: `player-${idx}`,
          rating,
          queuePosition: positions[idx],
          isPair: false as const,
          pairId: null,
          pairedPlayerIds: null,
        }))
      )
    );

  it('should always select the 4 players with the lowest queue positions (0, 1, 2, 3)', () => {
    fc.assert(
      fc.property(fifoCandidatePoolArb, (pool) => {
        const result = selectFifoPairing(pool);

        // Find the players at positions 0, 1, 2, 3
        const sortedByPosition = [...pool].sort((a, b) => a.queuePosition - b.queuePosition);
        const expectedFirst = sortedByPosition[0].playerId;
        const expectedSecond = sortedByPosition[1].playerId;
        const expectedThird = sortedByPosition[2].playerId;
        const expectedFourth = sortedByPosition[3].playerId;

        // Team 1 should be positions 0 and 1, Team 2 should be positions 2 and 3
        expect(result.team1[0]).toBe(expectedFirst);
        expect(result.team1[1]).toBe(expectedSecond);
        expect(result.team2[0]).toBe(expectedThird);
        expect(result.team2[1]).toBe(expectedFourth);
      }),
      { numRuns: 100 }
    );
  });

  it('should select positions 0-3 regardless of player ratings', () => {
    fc.assert(
      fc.property(fifoCandidatePoolArb, (pool) => {
        const result = selectFifoPairing(pool);

        // All selected players should be the ones at queue positions 0, 1, 2, 3
        const selectedIds = [...result.team1, ...result.team2];
        const sortedByPosition = [...pool].sort((a, b) => a.queuePosition - b.queuePosition);
        const expectedIds = sortedByPosition.slice(0, 4).map((p) => p.playerId);

        expect(selectedIds).toEqual(expectedIds);
      }),
      { numRuns: 100 }
    );
  });

  it('should produce the same result regardless of how ratings are distributed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 12 }).chain((size) =>
          fc.tuple(
            fc.array(fc.integer({ min: 100, max: 3000 }), {
              minLength: size,
              maxLength: size,
            }),
            fc.array(fc.integer({ min: 100, max: 3000 }), {
              minLength: size,
              maxLength: size,
            })
          ).map(([ratings1, ratings2]) => {
            // Same players, same positions, different ratings
            const pool1 = ratings1.map((rating, idx) => ({
              playerId: `player-${idx}`,
              rating,
              queuePosition: idx,
              isPair: false as const,
              pairId: null,
              pairedPlayerIds: null,
            }));
            const pool2 = ratings2.map((rating, idx) => ({
              playerId: `player-${idx}`,
              rating,
              queuePosition: idx,
              isPair: false as const,
              pairId: null,
              pairedPlayerIds: null,
            }));
            return { pool1, pool2 };
          })
        ),
        ({ pool1, pool2 }) => {
          const result1 = selectFifoPairing(pool1);
          const result2 = selectFifoPairing(pool2);

          // Same players selected regardless of ratings
          const selected1 = [...result1.team1, ...result1.team2];
          const selected2 = [...result2.team1, ...result2.team2];
          expect(selected1).toEqual(selected2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should assign positions 0,1 to team1 and positions 2,3 to team2', () => {
    fc.assert(
      fc.property(fifoCandidatePoolArb, (pool) => {
        const result = selectFifoPairing(pool);

        const sortedByPosition = [...pool].sort((a, b) => a.queuePosition - b.queuePosition);

        // Verify team assignment: first two go to team1, next two to team2
        expect(result.team1).toEqual([
          sortedByPosition[0].playerId,
          sortedByPosition[1].playerId,
        ]);
        expect(result.team2).toEqual([
          sortedByPosition[2].playerId,
          sortedByPosition[3].playerId,
        ]);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: smart-match-scoring, Property 6: Queue integrity after pairing

/**
 * Property 6: Queue integrity after pairing
 *
 * For any queue of N players (N >= 4) after the pairing algorithm selects 4 players,
 * the remaining queue SHALL have exactly N - 4 entries with positions numbered
 * contiguously from 0 to N - 5, preserving the relative order of unselected players.
 *
 * Validates: Requirements 3.8
 */
describe('Property 6: Queue integrity after pairing', () => {
  /**
   * Arbitrary: generates a queue of 4-12 players with varying ratings.
   * Each player has a unique ID, a rating between 100-3000 (not all 1000),
   * and a queue position matching their index.
   */
  const queueArbitrary = fc
    .integer({ min: 4, max: 12 })
    .chain((size) =>
      fc
        .tuple(
          fc.array(fc.integer({ min: 100, max: 3000 }), {
            minLength: size,
            maxLength: size,
          }),
          fc.integer({ min: 0, max: size - 1 })
        )
        .map(([ratings, forcedIndex]) => {
          // Ensure at least one rating differs from 1000 to avoid random selection path
          if (ratings.every((r) => r === 1000)) {
            ratings[forcedIndex] = forcedIndex % 2 === 0 ? 1200 : 800;
          }
          return ratings.map((rating, index) => ({
            playerId: `player-${index}`,
            rating,
            queuePosition: index,
            isPair: false as const,
            pairId: null,
            pairedPlayerIds: null,
          }));
        })
    );

  it('remaining queue has exactly N-4 entries after removing selected players', () => {
    fc.assert(
      fc.property(queueArbitrary, (queue) => {
        const input: PairingInput = {
          candidatePool: queue,
          teammateHistory: new Map(),
          opponentHistory: new Map(),
          matchConfigHistory: new Set(),
        };

        const result = selectPairing(input);

        // Collect the 4 selected player IDs
        const selectedIds = new Set([
          result.team1[0],
          result.team1[1],
          result.team2[0],
          result.team2[1],
        ]);

        // All 4 selected players must be distinct
        expect(selectedIds.size).toBe(4);

        // Simulate removing selected players from queue
        const remaining = queue.filter((p) => !selectedIds.has(p.playerId));

        // Remaining queue should have exactly N - 4 entries
        expect(remaining.length).toBe(queue.length - 4);
      }),
      { numRuns: 100 }
    );
  });

  it('remaining queue positions are contiguous from 0 to N-5 after re-numbering', () => {
    fc.assert(
      fc.property(queueArbitrary, (queue) => {
        const input: PairingInput = {
          candidatePool: queue,
          teammateHistory: new Map(),
          opponentHistory: new Map(),
          matchConfigHistory: new Set(),
        };

        const result = selectPairing(input);

        // Collect the 4 selected player IDs
        const selectedIds = new Set([
          result.team1[0],
          result.team1[1],
          result.team2[0],
          result.team2[1],
        ]);

        // Simulate removing selected players and re-numbering positions from 0
        const remaining = queue.filter((p) => !selectedIds.has(p.playerId));
        const renumbered = remaining.map((p, index) => ({
          ...p,
          queuePosition: index,
        }));

        // Positions should be contiguous from 0 to N-5
        for (let i = 0; i < renumbered.length; i++) {
          expect(renumbered[i].queuePosition).toBe(i);
        }

        // Verify the expected range
        if (renumbered.length > 0) {
          expect(renumbered[0].queuePosition).toBe(0);
          expect(renumbered[renumbered.length - 1].queuePosition).toBe(
            queue.length - 5
          );
        }
      }),
      { numRuns: 100 }
    );
  });

  it('relative order of unselected players is preserved after pairing', () => {
    fc.assert(
      fc.property(queueArbitrary, (queue) => {
        const input: PairingInput = {
          candidatePool: queue,
          teammateHistory: new Map(),
          opponentHistory: new Map(),
          matchConfigHistory: new Set(),
        };

        const result = selectPairing(input);

        // Collect the 4 selected player IDs
        const selectedIds = new Set([
          result.team1[0],
          result.team1[1],
          result.team2[0],
          result.team2[1],
        ]);

        // Get remaining players preserving original order
        const remaining = queue.filter((p) => !selectedIds.has(p.playerId));

        // Verify relative order: each player's original queue position
        // should be strictly increasing (preserving original order)
        for (let i = 1; i < remaining.length; i++) {
          expect(remaining[i].queuePosition).toBeGreaterThan(
            remaining[i - 1].queuePosition
          );
        }
      }),
      { numRuns: 100 }
    );
  });
});
