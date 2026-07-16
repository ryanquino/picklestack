import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsBar from './StatsBar';

const defaultProps = {
  totalPlayers: 12,
  matchesPlayed: 8,
  averageWinRate: 52.4,
  inQueue: 5,
  activeCourts: 3,
  courtCount: 4,
};

describe('StatsBar', () => {
  describe('metric display', () => {
    it('renders total players count', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('Players')).toBeInTheDocument();
    });

    it('renders in queue count', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('In Queue')).toBeInTheDocument();
    });

    it('renders matches played count', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Matches')).toBeInTheDocument();
    });

    it('renders active courts over court count', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('3/4')).toBeInTheDocument();
      expect(screen.getByText('Courts')).toBeInTheDocument();
    });

    it('renders average win rate as rounded percentage', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByText('52%')).toBeInTheDocument();
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

    it('renders In queue icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'In queue' })).toBeInTheDocument();
    });

    it('renders Matches icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Matches' })).toBeInTheDocument();
    });

    it('renders Active courts icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Active courts' })).toBeInTheDocument();
    });

    it('renders Win rate icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Win rate' })).toBeInTheDocument();
    });
  });
});
