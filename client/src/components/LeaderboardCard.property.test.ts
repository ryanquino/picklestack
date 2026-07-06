import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildLeaderboardCardEntries } from './LeaderboardCard';
import { PlayerStats, StarRating } from '../types';

/**
 * **Validates: Requirements 3.3, 3.5**
 *
 * Property 1: Leaderboard card sorting and filtering
 *
 * For any array of PlayerStats, buildLeaderboardCardEntries SHALL return only
 * players with matchesPlayed >= 1, and for every adjacent pair the sort invariant
 * holds: winRate desc → matchesPlayed desc → pointDifferential desc.
 * Tied players share the same rank (dense ranking).
 */

const starRatingArb: fc.Arbitrary<StarRating> = fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<StarRating>;

const playerStatsArb: fc.Arbitrary<PlayerStats> = fc.record({
  playerId: fc.uuid(),
  playerName: fc.string({ minLength: 1, maxLength: 30 }),
  matchesPlayed: fc.integer({ min: 0, max: 100 }),
  wins: fc.integer({ min: 0, max: 100 }),
  losses: fc.integer({ min: 0, max: 100 }),
  winRate: fc.float({ min: 0, max: 100, noNaN: true }),
  rating: fc.integer({ min: 500, max: 2500 }),
  starRating: starRatingArb,
  streak: fc.integer({ min: -20, max: 20 }),
  pointDifferential: fc.integer({ min: -200, max: 200 }),
});

const playerStatsArrayArb: fc.Arbitrary<PlayerStats[]> = fc.array(playerStatsArb, { minLength: 0, maxLength: 20 });

describe('Feature: ui-polish-and-features, Property 1: Leaderboard card sorting and filtering', () => {
  it('should only include players with matchesPlayed >= 1', () => {
    fc.assert(
      fc.property(playerStatsArrayArb, (stats) => {
        const entries = buildLeaderboardCardEntries(stats);
        // All source players with matchesPlayed >= 1 should be in the result
        const eligibleCount = stats.filter(p => p.matchesPlayed >= 1).length;
        expect(entries.length).toBe(eligibleCount);
        // No entry should come from a player with matchesPlayed < 1
        for (const entry of entries) {
          const source = stats.find(p => p.playerName === entry.playerName);
          expect(source).toBeDefined();
          expect(source!.matchesPlayed).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should satisfy sort invariant: winRate desc, matchesPlayed desc, pointDifferential desc', () => {
    fc.assert(
      fc.property(playerStatsArrayArb, (stats) => {
        const entries = buildLeaderboardCardEntries(stats);
        for (let i = 0; i < entries.length - 1; i++) {
          const curr = entries[i];
          const next = entries[i + 1];

          // Find source stats for comparison
          const currSource = stats.find(p => p.playerName === curr.playerName && p.matchesPlayed >= 1);
          const nextSource = stats.find(p => p.playerName === next.playerName && p.matchesPlayed >= 1);

          if (curr.winRate !== next.winRate) {
            // Primary sort: winRate descending
            expect(curr.winRate).toBeGreaterThanOrEqual(next.winRate);
          } else if (currSource && nextSource && currSource.matchesPlayed !== nextSource.matchesPlayed) {
            // Secondary sort: matchesPlayed descending
            expect(currSource.matchesPlayed).toBeGreaterThan(nextSource.matchesPlayed);
          } else if (currSource && nextSource && currSource.pointDifferential !== nextSource.pointDifferential) {
            // Tertiary sort: pointDifferential descending
            expect(currSource.pointDifferential).toBeGreaterThan(nextSource.pointDifferential);
          }
          // If all are equal, they are tied — no further ordering required
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should assign dense ranks (tied players share the same rank)', () => {
    fc.assert(
      fc.property(playerStatsArrayArb, (stats) => {
        const entries = buildLeaderboardCardEntries(stats);
        if (entries.length === 0) return;

        // First entry always has rank 1
        expect(entries[0].rank).toBe(1);

        for (let i = 1; i < entries.length; i++) {
          const curr = entries[i];
          const prev = entries[i - 1];

          // Find source stats
          const currSource = stats.find(p => p.playerName === curr.playerName && p.matchesPlayed >= 1);
          const prevSource = stats.find(p => p.playerName === prev.playerName && p.matchesPlayed >= 1);

          if (currSource && prevSource) {
            const isTied =
              currSource.winRate === prevSource.winRate &&
              currSource.matchesPlayed === prevSource.matchesPlayed &&
              currSource.pointDifferential === prevSource.pointDifferential;

            if (isTied) {
              expect(curr.rank).toBe(prev.rank);
            } else {
              expect(curr.rank).toBe(prev.rank + 1);
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
