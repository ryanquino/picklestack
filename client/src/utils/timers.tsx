import { useState, useEffect } from 'react';
import type { StarRating } from '../types';

/** Live timer that updates every second, displays mm:ss */
export function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => {
    const diff = Date.now() - new Date(startedAt).getTime();
    return Math.max(0, Math.floor(diff / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(startedAt).getTime();
      setElapsed(Math.max(0, Math.floor(diff / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return <span>⏱ {minutes}:{seconds.toString().padStart(2, '0')}</span>;
}

/** Live wait timer — shows m:ss since a given timestamp */
export function WaitTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(() => {
    const diff = Date.now() - new Date(since).getTime();
    return Math.max(0, Math.floor(diff / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(since).getTime();
      setElapsed(Math.max(0, Math.floor(diff / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [since]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return <span>{minutes}:{seconds.toString().padStart(2, '0')}</span>;
}

/** Render star rating as ★/☆ characters */
export function renderStars(starRating: StarRating): string {
  return '★'.repeat(starRating) + '☆'.repeat(5 - starRating);
}
