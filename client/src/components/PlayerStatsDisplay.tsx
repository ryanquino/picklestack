import type { PlayerStats, Achievement } from '../types';

interface PlayerStatsDisplayProps {
  stats: PlayerStats;
  isMvp: boolean;
  achievements: Achievement[];
  variant: 'compact' | 'expanded';
}

/** Render filled star icons for the given star rating (1-5) */
function StarRatingDisplay({ starRating }: { starRating: number }) {
  const stars = '★'.repeat(starRating) + '☆'.repeat(5 - starRating);
  return (
    <span
      aria-label={`${starRating} out of 5 stars`}
      style={{ color: '#f59e0b', letterSpacing: '1px' }}
    >
      {stars}
    </span>
  );
}

/** Render streak indicator: 🔥 for wins, ❄️ for losses */
function StreakIndicator({ streak }: { streak: number }) {
  if (streak === 0) return null;

  if (streak > 0) {
    return (
      <span aria-label={`${streak} win streak`} style={{ marginLeft: '0.25rem' }}>
        🔥 {streak}W
      </span>
    );
  }

  const lossCount = Math.abs(streak);
  return (
    <span aria-label={`${lossCount} loss streak`} style={{ marginLeft: '0.25rem' }}>
      ❄️ {lossCount}L
    </span>
  );
}

/** Map achievement kind to a short display label */
const ACHIEVEMENT_LABELS: Record<string, string> = {
  IronPlayer: '🏋️ Iron Player',
  Undefeated: '🏆 Undefeated',
  HotStreak: '🔥 Hot Streak',
  ComebackKing: '👑 Comeback King',
  SocialButterfly: '🦋 Social Butterfly',
};

/** Render achievement badges */
function AchievementBadges({ achievements }: { achievements: Achievement[] }) {
  if (achievements.length === 0) return null;

  return (
    <span style={{ display: 'inline-flex', gap: '0.25rem', marginLeft: '0.25rem' }}>
      {achievements.map((achievement) => (
        <span
          key={achievement.kind}
          title={ACHIEVEMENT_LABELS[achievement.kind] || achievement.kind}
          aria-label={`Achievement: ${ACHIEVEMENT_LABELS[achievement.kind] || achievement.kind}`}
          style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.25rem',
            borderRadius: '4px',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
          }}
        >
          {ACHIEVEMENT_LABELS[achievement.kind]?.split(' ')[0] || '🏅'}
        </span>
      ))}
    </span>
  );
}

function PlayerStatsDisplay({ stats, isMvp, achievements, variant }: PlayerStatsDisplayProps) {
  if (variant === 'compact') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: '0.8rem',
          color: '#4b5563',
        }}
        aria-label={`Stats for ${stats.playerName}: ${stats.wins} wins, ${stats.losses} losses, ${stats.winRate}% win rate, rating ${stats.rating}`}
      >
        <StarRatingDisplay starRating={stats.starRating} />
        <span style={{ fontWeight: 500 }}>{stats.rating}</span>
        <span>
          {stats.wins}W-{stats.losses}L
        </span>
        <StreakIndicator streak={stats.streak} />
        {isMvp && (
          <span
            aria-label="MVP"
            style={{
              background: '#fef3c7',
              color: '#92400e',
              padding: '0.0625rem 0.25rem',
              borderRadius: '4px',
              fontWeight: 700,
              fontSize: '0.7rem',
            }}
          >
            MVP
          </span>
        )}
        <AchievementBadges achievements={achievements} />
      </span>
    );
  }

  // Expanded variant
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        fontSize: '0.875rem',
        color: '#374151',
        padding: '0.5rem',
        borderRadius: '6px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
      }}
      aria-label={`Stats for ${stats.playerName}: ${stats.wins} wins, ${stats.losses} losses, ${stats.winRate}% win rate, rating ${stats.rating}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <StarRatingDisplay starRating={stats.starRating} />
        <span style={{ fontWeight: 600 }}>Rating: {stats.rating}</span>
        {isMvp && (
          <span
            aria-label="MVP"
            style={{
              background: '#fef3c7',
              color: '#92400e',
              padding: '0.125rem 0.375rem',
              borderRadius: '4px',
              fontWeight: 700,
              fontSize: '0.75rem',
            }}
          >
            MVP
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span>
          <strong>{stats.wins}</strong> W
        </span>
        <span>
          <strong>{stats.losses}</strong> L
        </span>
        <span>Win Rate: <strong>{stats.winRate}%</strong></span>
        <StreakIndicator streak={stats.streak} />
      </div>
      {achievements.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
          <AchievementBadges achievements={achievements} />
        </div>
      )}
    </div>
  );
}

export default PlayerStatsDisplay;
