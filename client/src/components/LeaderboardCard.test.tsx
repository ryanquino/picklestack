import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LeaderboardCard from './LeaderboardCard';
import { PlayerStats } from '../types';

function makePlayerStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    playerId: 'p1',
    playerName: 'Alice',
    rating: 1500,
    starRating: 3,
    wins: 2,
    losses: 1,
    matchesPlayed: 3,
    winRate: 66.7,
    streak: 1,
    pointDifferential: 0,
    ...overrides,
  };
}

describe('LeaderboardCard', () => {
  describe('collapse/expand toggle', () => {
    it('renders table body when not collapsed (default state)', () => {
      const stats = [makePlayerStats()];
      render(<LeaderboardCard playerStats={stats} />);

      const toggle = screen.getByRole('button', { name: 'Collapse leaderboard' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('hides table body when toggle is clicked', () => {
      const stats = [makePlayerStats()];
      render(<LeaderboardCard playerStats={stats} />);

      const toggle = screen.getByRole('button', { name: 'Collapse leaderboard' });
      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByLabelText('Expand leaderboard')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows table body again when toggle is clicked twice', () => {
      const stats = [makePlayerStats()];
      render(<LeaderboardCard playerStats={stats} />);

      const toggle = screen.getByRole('button', { name: 'Collapse leaderboard' });
      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole('button', { name: 'Expand leaderboard' }));

      expect(screen.getByRole('button', { name: 'Collapse leaderboard' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  describe('hidden when no players have matches', () => {
    it('returns null when playerStats is empty', () => {
      const { container } = render(<LeaderboardCard playerStats={[]} />);
      expect(container.innerHTML).toBe('');
    });

    it('returns null when all players have zero matchesPlayed', () => {
      const stats = [
        makePlayerStats({ playerId: 'p1', playerName: 'Alice', matchesPlayed: 0 }),
        makePlayerStats({ playerId: 'p2', playerName: 'Bob', matchesPlayed: 0 }),
      ];
      const { container } = render(<LeaderboardCard playerStats={stats} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders when at least one player has matchesPlayed >= 1', () => {
      const stats = [
        makePlayerStats({ playerId: 'p1', playerName: 'Alice', matchesPlayed: 0 }),
        makePlayerStats({ playerId: 'p2', playerName: 'Bob', matchesPlayed: 1 }),
      ];
      render(<LeaderboardCard playerStats={stats} />);
      expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    });
  });

  describe('updates when playerStats prop changes', () => {
    it('re-renders with new player data when props change', () => {
      const initialStats = [
        makePlayerStats({ playerId: 'p1', playerName: 'Alice', matchesPlayed: 2, wins: 1, losses: 1, winRate: 50.0 }),
      ];
      const { rerender } = render(<LeaderboardCard playerStats={initialStats} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('1-1')).toBeInTheDocument();

      const updatedStats = [
        makePlayerStats({ playerId: 'p1', playerName: 'Alice', matchesPlayed: 3, wins: 2, losses: 1, winRate: 66.7 }),
        makePlayerStats({ playerId: 'p2', playerName: 'Bob', matchesPlayed: 1, wins: 1, losses: 0, winRate: 100.0 }),
      ];
      rerender(<LeaderboardCard playerStats={updatedStats} />);

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('2-1')).toBeInTheDocument();
      expect(screen.getByText('1-0')).toBeInTheDocument();
    });

    it('hides the card when updated props have no players with matches', () => {
      const initialStats = [
        makePlayerStats({ playerId: 'p1', playerName: 'Alice', matchesPlayed: 1 }),
      ];
      const { container, rerender } = render(<LeaderboardCard playerStats={initialStats} />);

      expect(screen.getByText('Leaderboard')).toBeInTheDocument();

      const updatedStats = [
        makePlayerStats({ playerId: 'p1', playerName: 'Alice', matchesPlayed: 0 }),
      ];
      rerender(<LeaderboardCard playerStats={updatedStats} />);

      expect(container.innerHTML).toBe('');
    });
  });
});
