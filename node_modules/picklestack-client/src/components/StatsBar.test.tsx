import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsBar from './StatsBar';

const defaultProps = {
  totalPlayers: 12,
  matchesPlayed: 8,
  averageWinRate: 52.4,
  averageRating: 3.72,
  pairingMode: 'Smart',
};

describe('StatsBar', () => {
  describe('metric display', () => {
    it('renders total players count', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('Players')).toBeInTheDocument();
    });

    it('renders matches played count', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Matches')).toBeInTheDocument();
    });

    it('renders average win rate as rounded percentage', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('52%')).toBeInTheDocument();
    });

    it('renders average rating to 1 decimal place', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('3.7')).toBeInTheDocument();
    });

    it('renders pairing mode label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('Smart')).toBeInTheDocument();
    });
  });

  describe('formatting correctness', () => {
    it('rounds win rate up when decimal is >= 0.5', () => {
      render(<StatsBar {...defaultProps} averageWinRate={67.5} />);
      expect(screen.getByText('68%')).toBeInTheDocument();
    });

    it('rounds win rate down when decimal is < 0.5', () => {
      render(<StatsBar {...defaultProps} averageWinRate={67.4} />);
      expect(screen.getByText('67%')).toBeInTheDocument();
    });

    it('formats rating with exactly 1 decimal place', () => {
      render(<StatsBar {...defaultProps} averageRating={4.0} />);
      expect(screen.getByText('4.0')).toBeInTheDocument();
    });

    it('truncates rating to 1 decimal place', () => {
      render(<StatsBar {...defaultProps} averageRating={3.456} />);
      expect(screen.getByText('3.5')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has a region role with "Session statistics" label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('region', { name: 'Session statistics' })).toBeInTheDocument();
    });

    it('renders Players icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Players' })).toBeInTheDocument();
    });

    it('renders Matches icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Matches' })).toBeInTheDocument();
    });

    it('renders Win rate icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Win rate' })).toBeInTheDocument();
    });

    it('renders Rating icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Rating' })).toBeInTheDocument();
    });

    it('renders Pairing mode icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Pairing mode' })).toBeInTheDocument();
    });
  });
});
