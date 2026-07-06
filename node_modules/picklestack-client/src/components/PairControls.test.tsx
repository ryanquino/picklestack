import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PairControls from './PairControls';

// Mock the API module
vi.mock('../api', () => ({
  createFixedPair: vi.fn(),
  dissolveFixedPair: vi.fn(),
}));

import { createFixedPair, dissolveFixedPair } from '../api';

const mockedCreateFixedPair = vi.mocked(createFixedPair);
const mockedDissolveFixedPair = vi.mocked(dissolveFixedPair);

const defaultProps = {
  sessionId: 'session-1',
  onPairChanged: vi.fn(),
};

function makeQueue() {
  return [
    { playerId: 'p1', playerName: 'Alice', isPairSlot: false, pairId: null, partnerPlayerName: null },
    { playerId: 'p2', playerName: 'Bob', isPairSlot: false, pairId: null, partnerPlayerName: null },
    { playerId: 'p3', playerName: 'Charlie', isPairSlot: false, pairId: null, partnerPlayerName: null },
  ];
}

function makeQueueWithPair() {
  return [
    { playerId: 'p1', playerName: 'Alice', isPairSlot: true, pairId: 'pair-1', partnerPlayerName: 'Bob' },
    { playerId: 'p3', playerName: 'Charlie', isPairSlot: false, pairId: null, partnerPlayerName: null },
  ];
}

describe('PairControls - Create Pair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createFixedPair API with correct arguments on confirm', async () => {
    mockedCreateFixedPair.mockResolvedValue({
      id: 'pair-1',
      sessionId: 'session-1',
      player1Id: 'p1',
      player2Id: 'p2',
      createdAt: '2024-01-15T12:00:00Z',
    });

    render(<PairControls {...defaultProps} queue={makeQueue()} />);

    // Enter selection mode
    fireEvent.click(screen.getByLabelText('Pair players'));

    // Select two players
    fireEvent.click(screen.getByText('Alice'));
    fireEvent.click(screen.getByText('Bob'));

    // Confirm pair creation
    fireEvent.click(screen.getByLabelText('Confirm pair creation'));

    await waitFor(() => {
      expect(mockedCreateFixedPair).toHaveBeenCalledWith('session-1', 'p1', 'p2');
    });
  });

  it('calls onPairChanged after successful pair creation', async () => {
    mockedCreateFixedPair.mockResolvedValue({
      id: 'pair-1',
      sessionId: 'session-1',
      player1Id: 'p1',
      player2Id: 'p2',
      createdAt: '2024-01-15T12:00:00Z',
    });

    const onPairChanged = vi.fn();
    render(<PairControls {...defaultProps} queue={makeQueue()} onPairChanged={onPairChanged} />);

    // Enter selection mode
    fireEvent.click(screen.getByLabelText('Pair players'));

    // Select two players
    fireEvent.click(screen.getByText('Alice'));
    fireEvent.click(screen.getByText('Bob'));

    // Confirm
    fireEvent.click(screen.getByLabelText('Confirm pair creation'));

    await waitFor(() => {
      expect(onPairChanged).toHaveBeenCalled();
    });
  });

  it('displays error message when createFixedPair fails', async () => {
    mockedCreateFixedPair.mockRejectedValue(new Error('Player is already part of a fixed pair'));

    render(<PairControls {...defaultProps} queue={makeQueue()} />);

    // Enter selection mode
    fireEvent.click(screen.getByLabelText('Pair players'));

    // Select two players
    fireEvent.click(screen.getByText('Alice'));
    fireEvent.click(screen.getByText('Bob'));

    // Confirm
    fireEvent.click(screen.getByLabelText('Confirm pair creation'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Player is already part of a fixed pair');
    });
  });

  it('disables Pair Players button when fewer than 2 individual players', () => {
    const queue = [
      { playerId: 'p1', playerName: 'Alice', isPairSlot: true, pairId: 'pair-1', partnerPlayerName: 'Bob' },
    ];

    render(<PairControls {...defaultProps} queue={queue} />);

    expect(screen.getByLabelText('Pair players')).toBeDisabled();
  });
});

describe('PairControls - Dissolve Pair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls dissolveFixedPair API with correct arguments on dissolve action', async () => {
    mockedDissolveFixedPair.mockResolvedValue(undefined);

    render(<PairControls {...defaultProps} queue={makeQueueWithPair()} />);

    // Click the dissolve button for the pair
    fireEvent.click(screen.getByLabelText('Dissolve pair: Alice and Bob'));

    await waitFor(() => {
      expect(mockedDissolveFixedPair).toHaveBeenCalledWith('session-1', 'pair-1');
    });
  });

  it('calls onPairChanged after successful pair dissolution', async () => {
    mockedDissolveFixedPair.mockResolvedValue(undefined);

    const onPairChanged = vi.fn();
    render(<PairControls {...defaultProps} queue={makeQueueWithPair()} onPairChanged={onPairChanged} />);

    // Click the dissolve button
    fireEvent.click(screen.getByLabelText('Dissolve pair: Alice and Bob'));

    await waitFor(() => {
      expect(onPairChanged).toHaveBeenCalled();
    });
  });

  it('displays error message when dissolveFixedPair fails', async () => {
    mockedDissolveFixedPair.mockRejectedValue(new Error('Cannot dissolve pair while players are in an active match'));

    render(<PairControls {...defaultProps} queue={makeQueueWithPair()} />);

    // Click the dissolve button
    fireEvent.click(screen.getByLabelText('Dissolve pair: Alice and Bob'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot dissolve pair while players are in an active match');
    });
  });

  it('shows existing pairs with both player names', () => {
    render(<PairControls {...defaultProps} queue={makeQueueWithPair()} />);

    expect(screen.getByText(/Alice & Bob/)).toBeInTheDocument();
  });
});
