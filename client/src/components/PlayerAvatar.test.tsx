import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlayerAvatar, { getAvatarColor } from './PlayerAvatar';

const AVATAR_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0891b2',
  '#4f46e5',
  '#c026d3',
];

describe('getAvatarColor', () => {
  it('returns the same color for the same name (deterministic)', () => {
    const color1 = getAvatarColor('Alice');
    const color2 = getAvatarColor('Alice');
    expect(color1).toBe(color2);
  });

  it('returns a color from the predefined palette', () => {
    const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
    for (const name of names) {
      expect(AVATAR_COLORS).toContain(getAvatarColor(name));
    }
  });
});

describe('PlayerAvatar initials extraction', () => {
  it('extracts initials from two-word name: "John Doe" → "JD"', () => {
    render(<PlayerAvatar name="John Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('extracts initial from single name: "Alice" → "A"', () => {
    render(<PlayerAvatar name="Alice" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('extracts first and last initials from multi-word name: "Mary Jane Watson" → "MW"', () => {
    render(<PlayerAvatar name="Mary Jane Watson" />);
    expect(screen.getByText('MW')).toBeInTheDocument();
  });
});

describe('PlayerAvatar rendering', () => {
  it('renders with correct CSS class "player-avatar"', () => {
    render(<PlayerAvatar name="Test User" />);
    const avatar = screen.getByLabelText('Avatar for Test User');
    expect(avatar).toHaveClass('player-avatar');
  });

  it('renders with default size of 36px', () => {
    render(<PlayerAvatar name="Test User" />);
    const avatar = screen.getByLabelText('Avatar for Test User');
    expect(avatar).toHaveStyle({ width: '36px', height: '36px' });
  });

  it('renders with custom size', () => {
    render(<PlayerAvatar name="Test User" size={48} />);
    const avatar = screen.getByLabelText('Avatar for Test User');
    expect(avatar).toHaveStyle({ width: '48px', height: '48px' });
  });

  it('renders initials as text content', () => {
    render(<PlayerAvatar name="John Doe" />);
    const avatar = screen.getByLabelText('Avatar for John Doe');
    expect(avatar).toHaveTextContent('JD');
  });
});
