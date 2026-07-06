import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import QueueList from './QueueList';
import type { StarRating, GameMode, MatchingMode } from '../types';

// Mock PlayerProfileCard since it fetches data and uses a modal
vi.mock('./PlayerProfileCard', () => ({
  default: () => <div data-testid="player-profile-card" />,
}));

interface QueueEntry {
  playerId: string;
  position: number;
  playerName: string;
  rating?: number;
  starRating?: StarRating;
  wins?: number;
  losses?: number;
  streak?: number;
  isPairSlot?: boolean;
  pairId?: string | null;
  partnerPlayerId?: string | null;
  partnerPlayerName?: string | null;
}

function makeEntry(overrides: Partial<QueueEntry> & { playerId: string; playerName: string; position: number }): QueueEntry {
  return {
    rating: 1000,
    starRating: 3,
    wins: 5,
    losses: 3,
    streak: 0,
    ...overrides,
  };
}

const defaultProps = {
  onMoveUp: vi.fn().mockResolvedValue(undefined),
  onMoveDown: vi.fn().mockResolvedValue(undefined),
  onRemove: vi.fn().mockResolvedValue(undefined),
};

describe('QueueList', () => {
  describe('player entry rendering', () => {
    it('renders numbered position badge for each player', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
        makeEntry({ playerId: 'p2', playerName: 'Bob', position: 1 }),
        makeEntry({ playerId: 'p3', playerName: 'Charlie', position: 2 }),
      ];

      const { container } = render(<QueueList queue={queue} {...defaultProps} />);

      const badges = container.querySelectorAll('.queue-position');
      expect(badges).toHaveLength(3);
      expect(badges[0].textContent).toBe('1');
      expect(badges[1].textContent).toBe('2');
      expect(badges[2].textContent).toBe('3');
    });

    it('renders PlayerAvatar with correct aria-label for each player', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice Smith', position: 0 }),
        makeEntry({ playerId: 'p2', playerName: 'Bob Jones', position: 1 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.getByLabelText('Avatar for Alice Smith')).toBeInTheDocument();
      expect(screen.getByLabelText('Avatar for Bob Jones')).toBeInTheDocument();
    });

    it('renders star rating icons for each player', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0, starRating: 4 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.getByLabelText('4 out of 5 stars')).toBeInTheDocument();
    });

    it('renders numeric rating value', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0, rating: 1250 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.getByText('1250')).toBeInTheDocument();
    });

    it('renders W-L record', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0, wins: 5, losses: 3 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.getByText('5-3')).toBeInTheDocument();
    });
  });

  describe('On Deck highlighting', () => {
    it('applies queue-item--on-deck class to On Deck players in smart mode', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
        makeEntry({ playerId: 'p2', playerName: 'Bob', position: 1 }),
        makeEntry({ playerId: 'p3', playerName: 'Charlie', position: 2 }),
      ];

      const { container } = render(
        <QueueList queue={queue} gameMode="doubles" matchingMode="smart" {...defaultProps} />
      );

      const items = container.querySelectorAll('.queue-item');
      // Smart mode: min(3, 8) = 3, all should be on deck
      items.forEach((item) => {
        expect(item).toHaveClass('queue-item--on-deck');
      });
    });

    it('applies queue-item--on-deck only to first 4 players in non-smart doubles mode', () => {
      const queue = Array.from({ length: 6 }, (_, i) =>
        makeEntry({ playerId: `p${i}`, playerName: `Player ${i}`, position: i })
      );

      const { container } = render(
        <QueueList queue={queue} gameMode="doubles" matchingMode="queue" {...defaultProps} />
      );

      const items = container.querySelectorAll('.queue-item');
      // Non-smart doubles: first 4 on deck
      for (let i = 0; i < 4; i++) {
        expect(items[i]).toHaveClass('queue-item--on-deck');
      }
      for (let i = 4; i < 6; i++) {
        expect(items[i]).not.toHaveClass('queue-item--on-deck');
      }
    });

    it('applies queue-item--on-deck only to first 2 players in non-smart singles mode', () => {
      const queue = Array.from({ length: 4 }, (_, i) =>
        makeEntry({ playerId: `p${i}`, playerName: `Player ${i}`, position: i })
      );

      const { container } = render(
        <QueueList queue={queue} gameMode="singles" matchingMode="queue" {...defaultProps} />
      );

      const items = container.querySelectorAll('.queue-item');
      // Non-smart singles: first 2 on deck
      expect(items[0]).toHaveClass('queue-item--on-deck');
      expect(items[1]).toHaveClass('queue-item--on-deck');
      expect(items[2]).not.toHaveClass('queue-item--on-deck');
      expect(items[3]).not.toHaveClass('queue-item--on-deck');
    });
  });

  describe('streak badges', () => {
    it('shows fire emoji streak badge when win streak >= 2', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0, streak: 3 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.getByLabelText('3 win streak')).toBeInTheDocument();
      expect(screen.getByText(/🔥/)).toBeInTheDocument();
    });

    it('shows snowflake emoji streak badge when loss streak >= 2', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0, streak: -2 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.getByLabelText('2 loss streak')).toBeInTheDocument();
      expect(screen.getByText(/❄️/)).toBeInTheDocument();
    });

    it('does not show streak badge when streak < 2', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0, streak: 1 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.queryByText(/🔥/)).not.toBeInTheDocument();
      expect(screen.queryByText(/❄️/)).not.toBeInTheDocument();
    });

    it('does not show streak badge when streak is 0', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0, streak: 0 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.queryByText(/🔥/)).not.toBeInTheDocument();
      expect(screen.queryByText(/❄️/)).not.toBeInTheDocument();
    });
  });

  describe('queue management buttons', () => {
    it('renders move up, move down, and remove buttons for each player', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
        makeEntry({ playerId: 'p2', playerName: 'Bob', position: 1 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      // Alice's buttons
      expect(screen.getByLabelText('Move Alice up')).toBeInTheDocument();
      expect(screen.getByLabelText('Move Alice down')).toBeInTheDocument();
      expect(screen.getByLabelText('Remove Alice')).toBeInTheDocument();

      // Bob's buttons
      expect(screen.getByLabelText('Move Bob up')).toBeInTheDocument();
      expect(screen.getByLabelText('Move Bob down')).toBeInTheDocument();
      expect(screen.getByLabelText('Remove Bob')).toBeInTheDocument();
    });

    it('disables move up button for the first player', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
        makeEntry({ playerId: 'p2', playerName: 'Bob', position: 1 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.getByLabelText('Move Alice up')).toBeDisabled();
      expect(screen.getByLabelText('Move Bob up')).not.toBeDisabled();
    });

    it('disables move down button for the last player', () => {
      const queue = [
        makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
        makeEntry({ playerId: 'p2', playerName: 'Bob', position: 1 }),
      ];

      render(<QueueList queue={queue} {...defaultProps} />);

      expect(screen.getByLabelText('Move Alice down')).not.toBeDisabled();
      expect(screen.getByLabelText('Move Bob down')).toBeDisabled();
    });
  });
});


