import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreateSession from './CreateSession';
import type { StarRating, SessionType, GameMode, MatchingMode } from '../types';

/**
 * **Validates: Requirements 7.10**
 *
 * Property 8: Error state retains form data
 *
 * For any valid form state (name, court name, court count, session type,
 * game mode, matching mode, and pending players), if session creation fails,
 * the form SHALL retain all field values unchanged after displaying the error.
 */

vi.mock('../api', () => ({
  createSession: vi.fn(),
  updateSessionSettings: vi.fn(),
  addPlayer: vi.fn(),
}));

import { createSession } from '../api';

const starRatingArb: fc.Arbitrary<StarRating> = fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<StarRating>;

interface GeneratedPlayer {
  name: string;
  starRating: StarRating;
}

const playerArb: fc.Arbitrary<GeneratedPlayer> = fc.record({
  name: fc.stringMatching(/^[a-zA-Z0-9 ]+$/)
    .filter(s => s.length >= 1 && s.length <= 30 && s.trim().length >= 1),
  starRating: starRatingArb,
});

interface GeneratedFormState {
  name: string;
  courtName: string;
  courtCount: number;
  sessionType: SessionType;
  gameMode: GameMode;
  matchingMode: MatchingMode;
  players: GeneratedPlayer[];
}

const formStateArb: fc.Arbitrary<GeneratedFormState> = fc.record({
  name: fc.stringMatching(/^[a-zA-Z0-9 ]+$/)
    .filter(s => s.length >= 1 && s.length <= 50 && s.trim().length >= 1),
  courtName: fc.stringMatching(/^[a-zA-Z0-9 ]*$/)
    .filter(s => s.length <= 50),
  courtCount: fc.integer({ min: 1, max: 12 }),
  sessionType: fc.constantFrom<SessionType>('open_play', 'tournament'),
  gameMode: fc.constantFrom<GameMode>('doubles', 'singles'),
  matchingMode: fc.constantFrom<MatchingMode>('smart', 'queue'),
  players: fc.array(playerArb, { minLength: 0, maxLength: 3 }),
});

describe('Feature: ui-polish-and-features, Property 8: Error state retains form data', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('all form field values remain unchanged after a submission error', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(formStateArb, async (formState) => {
        // Mock createSession to reject with an error
        vi.mocked(createSession).mockRejectedValue(new Error('Network error'));

        const { container, unmount } = render(
          <MemoryRouter>
            <CreateSession />
          </MemoryRouter>
        );

        try {
          // Fill in Basic Info
          const nameInput = container.querySelector('#session-name') as HTMLInputElement;
          const courtNameInput = container.querySelector('#court-name') as HTMLInputElement;
          const courtCountInput = container.querySelector('#court-count') as HTMLInputElement;

          fireEvent.change(nameInput, { target: { value: formState.name } });
          fireEvent.change(courtNameInput, { target: { value: formState.courtName } });
          fireEvent.change(courtCountInput, { target: { value: String(formState.courtCount) } });

          // Fill in Game Settings
          const sessionTypeSelect = container.querySelector('#session-type') as HTMLSelectElement;
          const gameModeSelect = container.querySelector('#game-mode') as HTMLSelectElement;
          const matchingModeSelect = container.querySelector('#matching-mode') as HTMLSelectElement;

          fireEvent.change(sessionTypeSelect, { target: { value: formState.sessionType } });
          fireEvent.change(gameModeSelect, { target: { value: formState.gameMode } });
          fireEvent.change(matchingModeSelect, { target: { value: formState.matchingMode } });

          // Add pending players
          const playerNameInput = container.querySelector('#player-name') as HTMLInputElement;
          const playerRatingSelect = container.querySelector('#player-star-rating') as HTMLSelectElement;
          const addButton = container.querySelector('.create-session__add-btn') as HTMLButtonElement;

          for (const player of formState.players) {
            fireEvent.change(playerNameInput, { target: { value: player.name } });
            fireEvent.change(playerRatingSelect, { target: { value: String(player.starRating) } });
            fireEvent.click(addButton);
          }

          // Submit the form
          const submitButton = container.querySelector('.create-session__submit-btn') as HTMLButtonElement;
          fireEvent.click(submitButton);

          // Wait for the error message to appear
          await waitFor(() => {
            const errorAlert = container.querySelector('[role="alert"].create-session__error');
            expect(errorAlert).not.toBeNull();
            expect(errorAlert!.textContent).toContain('Network error');
          });

          // Verify all form field values remain unchanged
          expect(nameInput.value).toBe(formState.name);
          expect(courtNameInput.value).toBe(formState.courtName);
          expect(courtCountInput.value).toBe(String(formState.courtCount));
          expect(sessionTypeSelect.value).toBe(formState.sessionType);
          expect(gameModeSelect.value).toBe(formState.gameMode);
          expect(matchingModeSelect.value).toBe(formState.matchingMode);

          // Verify pending players are still in the list
          const playerNameElements = container.querySelectorAll('.create-session__player-name');
          const renderedNames = Array.from(playerNameElements).map(el => el.textContent);

          for (const player of formState.players) {
            expect(renderedNames).toContain(player.name.trim());
          }
          expect(playerNameElements.length).toBe(formState.players.length);
        } finally {
          unmount();
        }
      }),
      { numRuns: 20 }
    );
  });
});
