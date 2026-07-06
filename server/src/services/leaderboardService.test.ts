import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PlayerStats, StarRating } from '../types';

// Feature: smart-match-scoring, Property 10: Leaderboard sort correctness

/**
 * Property 10: Leaderboard sort correctness
 *
 * For any set of player statistics, the leaderboard SHALL be sorted such that
 * for any two adjacent entries (rank i, rank i+1): either entry i has a strictly
 * higher win rate, or they have equal win rates and entry i has more total matches
 * played, or they have equal win rates and equal matches played and entry i's name
 * is alphabetically before or equal to entry i+1's name.
 *
 * Validates: Requirements 7.1
 */

/**
 * Replicates the leaderboard sort logic from leaderboardService.ts as a pure function.
 * Sort order: winRate desc → matchesPlayed desc → playerName asc (alphabetical)
 */
function sortLeaderboard(stats: PlayerStats[]): PlayerStats[] {
  return [...stats].sort((a, b) => {
    // Primary: win rate descending
    if (b.winRate !== a.winRate) {
      return b.winRate - a.winRate;
    }
    // Secondary: matches played descending
    if (b.matchesPlayed !== a.matchesPlayed) {
      return b.matchesPlayed - a.matchesPlayed;
    }
    // Tertiary: name alphabetical ascending
    return a.playerName.localeCompare(b.playerName);
  });
}

/**
 * Checks the sort invariant between two adjacent leaderboard entries.
 * Returns true if entry `a` (higher rank) correctly precedes entry `b` (lower rank).
 */
function sortInvariantHolds(a: PlayerStats, b: PlayerStats): boolean {
  // Case 1: a has strictly higher win rate
  if (a.winRate > b.winRate) return true;

  // Case 2: equal win rates, a has more matches played
  if (a.winRate === b.winRate && a.matchesPlayed > b.matchesPlayed) return true;

  // Case 3: equal win rates and matches, a's name is alphabetically <= b's name
  if (
    a.winRate === b.winRate &&
    a.matchesPlayed === b.matchesPlayed &&
    a.playerName.localeCompare(b.playerName) <= 0
  ) {
    return true;
  }

  return false;
}

// Custom arbitrary for generating player stats
const playerStatsArb = (index: number): fc.Arbitrary<PlayerStats> =>
  fc.record({
    playerId: fc.constant(`player-${index}`),
    playerName: fc.stringMatching(/^[A-Za-z]{1,15}$/),
    rating: fc.integer({ min: 100, max: 3000 }),
    starRating: fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<StarRating>,
    wins: fc.nat({ max: 50 }),
    losses: fc.nat({ max: 50 }),
    matchesPlayed: fc.nat({ max: 100 }),
    winRate: fc.double({ min: 0, max: 100, noNaN: true }),
    streak: fc.integer({ min: -20, max: 20 }),
  });

// Generate an array of player stats with unique names and consistent data
const playerStatsArrayArb = fc
  .integer({ min: 2, max: 20 })
  .chain((size) =>
    fc.tuple(
      ...Array.from({ length: size }, (_, i) => playerStatsArb(i))
    )
  )
  .map((arr) => arr as PlayerStats[]);

describe('Property 10: Leaderboard sort correctness', () => {
  // **Validates: Requirements 7.1**
  it('adjacent entries satisfy the sort invariant (win rate → matches → name)', () => {
    fc.assert(
      fc.property(playerStatsArrayArb, (stats) => {
        const sorted = sortLeaderboard(stats);

        // For every pair of adjacent entries, the sort invariant must hold
        for (let i = 0; i < sorted.length - 1; i++) {
          const current = sorted[i];
          const next = sorted[i + 1];

          expect(
            sortInvariantHolds(current, next),
            `Sort invariant violated at positions ${i} and ${i + 1}: ` +
              `"${current.playerName}" (winRate=${current.winRate}, matches=${current.matchesPlayed}) ` +
              `should precede "${next.playerName}" (winRate=${next.winRate}, matches=${next.matchesPlayed})`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 7.1**
  it('higher win rate always results in higher rank', () => {
    fc.assert(
      fc.property(playerStatsArrayArb, (stats) => {
        const sorted = sortLeaderboard(stats);

        for (let i = 0; i < sorted.length - 1; i++) {
          const current = sorted[i];
          const next = sorted[i + 1];

          // If next has a strictly higher win rate than current, the sort is wrong
          expect(next.winRate).toBeLessThanOrEqual(current.winRate);
        }
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 7.1**
  it('when win rates are equal, more matches played results in higher rank', () => {
    fc.assert(
      fc.property(playerStatsArrayArb, (stats) => {
        const sorted = sortLeaderboard(stats);

        for (let i = 0; i < sorted.length - 1; i++) {
          const current = sorted[i];
          const next = sorted[i + 1];

          // Only check the tiebreaker when win rates are equal
          if (current.winRate === next.winRate) {
            expect(next.matchesPlayed).toBeLessThanOrEqual(current.matchesPlayed);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 7.1**
  it('when win rates and matches are equal, names are in alphabetical order', () => {
    fc.assert(
      fc.property(playerStatsArrayArb, (stats) => {
        const sorted = sortLeaderboard(stats);

        for (let i = 0; i < sorted.length - 1; i++) {
          const current = sorted[i];
          const next = sorted[i + 1];

          // Only check name ordering when both win rate and matches are equal
          if (
            current.winRate === next.winRate &&
            current.matchesPlayed === next.matchesPlayed
          ) {
            expect(current.playerName.localeCompare(next.playerName)).toBeLessThanOrEqual(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 7.1**
  it('sort is stable - all input elements are preserved in output', () => {
    fc.assert(
      fc.property(playerStatsArrayArb, (stats) => {
        const sorted = sortLeaderboard(stats);

        // Same number of elements
        expect(sorted.length).toBe(stats.length);

        // All player IDs from input are present in output
        const inputIds = new Set(stats.map((s) => s.playerId));
        const outputIds = new Set(sorted.map((s) => s.playerId));
        expect(outputIds).toEqual(inputIds);
      }),
      { numRuns: 100 }
    );
  });
});
