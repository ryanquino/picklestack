import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LiveView from './LiveView';
import { getSessionLive } from '../api';

vi.mock('../api', () => ({
  getSessionLive: vi.fn(),
}));

vi.mock('../components/PlayerProfileCard', () => ({
  default: () => null,
}));

const mockedGetSessionLive = vi.mocked(getSessionLive);

function renderLiveView(sessionId = 'session-1') {
  return render(
    <MemoryRouter initialEntries={[`/live/${sessionId}`]}>
      <Routes>
        <Route path="/live/:sessionId" element={<LiveView />} />
      </Routes>
    </MemoryRouter>
  );
}

const activeSessionData = {
  session: {
    id: 'session-1',
    name: 'Friday Night Pickleball',
    status: 'active',
    courtCount: 2,
    gameMode: 'doubles' as const,
    matchingMode: 'smart' as const,
  },
  queue: [
    {
      playerId: 'p1',
      playerName: 'Alice',
      position: 1,
      isUpNext: true,
      rating: 1200,
      starRating: 4 as const,
      wins: 3,
      losses: 1,
      winRate: 75,
      streak: 2,
      isMvp: false,
      achievements: [],
    },
    {
      playerId: 'p2',
      playerName: 'Bob',
      position: 2,
      isUpNext: true,
      rating: 1100,
      starRating: 3 as const,
      wins: 2,
      losses: 2,
      winRate: 50,
      streak: 0,
      isMvp: false,
      achievements: [],
    },
    {
      playerId: 'p3',
      playerName: 'Carol',
      position: 3,
      isUpNext: true,
      rating: 1050,
      starRating: 3 as const,
      wins: 1,
      losses: 3,
      winRate: 25,
      streak: -1,
      isMvp: false,
      achievements: [],
    },
    {
      playerId: 'p4',
      playerName: 'Dave',
      position: 4,
      isUpNext: true,
      rating: 1000,
      starRating: 2 as const,
      wins: 0,
      losses: 1,
      winRate: 0,
      streak: -1,
      isMvp: false,
      achievements: [],
    },
    {
      playerId: 'p5',
      playerName: 'Eve',
      position: 5,
      isUpNext: false,
      rating: 950,
      starRating: 2 as const,
      wins: 1,
      losses: 1,
      winRate: 50,
      streak: 0,
      isMvp: false,
      achievements: [],
    },
  ],
  courts: [
    { sessionId: 'session-1', courtNumber: 1, status: 'active' as const },
    { sessionId: 'session-1', courtNumber: 2, status: 'available' as const },
  ],
  activeMatches: [
    {
      id: 'match-1',
      courtNumber: 1,
      players: [
        {
          id: 'p10',
          name: 'Frank',
          rating: 1300,
          starRating: 5 as const,
          wins: 5,
          losses: 1,
          winRate: 83,
          streak: 3,
          isMvp: true,
          achievements: [],
        },
        {
          id: 'p11',
          name: 'Grace',
          rating: 1250,
          starRating: 4 as const,
          wins: 4,
          losses: 2,
          winRate: 67,
          streak: 1,
          isMvp: false,
          achievements: [],
        },
        {
          id: 'p12',
          name: 'Hank',
          rating: 1150,
          starRating: 3 as const,
          wins: 3,
          losses: 3,
          winRate: 50,
          streak: 0,
          isMvp: false,
          achievements: [],
        },
        {
          id: 'p13',
          name: 'Ivy',
          rating: 1100,
          starRating: 3 as const,
          wins: 2,
          losses: 4,
          winRate: 33,
          streak: -2,
          isMvp: false,
          achievements: [],
        },
      ],
      status: 'active',
      startedAt: '2024-01-01T10:00:00Z',
    },
  ],
  playerStats: [],
  achievements: [],
  onDeckPlayerIds: ['p1', 'p2', 'p3', 'p4'],
};

