import { useState, FormEvent } from 'react';
import type { StarRating } from '../types';
import { STAR_RATING_LABELS } from '../types';

interface CheckInFormProps {
  sessionId: string;
  onCheckIn: (name: string, starRating: StarRating) => Promise<void>;
}

function CheckInForm({ sessionId, onCheckIn }: CheckInFormProps) {
  const [name, setName] = useState('');
  const [starRating, setStarRating] = useState<StarRating>(3);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed || trimmed.length === 0) {
      setError('Player name must be 1-30 characters with at least one non-whitespace character');
      return;
    }
    if (name.length > 30) {
      setError('Player name must be 1-30 characters with at least one non-whitespace character');
      return;
    }

    setSubmitting(true);
    try {
      await onCheckIn(name, starRating);
      setName('');
      setStarRating(3);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to check in player');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Check in player">
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label htmlFor={`player-name-${sessionId}`} style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
            Player Name
          </label>
          <input
            id={`player-name-${sessionId}`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter player name"
            maxLength={30}
            disabled={submitting}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: error ? '1px solid #dc2626' : '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '1rem',
            }}
          />
          {error && (
            <p role="alert" style={{ color: '#dc2626', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            opacity: submitting ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          Check In
        </button>
      </div>

      <fieldset
        style={{ border: 'none', padding: '0.5rem 0 0', margin: 0 }}
        disabled={submitting}
      >
        <legend style={{ fontWeight: 500, marginBottom: '0.25rem', padding: 0 }}>
          Skill Level
        </legend>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }} role="radiogroup" aria-label="Star rating">
          {([1, 2, 3, 4, 5] as StarRating[]).map((rating) => (
            <label
              key={rating}
              style={{ cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <input
                type="radio"
                name={`star-rating-${sessionId}`}
                value={rating}
                checked={starRating === rating}
                onChange={() => setStarRating(rating)}
                disabled={submitting}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                aria-label={`${rating} star - ${STAR_RATING_LABELS[rating]}`}
              />
              <span
                style={{
                  fontSize: '1.5rem',
                  color: rating <= starRating ? '#f59e0b' : '#d1d5db',
                  transition: 'color 0.15s',
                }}
                aria-hidden="true"
              >
                ★
              </span>
              <span style={{ fontSize: '0.625rem', color: '#6b7280', marginTop: '0.125rem' }}>
                {rating === starRating ? STAR_RATING_LABELS[rating] : ''}
              </span>
            </label>
          ))}
        </div>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
          {STAR_RATING_LABELS[starRating]} ({starRating}/5)
        </p>
      </fieldset>
    </form>
  );
}

export default CheckInForm;
