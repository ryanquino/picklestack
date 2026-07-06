import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrganizerDashboard from './OrganizerDashboard';
import { getSession, getLeaderboard, getSessionAchievements } from '../api';

vi.mock('../api', () => ({
  getSession: vi.fn(),
  getLeaderboard: vi.fn(),
  getSessionAchievements: vi.fn(),
  addPlayer: vi.fn(),
  removePlayer: vi.fn(),
  movePlayer: vi.fn(),
  startMatch: vi.fn(),
  completeMatch: vi.fn(),
  endSession: vi.fn(),
  setPairingMode: vi.fn(),
}));

vi.mock('../components/PlayerProfileCard', () => ({ default: () => null }));
vi.mock('../components/SessionSettingsModal', () => ({ default: () => null }));

vi.mock('qrcode', () => ({ default: { toString: vi.fn().mockResolvedValue('<svg></svg>') } }));

const mockedGetSession = vi.mocked(getSession);
const mockedGetLeaderboard = vi.mocked(getLeaderboard);
const mockedGetSessionAchievements = vi.mocked(getSessionAchievements);

function renderDashboard(sessionId = 'session-1') {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}`]}>
      <Routes>
        <Route path="/session/:sessionId" element={<OrganizerDashboard />} />
      </Routes>
    </MemoryRouter>
  );
}

const activeSessionData = {
  session: {
    id: 'session-1',
    name: 'Test Session',
    courtCount: 2,
    status: 'active',
    liveViewUrl: 'http://localhost:3000/live/session-1',
    gameMode: 'doubles' as const,
    matchingMode: 'smart' as const,
  },
  queue: [],
  courts: [],
  activeMatches: [],
  playerStats: [
    {
      playerId: 'p1',
      playerName: 'Alice',
      rating: 1200,
      starRating: 4,
      wins: 3,
      losses: 1,
      matchesPlayed: 4,
      winRate: 75,
      streak: 2,
    },
  ],
  achievements: [],
};

const endedSessionData = {
  session: {
    id: 'session-1',
    name: 'Test Session',
    courtCount: 2,
    status: 'ended',
    liveViewUrl: 'http://localhost:3000/live/session-1',
    gameMode: 'doubles' as const,
    matchingMode: 'smart' as const,
  },
  queue: [],
  courts: [],
  activeMatches: [],
  playerStats: [
    {
      playerId: 'p1',
      playerName: 'Alice',
      rating: 1200,
      starRating: 4,
      wins: 3,
      losses: 1,
      matchesPlayed: 4,
      winRate: 75,
      streak: 2,
    },
  ],
  achievements: [],
};

describe('OrganizerDashboard - Conditional Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSessionAchievements.mockResolvedValue([]);
  });

  describe('Active session shows live URL bar, copy button, and QR code', () => {
    it('renders .live-url-bar when session is active', async () => {
      mockedGetSession.mockResolvedValue(activeSessionData as any);
      renderDashboard();

      await waitFor(() => {
        const liveUrlBar = document.querySelector('.live-url-bar');
        expect(liveUrlBar).toBeInTheDocument();
      });
    });

    it('renders copy button when session is active', async () => {
      mockedGetSession.mockResolvedValue(activeSessionData as any);
      renderDashboard();

      await waitFor(() => {
        const copyBtn = screen.getByRole('button', { name: /copy live view url/i });
        expect(copyBtn).toBeInTheDocument();
      });
    });

    it('renders QRCodeDisplay when session is active', async () => {
      mockedGetSession.mockResolvedValue(activeSessionData as any);
      renderDashboard();

      await waitFor(() => {
        const qrCode = screen.getByLabelText(/qr code for/i);
        expect(qrCode).toBeInTheDocument();
      });
    });
  });

  describe('Ended session hides live URL bar, copy button, and QR code', () => {
    it('does NOT render .live-url-bar when session is ended', async () => {
      mockedGetSession.mockResolvedValue(endedSessionData as any);
      mockedGetLeaderboard.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const liveUrlBar = document.querySelector('.live-url-bar');
      expect(liveUrlBar).not.toBeInTheDocument();
    });

    it('does NOT render copy button when session is ended', async () => {
      mockedGetSession.mockResolvedValue(endedSessionData as any);
      mockedGetLeaderboard.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const copyBtn = screen.queryByRole('button', { name: /copy live view url/i });
      expect(copyBtn).not.toBeInTheDocument();
    });

    it('does NOT render QRCodeDisplay when session is ended', async () => {
      mockedGetSession.mockResolvedValue(endedSessionData as any);
      mockedGetLeaderboard.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const qrCode = screen.queryByLabelText(/qr code for/i);
      expect(qrCode).not.toBeInTheDocument();
    });
  });

  describe('LeaderboardCard shows during active session', () => {
    it('renders .leaderboard-card when session is active and playerStats have matches', async () => {
      mockedGetSession.mockResolvedValue(activeSessionData as any);
      renderDashboard();

      await waitFor(() => {
        const leaderboardCard = document.querySelector('.leaderboard-card');
        expect(leaderboardCard).toBeInTheDocument();
      });
    });
  });

  describe('Full leaderboard shows after session ends', () => {
    it('renders full Leaderboard when session is ended and leaderboard entries exist', async () => {
      const leaderboardEntries = [
        {
          playerId: 'p1',
          playerName: 'Alice',
          rating: 1200,
          starRating: 4,
          wins: 3,
          losses: 1,
          matchesPlayed: 4,
          winRate: 75,
          streak: 2,
          rank: 1,
          isMvp: true,
          achievements: [],
        },
      ];

      mockedGetSession.mockResolvedValue(endedSessionData as any);
      mockedGetLeaderboard.mockResolvedValue(leaderboardEntries as any);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Session Leaderboard')).toBeInTheDocument();
      });
    });

    it('does NOT render .leaderboard-card when session is ended', async () => {
      mockedGetSession.mockResolvedValue(endedSessionData as any);
      mockedGetLeaderboard.mockResolvedValue([]);
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const leaderboardCard = document.querySelector('.leaderboard-card');
      expect(leaderboardCard).not.toBeInTheDocument();
    });
  });
});
