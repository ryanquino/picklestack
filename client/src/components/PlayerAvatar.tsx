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

/**
 * Derives a consistent background color from a player's name
 * using a simple string hash mapped to a predefined palette.
 */
export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Extracts initials from a name string.
 * Uses the first character of the first word and the first character of the last word.
 * For single-word names, returns just the first character.
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface PlayerAvatarProps {
  name: string;
  size?: number;
}

function PlayerAvatar({ name, size = 36 }: PlayerAvatarProps) {
  const backgroundColor = getAvatarColor(name);
  const initials = getInitials(name);
  const fontSize = Math.round(size * 0.4);

  return (
    <div
      className="player-avatar"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor,
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${fontSize}px`,
        fontWeight: 600,
        lineHeight: 1,
        flexShrink: 0,
      }}
      aria-label={`Avatar for ${name}`}
    >
      {initials}
    </div>
  );
}

export default PlayerAvatar;
