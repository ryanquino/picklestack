import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import QueuePanel from './QueuePanel';
import type { StarRating } from '../types';

// Mock QueueList to isolate QueuePanel tests
vi.mock('./QueueList', () => ({
  default: () => <div data-testid="queue-list" />,
}));

// Mock CheckInForm to isolate QueuePanel tests
vi.mock('./CheckInForm', () => ({
  default: () => <div data-testid="check-in-form" />,
}));

const defaultProps = {
  queue: [
    { playerId: 'p1', sessionId: 's1', position: 0, playerName: 'Alice', rating: 1000, starRating: 3 as StarRating, wins: 5, losses: 3 },
    { playerId: 'p2', sessionId: 's1', position: 1, playerName: 'Bob', rating: 1100, starRating: 4 as StarRating, wins: 7, losses: 2 },
    { playerId: 'p3', sessionId: 's1', position: 2, playerName: 'Charlie', rating: 900, starRating: 2 as StarRating, wins: 2, losses: 4 },
  ],
  sessionId: 's1',
  gameMode: 'doubles' as const,
  matchingMode: 'smart' as const,
  onMoveUp: vi.fn().mockResolvedValue(undefined),
  onMoveDown: vi.fn().mockResolvedValue(undefined),
  onRemove: vi.fn().mockResolvedValue(undefined),
  onPlayerClick: vi.fn(),
  onCheckIn: vi.fn().mockResolvedValue(undefined),
};

describe('QueuePanel', () => {
  it('renders "QUEUE" header text', () => {
    render(<QueuePanel {...defaultProps} />);

    expect(screen.getByText('QUEUE')).toBeInTheDocument();
  });

  it('renders player count badge', () => {
    render(<QueuePanel {...defaultProps} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders "Add Player" button', () => {
    render(<QueuePanel {...defaultProps} />);

    expect(screen.getByLabelText('Add player')).toBeInTheDocument();
    expect(screen.getByText('Add Player')).toBeInTheDocument();
  });
});
