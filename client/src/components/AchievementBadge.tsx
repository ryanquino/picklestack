import { Achievement, AchievementKind } from '../types';

/** Map achievement kinds to their display icons */
const ACHIEVEMENT_ICONS: Record<AchievementKind, string> = {
  [AchievementKind.IronPlayer]: '🏋️',
  [AchievementKind.Undefeated]: '🏆',
  [AchievementKind.HotStreak]: '🔥',
  [AchievementKind.ComebackKing]: '👑',
  [AchievementKind.SocialButterfly]: '🦋',
};

/** Map achievement kinds to their display names */
const ACHIEVEMENT_NAMES: Record<AchievementKind, string> = {
  [AchievementKind.IronPlayer]: 'Iron Player',
  [AchievementKind.Undefeated]: 'Undefeated',
  [AchievementKind.HotStreak]: 'Hot Streak',
  [AchievementKind.ComebackKing]: 'Comeback King',
  [AchievementKind.SocialButterfly]: 'Social Butterfly',
};

// --- AchievementBadge ---

interface AchievementBadgeProps {
  achievement: Achievement;
}

/** Displays an achievement icon inline with a tooltip showing the achievement name */
function AchievementBadge({ achievement }: AchievementBadgeProps) {
  const icon = ACHIEVEMENT_ICONS[achievement.kind];
  const name = ACHIEVEMENT_NAMES[achievement.kind];

  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      style={{
        display: 'inline-block',
        fontSize: '1rem',
        cursor: 'default',
        marginLeft: '0.25rem',
      }}
    >
      {icon}
    </span>
  );
}

// --- AchievementNotification ---

interface AchievementNotificationProps {
  achievement: Achievement;
  playerName: string;
  onDismiss: () => void;
}

/** Notification banner shown to the organizer when a player earns a new achievement */
function AchievementNotification({
  achievement,
  playerName,
  onDismiss,
}: AchievementNotificationProps) {
  const icon = ACHIEVEMENT_ICONS[achievement.kind];
  const name = ACHIEVEMENT_NAMES[achievement.kind];

  return (
    <div
      role="alert"
      aria-label={`${playerName} earned ${name}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        background: '#fefce8',
        border: '1px solid #fde047',
        borderRadius: '8px',
        marginBottom: '0.5rem',
        color: '#1f2937',
      }}
    >
      <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
        {icon}
      </span>
      <span style={{ flex: 1, color: '#1f2937' }}>
        <strong>{playerName}</strong> earned <strong>{name}</strong>
      </span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        title="Dismiss"
        style={{
          padding: '0.25rem 0.5rem',
          border: '1px solid #9ca3af',
          borderRadius: '4px',
          background: '#f3f4f6',
          color: '#374151',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 600,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export { AchievementBadge, AchievementNotification, ACHIEVEMENT_ICONS, ACHIEVEMENT_NAMES };
export default AchievementBadge;
