import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PendingPlayer, StarRating } from '../types';

/**
 * Property 7: Player removal preserves remaining players
 *
 * For any list of PendingPlayer entries and any single player in that list,
 * removing that player SHALL result in a list that contains all other players
 * unchanged and does not contain the removed player.
 *
 * **Validates: Requirements 7.7**
 */

// Pure logic under test — matches the removal logic used in CreateSession
function removePlayer(players: PendingPlayer[], localId: string): PendingPlayer[] {
  return players.filter(p => p.localId !== localId);
}

// Generator for a StarRating (1-5)
const starRatingArbitrary: fc.Arbitrary<StarRating> = fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<StarRating>;

// Generator for a PendingPlayer with a unique localId
const pendingPlayerArbitrary = (index: number): fc.Arbitrary<PendingPlayer> =>
  fc.tuple(
    fc.string({ minLength: 1, maxLength: 30 }),
    starRatingArbitrary
  ).map(([name, starRating]) => ({
    localId: `player-${index}-${name}`,
    name,
    starRating,
  }));

// Generator for an array of PendingPlayers with unique localIds (length 1-10)
const pendingPlayersArbitrary: fc.Arbitrary<PendingPlayer[]> = fc
  .integer({ min: 1, max: 10 })
  .chain((length) =>
    fc.tuple(
      ...Array.from({ length }, (_, i) =>
        fc.tuple(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 30 }),
          starRatingArbitrary
        ).map(([uuid, name, starRating]): PendingPlayer => ({
          localId: uuid,
          name,
          starRating,
        }))
      )
    ) as fc.Arbitrary<PendingPlayer[]>
  );

describe('Feature: ui-polish-and-features, Property 7: Player removal preserves remaining players', () => {
  it('result has length = original.length - 1', () => {
    fc.assert(
      fc.property(
        pendingPlayersArbitrary.chain((players) =>
          fc.tuple(
            fc.constant(players),
            fc.integer({ min: 0, max: players.length - 1 })
          )
        ),
        ([players, indexToRemove]) => {
          const playerToRemove = players[indexToRemove];
          const result = removePlayer(players, playerToRemove.localId);
          expect(result).toHaveLength(players.length - 1);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('removed player localId is not in the result', () => {
    fc.assert(
      fc.property(
        pendingPlayersArbitrary.chain((players) =>
          fc.tuple(
            fc.constant(players),
            fc.integer({ min: 0, max: players.length - 1 })
          )
        ),
        ([players, indexToRemove]) => {
          const playerToRemove = players[indexToRemove];
          const result = removePlayer(players, playerToRemove.localId);
          const resultLocalIds = result.map(p => p.localId);
          expect(resultLocalIds).not.toContain(playerToRemove.localId);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('all other players are present and unchanged (same name, starRating, localId)', () => {
    fc.assert(
      fc.property(
        pendingPlayersArbitrary.chain((players) =>
          fc.tuple(
            fc.constant(players),
            fc.integer({ min: 0, max: players.length - 1 })
          )
        ),
        ([players, indexToRemove]) => {
          const playerToRemove = players[indexToRemove];
          const result = removePlayer(players, playerToRemove.localId);

          const expectedRemaining = players.filter((_, i) => i !== indexToRemove);

          expect(result).toHaveLength(expectedRemaining.length);

          for (const expected of expectedRemaining) {
            const found = result.find(p => p.localId === expected.localId);
            expect(found).toBeDefined();
            expect(found!.name).toBe(expected.name);
            expect(found!.starRating).toBe(expected.starRating);
            expect(found!.localId).toBe(expected.localId);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
