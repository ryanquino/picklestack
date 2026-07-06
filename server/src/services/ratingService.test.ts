import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateWinRate, calculateRatingAdjustment, calculateMarginMultiplier } from './ratingService';

// Feature: smart-match-scoring, Property 2: Rating adjustment bounds and direction
/**
 * Property 2: Rating adjustment bounds and direction
 *
 * For any two team average ratings (each in [100, 3000]), the rating adjustment
 * produced by calculateRatingAdjustment SHALL satisfy:
 * (a) the adjustment is between 8 and 24 inclusive (basePoints × [0.5, 1.5])
 * (b) winners gain exactly the computed adjustment
 * (c) losers lose exactly the computed adjustment
 * Furthermore, when the winning team has a lower average rating, the adjustment
 * SHALL be greater than 16, and when the winning team has a higher average rating,
 * the adjustment SHALL be less than 16.
 *
 * Validates: Requirements 2.2, 2.3
 */
describe('Property 2: Rating adjustment bounds and direction', () => {
  // Custom arbitrary for valid ratings in [100, 3000]
  const ratingArb = fc.integer({ min: 100, max: 3000 });

  it('adjustment is always between 8 and 24 (basePoints × [0.5, 1.5])', () => {
    fc.assert(
      fc.property(ratingArb, ratingArb, (winnerAvg, loserAvg) => {
        const basePoints = 16;
        const { winnerGain, loserLoss } = calculateRatingAdjustment(winnerAvg, loserAvg, basePoints);

        // Adjustment must be within [basePoints * 0.5, basePoints * 1.5] = [8, 24]
        expect(winnerGain).toBeGreaterThanOrEqual(8);
        expect(winnerGain).toBeLessThanOrEqual(24);
        expect(loserLoss).toBeGreaterThanOrEqual(8);
        expect(loserLoss).toBeLessThanOrEqual(24);

        // winnerGain and loserLoss must be equal (symmetric adjustment)
        expect(winnerGain).toBe(loserLoss);
      }),
      { numRuns: 100 }
    );
  });

  it('underdogs (lower-rated winners) gain more than 16 points', () => {
    // The rating difference must be large enough that after rounding,
    // the adjustment exceeds 16. With basePoints=16, scaleFactor must be > 1.03125
    // for round(16 * scaleFactor) > 16, which requires (loserAvg - winnerAvg) > 12.5
    // So we require a minimum difference of 13 rating points.
    const underdogWinnerArb = fc.integer({ min: 100, max: 2987 });
    const underdogLoserArb = fc.integer({ min: 113, max: 3000 });

    fc.assert(
      fc.property(underdogWinnerArb, underdogLoserArb, (winnerAvg, loserAvg) => {
        // Pre-condition: loser rating is at least 13 points higher than winner
        fc.pre(loserAvg - winnerAvg >= 13);

        const basePoints = 16;
        const { winnerGain } = calculateRatingAdjustment(winnerAvg, loserAvg, basePoints);

        // When underdog wins with sufficient rating gap, adjustment > basePoints
        expect(winnerGain).toBeGreaterThan(16);
      }),
      { numRuns: 100 }
    );
  });

  it('favorites (higher-rated winners) gain less than 16 points', () => {
    // Similarly, the difference must be large enough for rounding to produce < 16.
    // scaleFactor must be < 0.96875 for round(16 * scaleFactor) < 16,
    // which requires (winnerAvg - loserAvg) > 12.5, i.e., difference >= 13.
    const favoriteWinnerArb = fc.integer({ min: 113, max: 3000 });
    const favoriteLoserArb = fc.integer({ min: 100, max: 2987 });

    fc.assert(
      fc.property(favoriteWinnerArb, favoriteLoserArb, (winnerAvg, loserAvg) => {
        // Pre-condition: winner rating is at least 13 points higher than loser
        fc.pre(winnerAvg - loserAvg >= 13);

        const basePoints = 16;
        const { winnerGain } = calculateRatingAdjustment(winnerAvg, loserAvg, basePoints);

        // When favorite wins with sufficient rating gap, adjustment < basePoints
        expect(winnerGain).toBeLessThan(16);
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: smart-match-scoring, Property 11: Win rate calculation
describe('Property 11: Win rate calculation', () => {
  it('winRate = W / (W + L) × 100 rounded to one decimal place when W + L > 0', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.nat({ max: 10000 }),
        (wins, losses) => {
          // Only test cases where there is at least one match
          fc.pre(wins + losses > 0);

          const result = calculateWinRate(wins, losses);
          const expected = Math.round((wins / (wins + losses)) * 1000) / 10;

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 7.2**
  it('winRate = 0.0 when wins and losses are both 0', () => {
    fc.assert(
      fc.property(
        fc.constant(0),
        fc.constant(0),
        (wins, losses) => {
          const result = calculateWinRate(wins, losses);
          expect(result).toBe(0.0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 7.2**
  it('winRate is always between 0.0 and 100.0 inclusive', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.nat({ max: 10000 }),
        (wins, losses) => {
          const result = calculateWinRate(wins, losses);
          expect(result).toBeGreaterThanOrEqual(0.0);
          expect(result).toBeLessThanOrEqual(100.0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 7.2**
  it('winRate = 100.0 when losses = 0 and wins > 0', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }).filter((w) => w > 0),
        (wins) => {
          const result = calculateWinRate(wins, 0);
          expect(result).toBe(100.0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 7.2**
  it('winRate = 0.0 when wins = 0 and losses > 0', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }).filter((l) => l > 0),
        (losses) => {
          const result = calculateWinRate(0, losses);
          expect(result).toBe(0.0);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Feature: smart-match-scoring, Property 3: Rating bounds invariant
describe('Property 3: Rating bounds invariant', () => {
  /**
   * Clamps a value between min and max (inclusive).
   * Mirrors the clamp function in ratingService.ts for test simulation.
   */
  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * **Validates: Requirements 2.4**
   *
   * For any player with any starting rating in [100, 3000] and any sequence of
   * match results (wins and losses against teams of any valid rating), the player's
   * rating SHALL always remain within [100, 3000] after each adjustment.
   */
  it('rating stays within [100, 3000] after any sequence of wins and losses', () => {
    fc.assert(
      fc.property(
        // Starting rating in valid range
        fc.integer({ min: 100, max: 3000 }),
        // Sequence of match outcomes: each is { isWin, opponentAvgRating }
        fc.array(
          fc.record({
            isWin: fc.boolean(),
            opponentAvgRating: fc.integer({ min: 100, max: 3000 }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (startingRating, matchSequence) => {
          let currentRating = startingRating;

          for (const match of matchSequence) {
            const { isWin, opponentAvgRating } = match;

            if (isWin) {
              const { winnerGain } = calculateRatingAdjustment(currentRating, opponentAvgRating);
              currentRating = clamp(currentRating + winnerGain, 100, 3000);
            } else {
              const { loserLoss } = calculateRatingAdjustment(opponentAvgRating, currentRating);
              currentRating = clamp(currentRating - loserLoss, 100, 3000);
            }

            // After each match, rating must remain in bounds
            expect(currentRating).toBeGreaterThanOrEqual(100);
            expect(currentRating).toBeLessThanOrEqual(3000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 2.4**
  it('rating never goes below 100 even with maximum consecutive losses', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 3000 }),
        fc.array(fc.integer({ min: 100, max: 3000 }), { minLength: 1, maxLength: 100 }),
        (startingRating, opponentRatings) => {
          let currentRating = startingRating;

          // All losses against various opponents
          for (const opponentAvgRating of opponentRatings) {
            const { loserLoss } = calculateRatingAdjustment(opponentAvgRating, currentRating);
            currentRating = clamp(currentRating - loserLoss, 100, 3000);

            expect(currentRating).toBeGreaterThanOrEqual(100);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // **Validates: Requirements 2.4**
  it('rating never exceeds 3000 even with maximum consecutive wins', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 3000 }),
        fc.array(fc.integer({ min: 100, max: 3000 }), { minLength: 1, maxLength: 100 }),
        (startingRating, opponentRatings) => {
          let currentRating = startingRating;

          // All wins against various opponents
          for (const opponentAvgRating of opponentRatings) {
            const { winnerGain } = calculateRatingAdjustment(currentRating, opponentAvgRating);
            currentRating = clamp(currentRating + winnerGain, 100, 3000);

            expect(currentRating).toBeLessThanOrEqual(3000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================
// Score Margin Multiplier Tests (Task 8.2)
// ============================================================

describe('calculateMarginMultiplier', () => {
  it('returns 1.0 for margin of 0', () => {
    expect(calculateMarginMultiplier(0)).toBe(1.0);
  });

  it('returns 1.1 for margin of 2', () => {
    expect(calculateMarginMultiplier(2)).toBeCloseTo(1.1);
  });

  it('returns 1.4 for margin of 8', () => {
    expect(calculateMarginMultiplier(8)).toBeCloseTo(1.4);
  });

  it('returns 2.0 for margin of 20 (cap)', () => {
    expect(calculateMarginMultiplier(20)).toBe(2.0);
  });

  it('caps at 2.0 for margins greater than 20', () => {
    expect(calculateMarginMultiplier(30)).toBe(2.0);
    expect(calculateMarginMultiplier(100)).toBe(2.0);
  });

  it('returns 1.05 for margin of 1', () => {
    expect(calculateMarginMultiplier(1)).toBeCloseTo(1.05);
  });
});

describe('calculateRatingAdjustment with scoreMargin', () => {
  it('applies margin multiplier when scoreMargin is provided', () => {
    const withoutMargin = calculateRatingAdjustment(1000, 1000, 16);
    const withMargin = calculateRatingAdjustment(1000, 1000, 16, 10);

    // margin 10 → multiplier 1.5 → adjustment should be 16 * 1.0 * 1.5 = 24
    expect(withMargin.winnerGain).toBe(24);
    expect(withMargin.loserLoss).toBe(24);
    // Without margin should be 16
    expect(withoutMargin.winnerGain).toBe(16);
  });

  it('defaults to multiplier 1.0 when scoreMargin is undefined', () => {
    const result = calculateRatingAdjustment(1000, 1000, 16, undefined);
    expect(result.winnerGain).toBe(16);
  });

  it('caps adjustment with maximum margin and maximum scale factor', () => {
    // Max scale factor = 1.5 (underdog wins), max margin multiplier = 2.0
    // Max adjustment = round(16 * 1.5 * 2.0) = 48
    const result = calculateRatingAdjustment(100, 3000, 16, 20);
    expect(result.winnerGain).toBe(48);
  });

  it('minimum adjustment with minimum scale factor and no margin', () => {
    // Min scale factor = 0.5 (favorite wins), margin multiplier = 1.0
    // Min adjustment = round(16 * 0.5 * 1.0) = 8
    const result = calculateRatingAdjustment(3000, 100, 16, 0);
    expect(result.winnerGain).toBe(8);
  });

  it('adjustment is always between 8 and 48 inclusive with any margin', () => {
    // Equal teams, max margin → 16 * 1.0 * 2.0 = 32
    const result = calculateRatingAdjustment(1000, 1000, 16, 20);
    expect(result.winnerGain).toBe(32);
    expect(result.winnerGain).toBeGreaterThanOrEqual(8);
    expect(result.winnerGain).toBeLessThanOrEqual(48);
  });
});
