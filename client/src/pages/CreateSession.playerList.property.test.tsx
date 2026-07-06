import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreateSession from './CreateSession';
import type { StarRating } from '../types';

/**
 * **Validates: Requirements 7.6**
 *
 * Property 6: Player list rendering completeness
 *
 * For any non-empty array of PendingPlayer entries, the rendered
 * Player_CheckIn_Section SHALL display each player's name and star rating
 * in the list.
 */

const starRatingArb: fc.Arbitrary<StarRating> = fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<StarRating>;

interface GeneratedPlayer {
  name: string;
  starRating: StarRating;
}

// Generate player names using alphanumeric characters to avoid edge cases with special chars
const playerArb: fc.Arbitrary<GeneratedPlayer> = fc.record({
  name: fc.stringMatching(/^[a-zA-Z0-9 ]+$/)
    .filter(s => s.length >= 1 && s.length <= 30 && s.trim().length >= 1),
  starRating: starRatingArb,
});

const playerArrayArb: fc.Arbitrary<GeneratedPlayer[]> = fc.array(playerArb, { minLength: 1, maxLength: 5 });

describe('Feature: ui-polish-and-features, Property 6: Player list rendering completeness', () => {
  afterEach(() => {
    cleanup();
  });

  it('each added player name and star rating appear in the rendered list', { timeout: 30000 }, () => {
    fc.assert(
      fc.property(playerArrayArb, (players) => {
        const { container, unmount } = render(
          <MemoryRouter>
            <CreateSession />
          </MemoryRouter>
        );

        try {
          const nameInput = container.querySelector('#player-name');
          const ratingSelect = container.querySelector('#player-star-rating');
          const addButton = container.querySelector('.create-session__add-btn');

          // Ensure elements exist
          expect(nameInput).not.toBeNull();
          expect(ratingSelect).not.toBeNull();
          expect(addButton).not.toBeNull();

          // Add each player via the UI
          for (const player of players) {
            fireEvent.change(nameInput!, { target: { value: player.name } });
            fireEvent.change(ratingSelect!, { target: { value: String(player.starRating) } });
            fireEvent.click(addButton!);
          }

          // Verify each player's name appears in the list
          const playerNameElements = container.querySelectorAll('.create-session__player-name');
          const renderedNames = Array.from(playerNameElements).map(el => el.textContent);

          for (const player of players) {
            const trimmedName = player.name.trim();
            expect(renderedNames).toContain(trimmedName);
          }

          // Verify each player's star rating appears in the list
          const playerStarElements = container.querySelectorAll('.create-session__player-stars');
          const renderedAriaLabels = Array.from(playerStarElements).map(el => el.getAttribute('aria-label'));

          for (const player of players) {
            const expectedLabel = `${player.starRating} star rating`;
            expect(renderedAriaLabels).toContain(expectedLabel);
          }

          // Verify the count of rendered players matches the input count
          expect(playerNameElements.length).toBe(players.length);
        } finally {
          unmount();
        }
      }),
      { numRuns: 20 }
    );
  });
});
