import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PlayerProfileCard from './PlayerProfileCard';
import QueueList from './QueueList';

// Mock the API module - PlayerProfileCard fetches player profile data
vi.mock('../api', () => ({
  getPlayerProfile: vi.fn(),
}));

import { getPlayerProfile } from '../api';

const mockedGetPlayerProfile = vi.mocked(getPlayerProfile);

const baseProfile = {
  playerId: 'player-1',
  playerName: 'Alice',
  rating: 1200,
  starRating: 3 as import('../types').StarRating,
  wins: 5,
  losses: 3,
  matchesPlayed: 8,
  winRate: 62.5,
  streak: 1,
  achievements: [],
  matchHistory: [],
  headToHead: [],
};

describe('PlayerProfileCard - Diversity Color Thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetPlayerProfile.mockResolvedValue(baseProfile);
  });

  it('displays diversity in amber color (#d97706) when percentage is below 50%', async () => {
    render(
      <PlayerProfileCard
        sessionId="session-1"
        playerId="player-1"
        onClose={vi.fn()}
        diversityPercentage={30}
      />
    );

    await waitFor(() => {
      const diversityEl = screen.getByTestId('diversity-display');
      expect(diversityEl).toHaveTextContent('Diversity: 30%');
      expect(diversityEl).toHaveStyle({ color: '#d97706' });
    });
  });

  it('displays diversity in green color (#16a34a) when percentage is 50% or above', async () => {
    render(
      <PlayerProfileCard
        sessionId="session-1"
        playerId="player-1"
        onClose={vi.fn()}
        diversityPercentage={50}
      />
    );

    await waitFor(() => {
      const diversityEl = screen.getByTestId('diversity-display');
      expect(diversityEl).toHaveTextContent('Diversity: 50%');
      expect(diversityEl).toHaveStyle({ color: '#16a34a' });
    });
  });

  it('displays "Diversity: 0%" when diversityPercentage is 0', async () => {
    render(
      <PlayerProfileCard
        sessionId="session-1"
        playerId="player-1"
        onClose={vi.fn()}
        diversityPercentage={0}
      />
    );

    await waitFor(() => {
      const diversityEl = screen.getByTestId('diversity-display');
      expect(diversityEl).toHaveTextContent('Diversity: 0%');
      // 0 < 50, so amber
      expect(diversityEl).toHaveStyle({ color: '#d97706' });
    });
  });

  it('displays diversity in green when percentage is 100%', async () => {
    render(
      <PlayerProfileCard
        sessionId="session-1"
        playerId="player-1"
        onClose={vi.fn()}
        diversityPercentage={100}
      />
    );

    await waitFor(() => {
      const diversityEl = screen.getByTestId('diversity-display');
      expect(diversityEl).toHaveTextContent('Diversity: 100%');
      expect(diversityEl).toHaveStyle({ color: '#16a34a' });
    });
  });

  it('displays diversity in amber at 49% (boundary below threshold)', async () => {
    render(
      <PlayerProfileCard
        sessionId="session-1"
        playerId="player-1"
        onClose={vi.fn()}
        diversityPercentage={49}
      />
    );

    await waitFor(() => {
      const diversityEl = screen.getByTestId('diversity-display');
      expect(diversityEl).toHaveTextContent('Diversity: 49%');
      expect(diversityEl).toHaveStyle({ color: '#d97706' });
    });
  });
});

// --- QueueList Wait Estimates ---

import type { StarRating } from '../types';

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

function makeEntry(overrides: Partial<QueueEntry> & { playerId: string; playerName: string; position: number }): QueueEntry {
  return {
    rating: 1000,
    starRating: 3 as StarRating,
    wins: 5,
    losses: 3,
    streak: 0,
    ...overrides,
  };
}

const defaultQueueProps = {
  onMoveUp: vi.fn().mockResolvedValue(undefined),
  onMoveDown: vi.fn().mockResolvedValue(undefined),
  onRemove: vi.fn().mockResolvedValue(undefined),
};

describe('QueueList - Wait Estimates Display', () => {
  it('displays "You\'re up in ~5 min" when waitEstimate is 5', () => {
    const queue = [
      makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
    ];
    const waitEstimates: Record<string, number | null> = { p1: 5 };

    render(
      <QueueList queue={queue} waitEstimates={waitEstimates} {...defaultQueueProps} />
    );

    expect(screen.getByText("You're up in ~5 min")).toBeInTheDocument();
  });

  it('displays "You\'re up next!" when waitEstimate is 1 (less than 2)', () => {
    const queue = [
      makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
    ];
    const waitEstimates: Record<string, number | null> = { p1: 1 };

    render(
      <QueueList queue={queue} waitEstimates={waitEstimates} {...defaultQueueProps} />
    );

    expect(screen.getByText("You're up next!")).toBeInTheDocument();
  });

  it('does not display countdown when waitEstimate is null', () => {
    const queue = [
      makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
    ];
    const waitEstimates: Record<string, number | null> = { p1: null };

    render(
      <QueueList queue={queue} waitEstimates={waitEstimates} {...defaultQueueProps} />
    );

    expect(screen.queryByText(/You're up/)).not.toBeInTheDocument();
  });

  it('does not display countdown when waitEstimates is not provided', () => {
    const queue = [
      makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
    ];

    render(
      <QueueList queue={queue} {...defaultQueueProps} />
    );

    expect(screen.queryByText(/You're up/)).not.toBeInTheDocument();
  });

  it('displays "You\'re up next!" when waitEstimate is exactly 1', () => {
    const queue = [
      makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
      makeEntry({ playerId: 'p2', playerName: 'Bob', position: 1 }),
    ];
    const waitEstimates: Record<string, number | null> = { p1: 1, p2: 8 };

    render(
      <QueueList queue={queue} waitEstimates={waitEstimates} {...defaultQueueProps} />
    );

    expect(screen.getByText("You're up next!")).toBeInTheDocument();
    expect(screen.getByText("You're up in ~8 min")).toBeInTheDocument();
  });

  it('displays "You\'re up in ~2 min" when waitEstimate is exactly 2 (boundary)', () => {
    const queue = [
      makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
    ];
    const waitEstimates: Record<string, number | null> = { p1: 2 };

    render(
      <QueueList queue={queue} waitEstimates={waitEstimates} {...defaultQueueProps} />
    );

    // 2 is NOT less than 2, so should show countdown format
    expect(screen.getByText("You're up in ~2 min")).toBeInTheDocument();
    expect(screen.queryByText("You're up next!")).not.toBeInTheDocument();
  });
});

describe('QueueList - Diversity Display', () => {
  it('displays diversity percentage next to player name', () => {
    const queue = [
      makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
      makeEntry({ playerId: 'p2', playerName: 'Bob', position: 1 }),
    ];
    const diversity: Record<string, number> = { p1: 45, p2: 72 };

    render(
      <QueueList queue={queue} diversity={diversity} {...defaultQueueProps} />
    );

    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('has correct aria-label for diversity percentage', () => {
    const queue = [
      makeEntry({ playerId: 'p1', playerName: 'Alice', position: 0 }),
    ];
    const diversity: Record<string, number> = { p1: 60 };

    render(
      <QueueList queue={queue} diversity={diversity} {...defaultQueueProps} />
    );

    expect(screen.getByLabelText('Diversity 60%')).toBeInTheDocument();
  });
});
