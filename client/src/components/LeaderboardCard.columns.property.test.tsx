import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { render } from '@testing-library/react';
import LeaderboardCard from './LeaderboardCard';
import { PlayerStats, StarRating } from '../types';

/**
 * **Validates: Requirements 3.2**
 *
 * Property 2: Leaderboard card column completeness
 *
 * For any non-empty array of PlayerStats where at least one player has
 * matchesPlayed >= 1, the rendered LeaderboardCard component SHALL display
 * for each visible player: their rank, player name, win-loss record,
 * matches played, and win rate percentage.
 */

const starRatingArb = fc.integer({ min: 1, max: 5 }) as fc.Arbitrary<StarRating>;

const playerStatsArb = (options?: { minMatchesPlayed?: number }): fc.Arbitrary<PlayerStats> => {
  const minMatches = options?.minMatchesPlayed ?? 0;
  return fc.record({
    playerId: fc.uuid(),
    playerName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
    rating: fc.integer({ min: 800, max: 2000 }),
    starRating: starRatingArb,
    wins: fc.integer({ min: 0, max: 100 }),
    losses: fc.integer({ min: 0, max: 100 }),
    matchesPlayed: fc.integer({ min: minMatches, max: 200 }),
    winRate: fc.double({ min: 0, max: 100, noNaN: true }),
    streak: fc.integer({ min: -20, max: 20 }),
    pointDifferential: fc.integer({ min: -200, max: 200 }),
  }).filter(p => p.matchesPlayed >= p.wins + p.losses || true)
    .map(p => ({
      ...p,
      matchesPlayed: Math.max(p.matchesPlayed, p.wins + p.losses),
    }));
};

// Generate an array that has at least one player with matchesPlayed >= 1
const playerStatsArrayWithActivePlayersArb: fc.Arbitrary<PlayerStats[]> = fc.tuple(
  // At least one player with matchesPlayed >= 1
  playerStatsArb({ minMatchesPlayed: 1 }),
  // Additional players (may or may not have matches)
  fc.array(playerStatsArb(), { minLength: 0, maxLength: 10 })
).map(([active, rest]) => {
  // Ensure the active player has at least 1 match played
  const activePlayer = { ...active, matchesPlayed: Math.max(1, active.matchesPlayed) };
  // Shuffle the active player into the array
  const all = [activePlayer, ...rest];
  return all;
});

describe('Feature: ui-polish-and-features, Property 2: Leaderboard card column completeness', () => {
  it('each visible player row contains rank, name, W-L record, matches, and win rate percentage', () => {
    fc.assert(
      fc.property(playerStatsArrayWithActivePlayersArb, (playerStats) => {
        const { container } = render(<LeaderboardCard playerStats={playerStats} />);

        // Get all player rows
        const rows = container.querySelectorAll('.leaderboard-card__row');

        // Count players that should be visible (matchesPlayed >= 1)
        const qualifyingPlayers = playerStats.filter(p => p.matchesPlayed >= 1);

        // The number of rows should match qualifying players
        expect(rows.length).toBe(qualifyingPlayers.length);

        // Each row must have all 6 required columns
        rows.forEach((row) => {
          const rankCell = row.querySelector('.leaderboard-card__cell--rank');
          const nameCell = row.querySelector('.leaderboard-card__cell--name');
          const recordCell = row.querySelector('.leaderboard-card__cell--record');
          const winrateCell = row.querySelector('.leaderboard-card__cell--winrate');
          const matchesCell = row.querySelector('.leaderboard-card__cell--matches');

          // All columns must be present
          expect(rankCell).not.toBeNull();
          expect(nameCell).not.toBeNull();
          expect(recordCell).not.toBeNull();
          expect(winrateCell).not.toBeNull();
          expect(matchesCell).not.toBeNull();

          // Each column must have non-empty text content
          expect(rankCell!.textContent!.trim()).not.toBe('');
          expect(nameCell!.textContent!.trim()).not.toBe('');
          expect(recordCell!.textContent!.trim()).not.toBe('');
          expect(winrateCell!.textContent!.trim()).not.toBe('');
          expect(matchesCell!.textContent!.trim()).not.toBe('');

          // Record should match W-L format (digits-digits)
          const recordText = recordCell!.textContent!.trim();
          expect(recordText).toMatch(/^\d+-\d+$/);

          // Win rate should end with %
          const winrateText = winrateCell!.textContent!.trim();
          expect(winrateText).toMatch(/^\d+\.\d+%$/);
        });
      }),
      { numRuns: 100 }
    );
  });
});
