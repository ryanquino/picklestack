import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CourtGrid from './CourtGrid';

// Mock MatchCompleteDialog to avoid complex setup
vi.mock('./MatchCompleteDialog', () => ({
  default: () => <div data-testid="match-complete-dialog">MatchCompleteDialog</div>,
}));

function createCourt(courtNumber: number, status: 'available' | 'active' = 'available') {
  return { sessionId: 'session-1', courtNumber, status };
}

function createActiveMatch(courtNumber: number, players: { id: string; name: string }[]) {
  return {
    id: `match-${courtNumber}`,
    sessionId: 'session-1',
    courtNumber,
    playerIds: players.map((p) => p.id),
    players,
    status: 'active',
    startedAt: new Date(Date.now() - 5 * 60000).toISOString(), // 5 minutes ago
  };
}

const defaultPlayers = [
  { id: 'p1', name: 'Alice Smith' },
  { id: 'p2', name: 'Bob Jones' },
  { id: 'p3', name: 'Charlie Brown' },
  { id: 'p4', name: 'Diana Prince' },
];

const defaultProps = {
  sessionId: 'session-1',
  onStartMatch: vi.fn().mockResolvedValue(undefined),
  onCompleteMatch: vi.fn().mockResolvedValue(undefined),
  onMatchCompleted: vi.fn(),
  onPlayerClick: vi.fn(),
  playerStats: [],
  achievements: [],
  headToHeadRecords: {},
};

describe('CourtGrid - Status Badge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "In Progress" status badge for courts with active matches', () => {
    const courts = [createCourt(1, 'active')];
    const activeMatches = [createActiveMatch(1, defaultPlayers)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={activeMatches}
        queueLength={0}
      />
    );

    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders "Next Up" status badge for the first available court when queue >= 4', () => {
    const courts = [createCourt(1), createCourt(2)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={[]}
        queueLength={4}
      />
    );

    expect(screen.getByText('Next Up')).toBeInTheDocument();
  });

  it('renders "Available" status badge for idle courts', () => {
    const courts = [createCourt(1)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={[]}
        queueLength={0}
      />
    );

    expect(screen.getByText('Available')).toBeInTheDocument();
  });
});

describe('CourtGrid - Team Sections', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders player names in team sections for active matches', () => {
    const courts = [createCourt(1, 'active')];
    const activeMatches = [createActiveMatch(1, defaultPlayers)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={activeMatches}
        queueLength={0}
      />
    );

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    expect(screen.getByText('Diana Prince')).toBeInTheDocument();
  });

  it('renders PlayerAvatar for each player (check aria-label)', () => {
    const courts = [createCourt(1, 'active')];
    const activeMatches = [createActiveMatch(1, defaultPlayers)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={activeMatches}
        queueLength={0}
      />
    );

    expect(screen.getByLabelText('Avatar for Alice Smith')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Bob Jones')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Charlie Brown')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Diana Prince')).toBeInTheDocument();
  });
});

describe('CourtGrid - Action Buttons', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "Complete Match" button only for active matches', () => {
    const courts = [createCourt(1, 'active')];
    const activeMatches = [createActiveMatch(1, defaultPlayers)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={activeMatches}
        queueLength={0}
      />
    );

    expect(screen.getByText('Complete Match')).toBeInTheDocument();
  });

  it('does not render "Complete Match" button for available courts', () => {
    const courts = [createCourt(1)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={[]}
        queueLength={0}
      />
    );

    expect(screen.queryByText('Complete Match')).not.toBeInTheDocument();
  });

  it('renders "Start Match" button for available courts when queue >= 4', () => {
    const courts = [createCourt(1)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={[]}
        queueLength={4}
      />
    );

    expect(screen.getByText('Start Match')).toBeInTheDocument();
  });

  it('shows "Waiting for players" message when queue < 4', () => {
    const courts = [createCourt(1)];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={[]}
        queueLength={2}
      />
    );

    expect(screen.getByText('Waiting for players (2/4)')).toBeInTheDocument();
  });
});


describe('CourtGrid - Fixed Pair Indicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows pair indicator (🔗) when two teammates on the same team are a fixed pair', () => {
    const courts = [createCourt(1, 'active')];
    const activeMatches = [createActiveMatch(1, defaultPlayers)];
    // Team 1 is players[0] and players[1] (Alice and Bob)
    const fixedPairs = [
      {
        id: 'pair-1',
        sessionId: 'session-1',
        player1Id: 'p1',
        player2Id: 'p2',
        createdAt: '2024-01-15T11:00:00Z',
      },
    ];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={activeMatches}
        queueLength={0}
        fixedPairs={fixedPairs}
      />
    );

    const pairIndicators = screen.getAllByLabelText('Fixed pair');
    expect(pairIndicators.length).toBeGreaterThanOrEqual(1);
    expect(pairIndicators[0]).toHaveTextContent('🔗');
  });

  it('does not show pair indicator when teammates are not a fixed pair', () => {
    const courts = [createCourt(1, 'active')];
    const activeMatches = [createActiveMatch(1, defaultPlayers)];
    // No fixed pairs
    const fixedPairs: { id: string; sessionId: string; player1Id: string; player2Id: string; createdAt: string }[] = [];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={activeMatches}
        queueLength={0}
        fixedPairs={fixedPairs}
      />
    );

    expect(screen.queryByLabelText('Fixed pair')).not.toBeInTheDocument();
  });

  it('shows pair indicator only for the team that has the fixed pair', () => {
    const courts = [createCourt(1, 'active')];
    const activeMatches = [createActiveMatch(1, defaultPlayers)];
    // Only team 2 (players[2] and players[3]) are paired
    const fixedPairs = [
      {
        id: 'pair-1',
        sessionId: 'session-1',
        player1Id: 'p3',
        player2Id: 'p4',
        createdAt: '2024-01-15T11:00:00Z',
      },
    ];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={activeMatches}
        queueLength={0}
        fixedPairs={fixedPairs}
      />
    );

    // Should show exactly one pair indicator (for team 2)
    const pairIndicators = screen.getAllByLabelText('Fixed pair');
    expect(pairIndicators).toHaveLength(1);
  });

  it('shows pair indicators for both teams when both teams have fixed pairs', () => {
    const courts = [createCourt(1, 'active')];
    const activeMatches = [createActiveMatch(1, defaultPlayers)];
    // Both teams are paired
    const fixedPairs = [
      {
        id: 'pair-1',
        sessionId: 'session-1',
        player1Id: 'p1',
        player2Id: 'p2',
        createdAt: '2024-01-15T11:00:00Z',
      },
      {
        id: 'pair-2',
        sessionId: 'session-1',
        player1Id: 'p3',
        player2Id: 'p4',
        createdAt: '2024-01-15T11:00:00Z',
      },
    ];

    render(
      <CourtGrid
        {...defaultProps}
        courts={courts}
        activeMatches={activeMatches}
        queueLength={0}
        fixedPairs={fixedPairs}
      />
    );

    const pairIndicators = screen.getAllByLabelText('Fixed pair');
    expect(pairIndicators).toHaveLength(2);
  });
});
