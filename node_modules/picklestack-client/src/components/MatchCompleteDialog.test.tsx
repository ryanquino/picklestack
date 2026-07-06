import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MatchCompleteDialog from './MatchCompleteDialog';

vi.mock('../api', () => ({
  completeMatchWithResult: vi.fn().mockResolvedValue(undefined),
  completeMatchSkipScore: vi.fn().mockResolvedValue(undefined),
}));

const defaultPlayers = [
  { id: '1', name: 'Alice Smith' },
  { id: '2', name: 'Bob Jones' },
  { id: '3', name: 'Charlie Brown' },
  { id: '4', name: 'Diana Prince' },
];

const defaultProps = {
  sessionId: 'session-1',
  courtNumber: 3,
  players: defaultPlayers,
  onClose: vi.fn(),
  onComplete: vi.fn(),
};

describe('MatchCompleteDialog', () => {
  it('renders court number in dialog header', () => {
    render(<MatchCompleteDialog {...defaultProps} />);
    expect(screen.getByText('Court 3')).toBeInTheDocument();
  });

  it('renders match duration when matchStartedAt is provided', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    render(<MatchCompleteDialog {...defaultProps} matchStartedAt={tenMinutesAgo} />);
    expect(screen.getByText('10m')).toBeInTheDocument();
  });

  it('renders all player names from both teams', () => {
    render(<MatchCompleteDialog {...defaultProps} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    expect(screen.getByText('Diana Prince')).toBeInTheDocument();
  });

  it('renders PlayerAvatar for each player with aria-label', () => {
    render(<MatchCompleteDialog {...defaultProps} />);
    expect(screen.getByLabelText('Avatar for Alice Smith')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Bob Jones')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Charlie Brown')).toBeInTheDocument();
    expect(screen.getByLabelText('Avatar for Diana Prince')).toBeInTheDocument();
  });

  it('team cards have role="radio" with aria-checked="false" initially', () => {
    render(<MatchCompleteDialog {...defaultProps} />);
    const radioCards = screen.getAllByRole('radio');
    expect(radioCards).toHaveLength(2);
    expect(radioCards[0]).toHaveAttribute('aria-checked', 'false');
    expect(radioCards[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking a team card sets aria-checked="true" and adds --selected class', () => {
    render(<MatchCompleteDialog {...defaultProps} />);
    const radioCards = screen.getAllByRole('radio');

    fireEvent.click(radioCards[0]);

    expect(radioCards[0]).toHaveAttribute('aria-checked', 'true');
    expect(radioCards[0]).toHaveClass('match-dialog__team-card--selected');
    expect(radioCards[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('renders "Skip Match" button with secondary styling class', () => {
    render(<MatchCompleteDialog {...defaultProps} />);
    const skipBtn = screen.getByRole('button', { name: /skip match/i });
    expect(skipBtn).toBeInTheDocument();
    expect(skipBtn).toHaveClass('match-dialog__btn--secondary');
  });

  it('renders "Confirm Result" button with primary styling class', () => {
    render(<MatchCompleteDialog {...defaultProps} />);
    const confirmBtn = screen.getByRole('button', { name: /confirm match result/i });
    expect(confirmBtn).toBeInTheDocument();
    expect(confirmBtn).toHaveClass('match-dialog__btn--primary');
  });

  it('renders score input fields for both teams', () => {
    render(<MatchCompleteDialog {...defaultProps} />);
    expect(screen.getByLabelText(/score for team 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/score for team 2/i)).toBeInTheDocument();
  });
});
