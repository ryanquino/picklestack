import { useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface SwipeableQueueItemProps {
  children: ReactNode;
  onRemove: () => void;
  playerName: string;
}

const SWIPE_THRESHOLD = 80;

/**
 * Wraps a queue item to add swipe-to-remove gesture support on touch devices.
 * When the user swipes left past the threshold (80px), a "Remove" button is
 * revealed on the right side. Tapping the button triggers the onRemove callback.
 *
 * Only activates on touch devices (touch events must fire).
 */
function SwipeableQueueItem({ children, onRemove, playerName }: SwipeableQueueItemProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const isTrackingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    currentXRef.current = touch.clientX;
    isTrackingRef.current = true;
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isTrackingRef.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - startXRef.current;
    const deltaY = touch.clientY - startYRef.current;

    // If vertical movement is greater than horizontal, stop tracking (user is scrolling)
    if (!isSwiping && Math.abs(deltaY) > Math.abs(deltaX)) {
      isTrackingRef.current = false;
      return;
    }

    // Only allow swiping left (negative deltaX)
    if (deltaX < 0) {
      setIsSwiping(true);
      currentXRef.current = touch.clientX;
      // Clamp the offset: don't allow swiping more than the threshold + some extra
      const clampedOffset = Math.max(deltaX, -(SWIPE_THRESHOLD + 20));
      setOffsetX(clampedOffset);
    } else if (isRevealed && deltaX > 0) {
      // Allow swiping back to close
      setIsSwiping(true);
      const clampedOffset = Math.min(0, deltaX - SWIPE_THRESHOLD);
      setOffsetX(clampedOffset);
    }
  }, [isSwiping, isRevealed]);

  const handleTouchEnd = useCallback(() => {
    isTrackingRef.current = false;

    if (Math.abs(offsetX) >= SWIPE_THRESHOLD) {
      // Snap to revealed position
      setOffsetX(-SWIPE_THRESHOLD);
      setIsRevealed(true);
    } else {
      // Snap back to closed
      setOffsetX(0);
      setIsRevealed(false);
    }

    setIsSwiping(false);
  }, [offsetX]);

  const handleRemoveClick = useCallback(() => {
    setOffsetX(0);
    setIsRevealed(false);
    onRemove();
  }, [onRemove]);

  const handleContentClick = useCallback(() => {
    // If revealed, close on tap
    if (isRevealed) {
      setOffsetX(0);
      setIsRevealed(false);
    }
  }, [isRevealed]);

  return (
    <div
      className={`queue-item--swipeable${isSwiping ? ' queue-item--swiping' : ''}${isRevealed ? ' queue-item--revealed' : ''}`}
    >
      <div
        className="queue-item__swipe-content"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentClick}
      >
        {children}
      </div>
      <button
        className="queue-item__swipe-action"
        onClick={handleRemoveClick}
        aria-label={`Remove ${playerName}`}
        style={{
          width: `${SWIPE_THRESHOLD}px`,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default SwipeableQueueItem;
