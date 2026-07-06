import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import QueueList from './QueueList';
import type { StarRating } from '../types';

/**
 * **Validates: Requirements 5.3**
 *
 * Property 3: Queue list field completeness
 *
 * For any non-empty array of queue entries with player stats, the rendered
 * queue list SHALL display for each entry: a numbered position badge, a player
 * avatar, the player name, star rating icons, numeric rating, and W-L record.
 */

// Mock PlayerProfileCard since it fetches data
vi.mock('./PlayerProfileCard', () => ({ default: () => null }));

interface QueueEntry {
  playerId: string;
  position: number;
  playerName: string;
  rating?: number;
  starRating?: StarRating;
  wins?: number;
  losses?: number;
  streak?: number;
}

const starRatingArb = fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<StarRating>;

// Generate alphabetic player names to avoid special characters in aria-label selectors
const playerNameArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 2, maxLength: 12 })
  .map(chars => chars.join(''));

const queueEntryArb = (index: number): fc.Arbitrary<QueueEntry> =>
  fc.record({
    playerId: fc.constant(`player-${index}-${Math.random().toString(36).slice(2)}`),
    position: fc.constant(index),
    playerName: playerNameArb,
    rating: fc.integer({ min: 800, max: 2000 }),
    starRating: starRatingArb,
    wins: fc.integer({ min: 0, max: 100 }),
    losses: fc.integer({ min: 0, max: 100 }),
    streak: fc.integer({ min: -10, max: 10 }),
  });

// Generate a non-empty array of queue entries with unique player IDs and sequential positions
const queueArrayArb: fc.Arbitrary<QueueEntry[]> = fc
  .integer({ min: 1, max: 8 })
  .chain((length) =>
    fc.tuple(...Array.from({ length }, (_, i) => queueEntryArb(i)))
  )
  .map((entries) => {
    // Ensure unique player IDs by appending index
    return (entries as QueueEntry[]).map((entry, i) => ({
      ...entry,
      playerId: `player-${i}`,
    }));
  });

const defaultProps = {
  onMoveUp: vi.fn().mockResolvedValue(undefined),
  onMoveDown: vi.fn().mockResolvedValue(undefined),
  onRemove: vi.fn().mockResolvedValue(undefined),
};

describe('Feature: ui-polish-and-features, Property 3: Queue list field completeness', () => {
  it('each queue entry displays position badge, avatar, name, star rating, numeric rating, and W-L record', () => {
    fc.assert(
      fc.property(queueArrayArb, (queue) => {
        const { container } = render(<QueueList queue={queue} {...defaultProps} />);

        // Verify position badges
        const positionBadges = container.querySelectorAll('.queue-position');
        expect(positionBadges).toHaveLength(queue.length);

        queue.forEach((entry, index) => {
          // 1. Position badge with correct number (position + 1 displayed)
          expect(positionBadges[index].textContent).toBe(String(entry.position + 1));

          // 2. PlayerAvatar with aria-label "Avatar for {name}"
          const avatar = container.querySelector(
            `[aria-label="Avatar for ${entry.playerName}"]`
          );
          expect(avatar).not.toBeNull();

          // 3. Player name text present
          expect(container.textContent).toContain(entry.playerName);

          // 4. Star rating (aria-label containing "out of 5 stars")
          const starRating = (entry.starRating ?? 3) as number;
          const starElement = container.querySelector(
            `[aria-label="${starRating} out of 5 stars"]`
          );
          expect(starElement).not.toBeNull();

          // 5. Numeric rating value present
          const rating = entry.rating ?? 1000;
          expect(container.textContent).toContain(String(rating));

          // 6. W-L record (format: "{wins}-{losses}")
          const wins = entry.wins ?? 0;
          const losses = entry.losses ?? 0;
          expect(container.textContent).toContain(`${wins}-${losses}`);
        });
      }),
      { numRuns: 100 }
    );
  });
});