describe('QueueList - Pair Slot Display', () => {
  it('renders pair slot with link icon when isPairSlot is true', () => {
    const queue = [
      makeEntry({
        playerId: 'p1',
        playerName: 'Alice',
        position: 0,
        isPairSlot: true,
        pairId: 'pair-1',
        partnerPlayerId: 'p2',
        partnerPlayerName: 'Bob',
      }),
    ];

    render(<QueueList queue={queue} {...defaultProps} />);

    expect(screen.getByLabelText('Fixed pair')).toBeInTheDocument();
    expect(screen.getByText('🔗')).toBeInTheDocument();
  });

  it('renders both player names for a pair slot', () => {
    const queue = [
      makeEntry({
        playerId: 'p1',
        playerName: 'Alice',
        position: 0,
        isPairSlot: true,
        pairId: 'pair-1',
        partnerPlayerId: 'p2',
        partnerPlayerName: 'Bob',
      }),
    ];

    render(<QueueList queue={queue} {...defaultProps} />);

    // The display name should show "Alice & Bob"
    expect(screen.getByText('Alice & Bob')).toBeInTheDocument();
  });

  it('applies queue-item--pair class to pair slot entries', () => {
    const queue = [
      makeEntry({
        playerId: 'p1',
        playerName: 'Alice',
        position: 0,
        isPairSlot: true,
        pairId: 'pair-1',
        partnerPlayerId: 'p2',
        partnerPlayerName: 'Bob',
      }),
      makeEntry({
        playerId: 'p3',
        playerName: 'Charlie',
        position: 1,
      }),
    ];

    const { container } = render(<QueueList queue={queue} {...defaultProps} />);

    const items = container.querySelectorAll('.queue-item');
    expect(items[0]).toHaveClass('queue-item--pair');
    expect(items[1]).not.toHaveClass('queue-item--pair');
  });

  it('does not render link icon for individual player entries', () => {
    const queue = [
      makeEntry({
        playerId: 'p1',
        playerName: 'Alice',
        position: 0,
      }),
    ];

    render(<QueueList queue={queue} {...defaultProps} />);

    expect(screen.queryByLabelText('Fixed pair')).not.toBeInTheDocument();
  });

  it('renders aria-label with paired indication for pair slots', () => {
    const queue = [
      makeEntry({
        playerId: 'p1',
        playerName: 'Alice',
        position: 0,
        isPairSlot: true,
        pairId: 'pair-1',
        partnerPlayerId: 'p2',
        partnerPlayerName: 'Bob',
      }),
    ];

    render(<QueueList queue={queue} {...defaultProps} />);

    expect(screen.getByLabelText('View profile for Alice and Bob (paired)')).toBeInTheDocument();
  });
});
