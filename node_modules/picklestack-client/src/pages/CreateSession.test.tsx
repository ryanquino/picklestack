import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreateSession from './CreateSession';

/**
 * Unit tests for CreateSession single-page flow.
 *
 * Validates: Requirements 7.1, 7.2, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15
 */

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api', () => ({
  createSession: vi.fn(),
  updateSessionSettings: vi.fn(),
  addPlayer: vi.fn(),
}));

import { createSession, updateSessionSettings, addPlayer } from '../api';

const mockCreateSession = createSession as ReturnType<typeof vi.fn>;
const mockUpdateSessionSettings = updateSessionSettings as ReturnType<typeof vi.fn>;
const mockAddPlayer = addPlayer as ReturnType<typeof vi.fn>;

function renderCreateSession() {
  return render(
    <MemoryRouter>
      <CreateSession />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateSession - Single-Page Flow', () => {
  describe('Three section cards render on a single page (no modal)', () => {
    it('renders three .card elements', () => {
      const { container } = renderCreateSession();
      const cards = container.querySelectorAll('.card');
      expect(cards).toHaveLength(3);
    });

    it('renders Basic Info card with title', () => {
      renderCreateSession();
      expect(screen.getByText('Basic Info')).toBeInTheDocument();
    });

    it('renders Game Settings card with title', () => {
      renderCreateSession();
      expect(screen.getByText('Game Settings')).toBeInTheDocument();
    });

    it('renders Player Check-In card with title', () => {
      renderCreateSession();
      expect(screen.getByText('Player Check-In')).toBeInTheDocument();
    });
  });

  describe('Each section card has a title and informational description', () => {
    it('Basic Info card has a description', () => {
      const { container } = renderCreateSession();
      const descriptions = container.querySelectorAll('.create-session__card-description');
      const basicInfoDesc = Array.from(descriptions).find((el) =>
        el.textContent?.includes('Name your session and configure your courts')
      );
      expect(basicInfoDesc).toBeInTheDocument();
    });

    it('Game Settings card has a description', () => {
      const { container } = renderCreateSession();
      const descriptions = container.querySelectorAll('.create-session__card-description');
      const gameSettingsDesc = Array.from(descriptions).find((el) =>
        el.textContent?.includes('Choose how matches are organized')
      );
      expect(gameSettingsDesc).toBeInTheDocument();
    });

    it('Player Check-In card has a description', () => {
      const { container } = renderCreateSession();
      const descriptions = container.querySelectorAll('.create-session__card-description');
      const playerCheckInDesc = Array.from(descriptions).find((el) =>
        el.textContent?.includes('Add players who are here and ready to play')
      );
      expect(playerCheckInDesc).toBeInTheDocument();
    });
  });

  describe('Each setting has descriptive helper text visible in the DOM', () => {
    it('renders helper text elements for all fields', () => {
      const { container } = renderCreateSession();
      const helpers = container.querySelectorAll('.create-session__helper');
      // Session name, court name, court count, session type, game mode, matching mode, player name = 7
      expect(helpers.length).toBeGreaterThanOrEqual(7);
    });

    it('session name has helper text', () => {
      renderCreateSession();
      expect(
        screen.getByText('Give your session a name so players can find it easily')
      ).toBeInTheDocument();
    });

    it('court name has helper text', () => {
      renderCreateSession();
      expect(
        screen.getByText(/Optionally name your court area/)
      ).toBeInTheDocument();
    });

    it('court count has helper text', () => {
      renderCreateSession();
      expect(
        screen.getByText(/How many courts are available for play/)
      ).toBeInTheDocument();
    });

    it('session type has helper text', () => {
      renderCreateSession();
      expect(
        screen.getByText(/Open Play for casual rotation/)
      ).toBeInTheDocument();
    });

    it('game mode has helper text', () => {
      renderCreateSession();
      expect(
        screen.getByText(/Doubles = teams of 2/)
      ).toBeInTheDocument();
    });

    it('matching mode has helper text', () => {
      renderCreateSession();
      expect(
        screen.getByText(/Smart Pairing uses skill ratings/)
      ).toBeInTheDocument();
    });

    it('player name has helper text', () => {
      renderCreateSession();
      expect(
        screen.getByText(/Enter each player's name and skill level/)
      ).toBeInTheDocument();
    });
  });

  describe('Default values', () => {
    it('session type defaults to "open_play"', () => {
      renderCreateSession();
      const select = screen.getByLabelText('Session Type') as HTMLSelectElement;
      expect(select.value).toBe('open_play');
    });

    it('game mode defaults to "doubles"', () => {
      renderCreateSession();
      const select = screen.getByLabelText('Game Mode') as HTMLSelectElement;
      expect(select.value).toBe('doubles');
    });

    it('matching mode defaults to "smart"', () => {
      renderCreateSession();
      const select = screen.getByLabelText('Matching Mode') as HTMLSelectElement;
      expect(select.value).toBe('smart');
    });
  });

  describe('No API calls until submit button is clicked', () => {
    it('does not call createSession on initial render', () => {
      renderCreateSession();
      expect(mockCreateSession).not.toHaveBeenCalled();
    });

    it('does not call updateSessionSettings on initial render', () => {
      renderCreateSession();
      expect(mockUpdateSessionSettings).not.toHaveBeenCalled();
    });

    it('does not call addPlayer on initial render', () => {
      renderCreateSession();
      expect(mockAddPlayer).not.toHaveBeenCalled();
    });

    it('does not call any API when adding a player locally', () => {
      renderCreateSession();
      const playerInput = screen.getByLabelText('Player Name') as HTMLInputElement;
      fireEvent.change(playerInput, { target: { value: 'Alice' } });
      fireEvent.click(screen.getByLabelText('Add player'));

      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockUpdateSessionSettings).not.toHaveBeenCalled();
      expect(mockAddPlayer).not.toHaveBeenCalled();
    });
  });

  describe('SessionSettingsModal is never rendered', () => {
    it('does not render SessionSettingsModal', () => {
      const { container } = renderCreateSession();
      // SessionSettingsModal uses a dialog/modal pattern - check it's not in the DOM
      const modal = container.querySelector('[class*="modal"]');
      expect(modal).not.toBeInTheDocument();
    });

    it('does not contain any dialog elements', () => {
      renderCreateSession();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Submit orchestration sequence', () => {
    async function fillValidFormAndSubmit() {
      renderCreateSession();

      // Fill session name
      fireEvent.change(screen.getByLabelText('Session Name'), {
        target: { value: 'My Session' },
      });

      // Add a player
      fireEvent.change(screen.getByLabelText('Player Name'), {
        target: { value: 'Alice' },
      });
      fireEvent.click(screen.getByLabelText('Add player'));

      // Add another player
      fireEvent.change(screen.getByLabelText('Player Name'), {
        target: { value: 'Bob' },
      });
      fireEvent.click(screen.getByLabelText('Add player'));

      // Setup mocks for success
      mockCreateSession.mockResolvedValue({ id: 'session-123', name: 'My Session' });
      mockUpdateSessionSettings.mockResolvedValue(undefined);
      mockAddPlayer.mockResolvedValue({ id: 'player-1', name: 'Alice' });

      // Click submit
      fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));
    }

    it('calls createSession first', async () => {
      await fillValidFormAndSubmit();

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalledWith('My Session', 2);
      });
    });

    it('calls updateSessionSettings after createSession', async () => {
      await fillValidFormAndSubmit();

      await waitFor(() => {
        expect(mockUpdateSessionSettings).toHaveBeenCalledWith('session-123', {
          name: 'My Session',
          courtCount: 2,
          courtName: '',
          sessionType: 'open_play',
          gameMode: 'doubles',
          matchingMode: 'smart',
        });
      });
    });

    it('calls addPlayer for each pending player', async () => {
      await fillValidFormAndSubmit();

      await waitFor(() => {
        expect(mockAddPlayer).toHaveBeenCalledTimes(2);
        expect(mockAddPlayer).toHaveBeenCalledWith('session-123', 'Alice', 3);
        expect(mockAddPlayer).toHaveBeenCalledWith('session-123', 'Bob', 3);
      });
    });

    it('navigates to session dashboard after successful submit', async () => {
      await fillValidFormAndSubmit();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/session/session-123', {
          state: undefined,
        });
      });
    });

    it('calls APIs in correct order: createSession → updateSessionSettings → addPlayer', async () => {
      const callOrder: string[] = [];
      mockCreateSession.mockImplementation(async () => {
        callOrder.push('createSession');
        return { id: 'session-123', name: 'My Session' };
      });
      mockUpdateSessionSettings.mockImplementation(async () => {
        callOrder.push('updateSessionSettings');
      });
      mockAddPlayer.mockImplementation(async () => {
        callOrder.push('addPlayer');
        return { id: 'player-1', name: 'Alice' };
      });

      renderCreateSession();

      fireEvent.change(screen.getByLabelText('Session Name'), {
        target: { value: 'My Session' },
      });
      fireEvent.change(screen.getByLabelText('Player Name'), {
        target: { value: 'Alice' },
      });
      fireEvent.click(screen.getByLabelText('Add player'));
      fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

      await waitFor(() => {
        expect(callOrder).toEqual(['createSession', 'updateSessionSettings', 'addPlayer']);
      });
    });
  });

  describe('Partial player check-in failure navigates with warning state', () => {
    it('navigates with checkInWarnings when some players fail to check in', async () => {
      mockCreateSession.mockResolvedValue({ id: 'session-456', name: 'Test' });
      mockUpdateSessionSettings.mockResolvedValue(undefined);
      mockAddPlayer
        .mockResolvedValueOnce({ id: 'p1', name: 'Alice' })
        .mockRejectedValueOnce(new Error('Check-in failed'));

      renderCreateSession();

      fireEvent.change(screen.getByLabelText('Session Name'), {
        target: { value: 'Test' },
      });

      // Add Alice
      fireEvent.change(screen.getByLabelText('Player Name'), {
        target: { value: 'Alice' },
      });
      fireEvent.click(screen.getByLabelText('Add player'));

      // Add Bob (will fail)
      fireEvent.change(screen.getByLabelText('Player Name'), {
        target: { value: 'Bob' },
      });
      fireEvent.click(screen.getByLabelText('Add player'));

      fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/session/session-456', {
          state: { checkInWarnings: ['Bob'] },
        });
      });
    });
  });

  describe('Full session creation failure shows error and retains data', () => {
    it('displays error message when createSession throws', async () => {
      mockCreateSession.mockRejectedValue(new Error('Network error'));

      renderCreateSession();

      fireEvent.change(screen.getByLabelText('Session Name'), {
        target: { value: 'My Session' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Network error');
      });
    });

    it('retains form data after error', async () => {
      mockCreateSession.mockRejectedValue(new Error('Server error'));

      renderCreateSession();

      fireEvent.change(screen.getByLabelText('Session Name'), {
        target: { value: 'My Session' },
      });
      fireEvent.change(screen.getByLabelText('Court Name'), {
        target: { value: 'Main Gym' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Verify form data is retained
      expect((screen.getByLabelText('Session Name') as HTMLInputElement).value).toBe('My Session');
      expect((screen.getByLabelText('Court Name') as HTMLInputElement).value).toBe('Main Gym');
    });

    it('re-enables submit button after error', async () => {
      mockCreateSession.mockRejectedValue(new Error('Server error'));

      renderCreateSession();

      fireEvent.change(screen.getByLabelText('Session Name'), {
        target: { value: 'My Session' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      const submitBtn = screen.getByRole('button', { name: 'Create Session' });
      expect(submitBtn).not.toBeDisabled();
    });

    it('retains pending players after error', async () => {
      mockCreateSession.mockRejectedValue(new Error('Server error'));

      renderCreateSession();

      fireEvent.change(screen.getByLabelText('Session Name'), {
        target: { value: 'My Session' },
      });

      // Add a player
      fireEvent.change(screen.getByLabelText('Player Name'), {
        target: { value: 'Alice' },
      });
      fireEvent.click(screen.getByLabelText('Add player'));

      fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Player should still be in the list
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });
});