const endedSessionData = {
  session: {
    id: 'session-1',
    name: 'Saturday Tournament',
    status: 'ended',
    courtCount: 2,
    gameMode: 'doubles' as const,
    matchingMode: 'smart' as const,
  },
  queue: [
    {
      playerId: 'p1',
      playerName: 'Alice',
      position: 1,
      isUpNext: false,
      rating: 1200,
      starRating: 4 as const,
      wins: 5,
      losses: 2,
      winRate: 71,
      streak: 2,
      isMvp: true,
      achievements: [],
    },
  ],
  courts: [],
  activeMatches: [],
  playerStats: [
    {
      playerId: 'p1',
      playerName: 'Alice',
      rating: 1200,
      wins: 5,
      losses: 2,
      matchesPlayed: 7,
      winRate: 71,
    },
  ],
  achievements: [],
  onDeckPlayerIds: [],
};

describe('LiveView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Active session - court cards with avatars and ratings', () => {
    it('renders court cards with .court-card class', async () => {
      mockedGetSessionLive.mockResolvedValue(activeSessionData as any);
      renderLiveView();

      await waitFor(() => {
        const courtCards = document.querySelectorAll('.court-card');
        expect(courtCards.length).toBeGreaterThan(0);
      });
    });

    it('renders PlayerAvatar for each player on court (aria-label "Avatar for {name}")', async () => {
      mockedGetSessionLive.mockResolvedValue(activeSessionData as any);
      renderLiveView();

      await waitFor(() => {
        expect(screen.getByLabelText('Avatar for Frank')).toBeInTheDocument();
        expect(screen.getByLabelText('Avatar for Grace')).toBeInTheDocument();
        expect(screen.getByLabelText('Avatar for Hank')).toBeInTheDocument();
        expect(screen.getByLabelText('Avatar for Ivy')).toBeInTheDocument();
      });
    });

    it('displays player names on court cards (ratings removed)', async () => {
      mockedGetSessionLive.mockResolvedValue(activeSessionData as any);
      renderLiveView();

      await waitFor(() => {
        const courtsSection = screen.getByLabelText('Active courts');
        expect(courtsSection).toBeInTheDocument();
        // Ratings are no longer displayed in court cards
        const ratingValues = courtsSection.querySelectorAll('.court-card__rating-value');
        expect(ratingValues.length).toBe(0);
        // But player names are still shown
        expect(screen.getByLabelText('View profile for Frank')).toBeInTheDocument();
        expect(screen.getByLabelText('View profile for Ivy')).toBeInTheDocument();
      });
    });

    it('renders VS divider between teams', async () => {
      mockedGetSessionLive.mockResolvedValue(activeSessionData as any);
      renderLiveView();

      await waitFor(() => {
        expect(screen.getByText('VS')).toBeInTheDocument();
      });
    });
  });

  describe('Active session - LIVE badge with pulse animation', () => {
    it('renders LiveSessionHeader with LIVE badge (aria-label "Session is live")', async () => {
      mockedGetSessionLive.mockResolvedValue(activeSessionData as any);
      renderLiveView();

      await waitFor(() => {
        const badge = screen.getByLabelText('Session is live');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('LIVE');
      });
    });

    it('LIVE badge has .live-session-header__badge--pulse class', async () => {
      mockedGetSessionLive.mockResolvedValue(activeSessionData as any);
      renderLiveView();

      await waitFor(() => {
        const badge = screen.getByLabelText('Session is live');
        expect(badge).toHaveClass('live-session-header__badge--pulse');
      });
    });
  });

  describe('Active session - On Deck indicator', () => {
    it('on-deck players have .live-view__queue-item--on-deck class', async () => {
      mockedGetSessionLive.mockResolvedValue(activeSessionData as any);
      renderLiveView();

      await waitFor(() => {
        const onDeckItems = document.querySelectorAll('.live-view__queue-item--on-deck');
        expect(onDeckItems.length).toBeGreaterThan(0);
      });
    });

    it('on-deck section shows "Up Next" heading', async () => {
      mockedGetSessionLive.mockResolvedValue(activeSessionData as any);
      renderLiveView();

      await waitFor(() => {
        expect(screen.getByText('Up Next')).toBeInTheDocument();
      });
    });
  });

  describe('Ended session - card-based styling', () => {
    it('ended banner has .live-view__ended-banner with .card class', async () => {
      mockedGetSessionLive.mockResolvedValue(endedSessionData as any);
      renderLiveView();

      await waitFor(() => {
        const banner = document.querySelector('.live-view__ended-banner');
        expect(banner).not.toBeNull();
        expect(banner).toHaveClass('card');
      });
    });
  });
});
