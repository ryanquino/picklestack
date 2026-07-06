import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionHeader from './SessionHeader';

describe('SessionHeader', () => {
  describe('session name rendering', () => {
    it('renders default session name "Session" when no prop provided', () => {
      render(<SessionHeader />);
      expect(screen.getByRole('heading', { name: 'Session' })).toBeInTheDocument();
    });

    it('renders custom session name when provided', () => {
      render(<SessionHeader sessionName="Friday Night Pickles" />);
      expect(screen.getByRole('heading', { name: 'Friday Night Pickles' })).toBeInTheDocument();
    });
  });

  describe('live badge', () => {
    it('renders "LIVE" badge when isLive is true (default)', () => {
      render(<SessionHeader />);
      expect(screen.getByLabelText('Session is live')).toBeInTheDocument();
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('does not render "LIVE" badge when isLive is false', () => {
      render(<SessionHeader isLive={false} />);
      expect(screen.queryByLabelText('Session is live')).not.toBeInTheDocument();
      expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('renders Pairing Mode button', () => {
      render(<SessionHeader />);
      expect(
        screen.getByLabelText(/Pairing mode:/)
      ).toBeInTheDocument();
    });

    it('renders Settings button', () => {
      render(<SessionHeader />);
      expect(screen.getByLabelText('Session Settings')).toBeInTheDocument();
    });

    it('renders End Session button', () => {
      render(<SessionHeader />);
      expect(screen.getByLabelText('End Session')).toBeInTheDocument();
    });
  });

  describe('court name subtitle', () => {
    it('renders court name when provided', () => {
      render(<SessionHeader courtName="Court A" />);
      expect(screen.getByText('Court A')).toBeInTheDocument();
    });

    it('does not render court name element when not provided', () => {
      const { container } = render(<SessionHeader />);
      expect(container.querySelector('.session-header__court')).not.toBeInTheDocument();
    });
  });
});
