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
      setError('Name required');
      return;
    }
    if (name.length > 30) {
      setError('Max 30 characters');
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
        setError('Failed to add player');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Check in player" className="checkin-form">
      <div className="checkin-form__input-row">
        <input
          id={`player-name-${sessionId}`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
          maxLength={30}
          disabled={submitting}
          className="checkin-form__input"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="checkin-form__submit"
          aria-label="Add player"
        >
          {submitting ? '...' : '+'}
        </button>
      </div>

      <div className="checkin-form__stars" role="radiogroup" aria-label="Skill level">
        {([1, 2, 3, 4, 5] as StarRating[]).map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => setStarRating(rating)}
            disabled={submitting}
            className={`checkin-form__star${rating <= starRating ? ' checkin-form__star--active' : ''}`}
            aria-label={`${rating} star - ${STAR_RATING_LABELS[rating]}`}
            aria-pressed={starRating === rating}
          >
            ★
          </button>
        ))}
        <span className="checkin-form__skill-label">{STAR_RATING_LABELS[starRating]}</span>
      </div>

      {error && (
        <p role="alert" className="checkin-form__error">{error}</p>
      )}
    </form>
  );
}

export default CheckInForm;
