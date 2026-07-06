import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LiveSessionHeader from './LiveSessionHeader';

describe('LiveSessionHeader', () => {
  it('renders session name', () => {
    render(
      <LiveSessionHeader sessionName="Friday Night" activeCourts={3} queuedPlayers={5} />
    );
    expect(screen.getByText('Friday Night')).toBeInTheDocument();
  });

  it('renders LIVE badge with pulse animation class', () => {
    render(
      <LiveSessionHeader sessionName="Test Session" activeCourts={2} queuedPlayers={4} />
    );
    const badge = screen.getByLabelText('Session is live');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('live-session-header__badge--pulse');
    expect(badge).toHaveTextContent('LIVE');
  });

  it('displays active court count', () => {
    render(
      <LiveSessionHeader sessionName="Test" activeCourts={3} queuedPlayers={7} />
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Courts Active')).toBeInTheDocument();
  });

  it('displays queued player count', () => {
    render(
      <LiveSessionHeader sessionName="Test" activeCourts={2} queuedPlayers={8} />
    );
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Players Queued')).toBeInTheDocument();
  });

  it('uses singular "Court" when activeCourts is 1', () => {
    render(
      <LiveSessionHeader sessionName="Test" activeCourts={1} queuedPlayers={3} />
    );
    expect(screen.getByText('Court Active')).toBeInTheDocument();
  });

  it('uses singular "Player" when queuedPlayers is 1', () => {
    render(
      <LiveSessionHeader sessionName="Test" activeCourts={2} queuedPlayers={1} />
    );
    expect(screen.getByText('Player Queued')).toBeInTheDocument();
  });
});
