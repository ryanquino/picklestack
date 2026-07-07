import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsBar from './StatsBar';

const defaultProps = {
  totalPlayers: 12,
  matchesPlayed: 8,
  averageWinRate: 52.4,
  sessionQualityScore: 75,
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

    it('renders Great when quality score >= 70', () => {
      render(<StatsBar {...defaultProps} sessionQualityScore={75} />);
      expect(screen.getByText('Great')).toBeInTheDocument();
    });

    it('renders Decent when quality score 40-69', () => {
      render(<StatsBar {...defaultProps} sessionQualityScore={55} />);
      expect(screen.getByText('Decent')).toBeInTheDocument();
    });

    it('renders Lopsided when quality score < 40', () => {
      render(<StatsBar {...defaultProps} sessionQualityScore={25} />);
      expect(screen.getByText('Lopsided')).toBeInTheDocument();
    });

    it('renders N/A when quality score is null', () => {
      render(<StatsBar {...defaultProps} sessionQualityScore={null} />);
      expect(screen.getByText('N/A')).toBeInTheDocument();
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

    it('renders Matches icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Matches' })).toBeInTheDocument();
    });

    it('renders Win rate icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Win rate' })).toBeInTheDocument();
    });

    it('renders Match quality icon with aria-label', () => {
      render(<StatsBar {...defaultProps} />);
      expect(screen.getByRole('img', { name: 'Match quality' })).toBeInTheDocument();
    });
  });
});
