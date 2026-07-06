import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SwipeableQueueItem from './SwipeableQueueItem';

describe('SwipeableQueueItem', () => {
  it('renders children content', () => {
    render(
      <SwipeableQueueItem onRemove={() => {}} playerName="Alice">
        <span>Player Alice</span>
      </SwipeableQueueItem>
    );
    expect(screen.getByText('Player Alice')).toBeInTheDocument();
  });

  it('renders the remove action button with correct aria-label', () => {
    render(
      <SwipeableQueueItem onRemove={() => {}} playerName="Bob Smith">
        <span>Player Bob</span>
      </SwipeableQueueItem>
    );
    expect(screen.getByRole('button', { name: 'Remove Bob Smith' })).toBeInTheDocument();
  });

  it('has the swipeable container class', () => {
    const { container } = render(
      <SwipeableQueueItem onRemove={() => {}} playerName="Alice">
        <span>Content</span>
      </SwipeableQueueItem>
    );
    expect(container.querySelector('.queue-item--swipeable')).toBeInTheDocument();
  });

  it('calls onRemove when the remove button is clicked', () => {
    const onRemove = vi.fn();
    render(
      <SwipeableQueueItem onRemove={onRemove} playerName="Alice">
        <span>Content</span>
      </SwipeableQueueItem>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alice' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('applies swiping class during touch move', () => {
    const { container } = render(
      <SwipeableQueueItem onRemove={() => {}} playerName="Alice">
        <span>Content</span>
      </SwipeableQueueItem>
    );
    const swipeContent = container.querySelector('.queue-item__swipe-content')!;

    // Start touch
    fireEvent.touchStart(swipeContent, {
      touches: [{ clientX: 200, clientY: 100 }],
    });

    // Move left past threshold
    fireEvent.touchMove(swipeContent, {
      touches: [{ clientX: 100, clientY: 100 }],
    });

    const swipeable = container.querySelector('.queue-item--swipeable');
    expect(swipeable).toHaveClass('queue-item--swiping');
  });

  it('reveals remove action after swiping past threshold', () => {
    const { container } = render(
      <SwipeableQueueItem onRemove={() => {}} playerName="Alice">
        <span>Content</span>
      </SwipeableQueueItem>
    );
    const swipeContent = container.querySelector('.queue-item__swipe-content')!;

    // Start touch
    fireEvent.touchStart(swipeContent, {
      touches: [{ clientX: 200, clientY: 100 }],
    });

    // Move left past threshold (80px)
    fireEvent.touchMove(swipeContent, {
      touches: [{ clientX: 110, clientY: 100 }],
    });

    // End touch
    fireEvent.touchEnd(swipeContent);

    const swipeable = container.querySelector('.queue-item--swipeable');
    expect(swipeable).toHaveClass('queue-item--revealed');
  });

  it('does not reveal remove action if swipe is below threshold', () => {
    const { container } = render(
      <SwipeableQueueItem onRemove={() => {}} playerName="Alice">
        <span>Content</span>
      </SwipeableQueueItem>
    );
    const swipeContent = container.querySelector('.queue-item__swipe-content')!;

    // Start touch
    fireEvent.touchStart(swipeContent, {
      touches: [{ clientX: 200, clientY: 100 }],
    });

    // Move left but not past threshold
    fireEvent.touchMove(swipeContent, {
      touches: [{ clientX: 160, clientY: 100 }],
    });

    // End touch
    fireEvent.touchEnd(swipeContent);

    const swipeable = container.querySelector('.queue-item--swipeable');
    expect(swipeable).not.toHaveClass('queue-item--revealed');
  });

  it('does not track horizontal swipe when vertical movement is greater', () => {
    const { container } = render(
      <SwipeableQueueItem onRemove={() => {}} playerName="Alice">
        <span>Content</span>
      </SwipeableQueueItem>
    );
    const swipeContent = container.querySelector('.queue-item__swipe-content')!;

    // Start touch
    fireEvent.touchStart(swipeContent, {
      touches: [{ clientX: 200, clientY: 100 }],
    });

    // Move mostly vertically (scrolling)
    fireEvent.touchMove(swipeContent, {
      touches: [{ clientX: 190, clientY: 50 }],
    });

    const swipeable = container.querySelector('.queue-item--swipeable');
    expect(swipeable).not.toHaveClass('queue-item--swiping');
  });
});
