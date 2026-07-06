import { useEffect, useRef, useState } from 'react';
import { getPlayerProfile } from '../api';
import type {
  PlayerProfile,
  MatchHistoryEntry,
  StarRating,
} from '../types';
import { STAR_RATING_LABELS } from '../types';

interface PlayerProfileCardProps {
  sessionId: string;
  playerId: string;
  onClose: () => void;
  diversityPercentage?: number;
}

const ACHIEVEMENT_ICONS: Record<string, string> = {
  IronPlayer: '🏋️',
  Undefeated: '🏆',
  HotStreak: '🔥',
  ComebackKing: '👑',
  SocialButterfly: '🦋',
};

const ACHIEVEMENT_LABELS: Record<string, string> = {
  IronPlayer: 'Iron Player',
  Undefeated: 'Undefeated',
  HotStreak: 'Hot Streak',
  ComebackKing: 'Comeback King',
  SocialButterfly: 'Social Butterfly',
};

function StarDisplay({ rating }: { rating: StarRating }) {
  return (
    <span aria-label={`${rating} star${rating !== 1 ? 's' : ''} - ${STAR_RATING_LABELS[rating]}`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  );
}

function StreakDisplay({ streak }: { streak: number }) {
  if (streak === 0) return <span style={{ color: '#6b7280' }}>—</span>;
  if (streak > 0) return <span style={{ color: '#dc2626' }}>🔥 {streak}W</span>;
  return <span style={{ color: '#2563eb' }}>❄️ {Math.abs(streak)}L</span>;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats a match score for display.
 * Returns "11-7" format (higher score first) or "No Score" if scores are null.
 */
function formatMatchScore(team1Score: number | null, team2Score: number | null): string {
  if (team1Score === null || team2Score === null) {
    return 'No Score';
  }
  const high = Math.max(team1Score, team2Score);
  const low = Math.min(team1Score, team2Score);
  return `${high}-${low}`;
}

function PlayerProfileCard({ sessionId, playerId, onClose, diversityPercentage }: PlayerProfileCardProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Fetch profile data on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchProfile() {
      try {
        const data = await getPlayerProfile(sessionId, playerId) as PlayerProfile;
        if (!cancelled) {
          setProfile(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
          setLoading(false);
        }
      }
    }
    fetchProfile();
    return () => { cancelled = true; };
  }, [sessionId, playerId]);

  // Focus trap and escape key handling
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  const recentMatches = profile?.matchHistory.slice(0, 10) ?? [];
  const sortedHeadToHead = profile?.headToHead
    .slice()
    .sort((a, b) => b.encounters - a.encounters) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={profile ? `${profile.playerName} profile` : 'Player profile'}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: '#fff',
          borderRadius: '12px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '1.5rem',
          position: 'relative',
        }}
      >
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close profile"
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#6b7280',
            lineHeight: 1,
            padding: '0.25rem',
          }}
        >
          ✕
        </button>

        {loading && (
          <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem 0' }}>
            Loading profile…
          </p>
        )}

        {error && (
          <p style={{ textAlign: 'center', color: '#dc2626', padding: '2rem 0' }}>
            {error}
          </p>
        )}

        {profile && (
          <>
            {/* Header */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', color: '#111827' }}>
                {profile.playerName}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ color: '#f59e0b', fontSize: '1.1rem' }}>
                  <StarDisplay rating={profile.starRating} />
                </span>
                <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                  Rating: {profile.rating}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                gap: '0.5rem',
                marginBottom: '1.25rem',
                padding: '0.75rem',
                background: '#f9fafb',
                borderRadius: '8px',
              }}
            >
              <StatItem label="Wins" value={String(profile.wins)} />
              <StatItem label="Losses" value={String(profile.losses)} />
              <StatItem label="Matches" value={String(profile.matchesPlayed)} />
              <StatItem label="Win Rate" value={`${profile.winRate.toFixed(1)}%`} />
              <StatItem label="Streak" value={<StreakDisplay streak={profile.streak} />} />
            </div>

            {/* Diversity */}
            <div
              style={{
                marginBottom: '1.25rem',
                fontSize: '0.95rem',
                fontWeight: 600,
              }}
            >
              <span
                data-testid="diversity-display"
                style={{
                  color: (diversityPercentage ?? 0) >= 50 ? '#16a34a' : '#d97706',
                }}
              >
                Diversity: {diversityPercentage ?? 0}%
              </span>
            </div>

            {/* Achievements */}
            {profile.achievements.length > 0 && (
              <section style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', color: '#374151', margin: '0 0 0.5rem' }}>
                  Achievements
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {profile.achievements.map((a) => (
                    <span
                      key={a.kind}
                      title={ACHIEVEMENT_LABELS[a.kind] ?? a.kind}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        background: '#fef3c7',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                      }}
                    >
                      {ACHIEVEMENT_ICONS[a.kind] ?? '🏅'} {ACHIEVEMENT_LABELS[a.kind] ?? a.kind}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Match History */}
            <section style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.95rem', color: '#374151', margin: '0 0 0.5rem' }}>
                Recent Matches
              </h3>
              {recentMatches.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>
                  No matches played yet.
                </p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {recentMatches.map((match) => (
                    <MatchHistoryItem key={match.matchId} match={match} />
                  ))}
                </ul>
              )}
            </section>

            {/* Head-to-Head */}
            {sortedHeadToHead.length > 0 && (
              <section>
                <h3 style={{ fontSize: '0.95rem', color: '#374151', margin: '0 0 0.5rem' }}>
                  Head-to-Head
                </h3>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.85rem',
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0.25rem', color: '#6b7280', fontWeight: 500 }}>
                        Opponent
                      </th>
                      <th style={{ textAlign: 'center', padding: '0.4rem 0.25rem', color: '#6b7280', fontWeight: 500 }}>
                        W
                      </th>
                      <th style={{ textAlign: 'center', padding: '0.4rem 0.25rem', color: '#6b7280', fontWeight: 500 }}>
                        L
                      </th>
                      <th style={{ textAlign: 'center', padding: '0.4rem 0.25rem', color: '#6b7280', fontWeight: 500 }}>
                        Games
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHeadToHead.map((record) => (
                      <tr key={record.opponentId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.4rem 0.25rem', color: '#111827', fontWeight: 500 }}>{record.opponentName}</td>
                        <td style={{ textAlign: 'center', padding: '0.4rem 0.25rem', color: '#16a34a' }}>
                          {record.wins}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.4rem 0.25rem', color: '#dc2626' }}>
                          {record.losses}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.4rem 0.25rem', color: '#374151', fontWeight: 600 }}>
                          {record.encounters}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.15rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
        {value}
      </div>
    </div>
  );
}

function MatchHistoryItem({ match }: { match: MatchHistoryEntry }) {
  const resultColor =
    match.result === 'win' ? '#16a34a' : match.result === 'loss' ? '#dc2626' : '#6b7280';
  const resultLabel =
    match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'S';
  const scoreText = formatMatchScore(match.team1Score, match.team2Score);

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem 0',
        borderBottom: '1px solid #f3f4f6',
        fontSize: '0.85rem',
      }}
    >
      <span
        style={{
          fontWeight: 700,
          color: resultColor,
          minWidth: '1.25rem',
        }}
      >
        {resultLabel}
      </span>
      <span style={{ color: '#374151', minWidth: '3rem', fontWeight: 500 }}>
        {scoreText}
      </span>
      <span style={{ color: '#6b7280', minWidth: '2rem' }}>
        Ct {match.courtNumber}
      </span>
      <span style={{ flex: 1, color: '#374151' }}>
        {formatTimestamp(match.timestamp)}
      </span>
    </li>
  );
}

export default PlayerProfileCard;
