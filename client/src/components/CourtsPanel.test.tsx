import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CourtsPanel from './CourtsPanel';
import type { PlayerStats } from '../types';

// Mock MatchCompleteDialog to avoid complex setup
vi.mock('./MatchCompleteDialog', () => ({
  default: () => <div data-testid="match-complete-dialog">MatchCompleteDialog</div>,
}));

function createCourt(courtNumber: number, status: 'available' | 'active' = 'available') {
  return { sessionId: 'session-1', courtNumber, status };
}

function createActiveMatch(courtNumber: number) {
  return {
    id: `match-${courtNumber}`,
    sessionId: 'session-1',
    courtNumber,
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    players: [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Charlie' },
      { id: 'p4', name: 'Diana' },
    ],
    status: 'active',
    startedAt: new Date(Date.now() - 3 * 60000).toISOString(),
  };
}

function createPlayerStats(playerId: string, playerName: string, rating: number): PlayerStats {
  return {
    playerId,
    playerName,
    rating,
    starRating: 3,
    wins: 2,
    losses: 1,
    matchesPlayed: 3,
    winRate: 66.7,
    streak: 1,
    pointDifferential: 0,
  };
}

const defaultProps = {
  sessionId: 'session-1',
  courts: [createCourt(1), createCourt(2)],
  activeMatches: [] as ReturnType<typeof createActiveMatch>[],
  queueLength: 0,
  playerStats: [],
  achievements: [],
  headToHeadRecords: {},
  onStartMatch: vi.fn().mockResolvedValue(undefined),
  onCompleteMatch: vi.fn().mockResolvedValue(undefined),
  onMatchCompleted: vi.fn(),
  onPlayerClick: vi.fn(),
};

describe('CourtsPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "COURTS" header text', () => {
    render(<CourtsPanel {...defaultProps} />);

    expect(screen.getByText('COURTS')).toBeInTheDocument();
  });

  it('renders active match count', () => {
    const activeMatches = [createActiveMatch(1), createActiveMatch(2)];

    render(
      <CourtsPanel
        {...defaultProps}
        courts={[createCourt(1, 'active'), createCourt(2, 'active')]}
        activeMatches={activeMatches}
      />
    );

    expect(screen.getByText('2 active matches')).toBeInTheDocument();
  });

  it('renders singular "match" when only 1 active match', () => {
    const activeMatches = [createActiveMatch(1)];

    render(
      <CourtsPanel
        {...defaultProps}
        courts={[createCourt(1, 'active'), createCourt(2)]}
        activeMatches={activeMatches}
      />
    );

    expect(screen.getByText('1 active match')).toBeInTheDocument();
  });

  it('displays player avatars in court cards', () => {
    const activeMatches = [createActiveMatch(1)];

    render(
      <CourtsPanel
        {...defaultProps}
        courts={[createCourt(1, 'active')]}
        activeMatches={activeMatches}
      />
    );

    expect(screen.getByLabelText('Avatar for Alice')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Bob')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Charlie')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Diana')).toBeInTheDocument();
  });

  it('displays numeric ratings alongside player names', () => {
    const activeMatches = [createActiveMatch(1)];
    const playerStats = [
      createPlayerStats('p1', 'Alice', 1250),
      createPlayerStats('p2', 'Bob', 1180),
      createPlayerStats('p3', 'Charlie', 1320),
      createPlayerStats('p4', 'Diana', 1100),
    ];

    render(
      <CourtsPanel
        {...defaultProps}
        courts={[createCourt(1, 'active')]}
        activeMatches={activeMatches}
        playerStats={playerStats}
      />
    );

    expect(screen.getByText('1250')).toBeInTheDocument();
    expect(screen.getByText('1180')).toBeInTheDocument();
    expect(screen.getByText('1320')).toBeInTheDocument();
    expect(screen.getByText('1100')).toBeInTheDocument();
  });

  it('displays VS divider between teams', () => {
    const activeMatches = [createActiveMatch(1)];

    render(
      <CourtsPanel
        {...defaultProps}
        courts={[createCourt(1, 'active')]}
        activeMatches={activeMatches}
      />
    );

    expect(screen.getByText('VS')).toBeInTheDocument();
  });
});
