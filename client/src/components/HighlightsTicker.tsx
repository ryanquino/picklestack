import { memo } from 'react';

interface Highlight {
  id: string;
  emoji: string;
  text: string;
  matchNumber: number;
  timestamp: string;
}

interface HighlightsTickerProps {
  highlights: Highlight[];
}

const HighlightsTicker = memo(function HighlightsTicker({ highlights }: HighlightsTickerProps) {
  if (!highlights || highlights.length === 0) return null;

  // Only duplicate for seamless loop if we have enough items
  const items = highlights.length >= 4 ? [...highlights, ...highlights] : highlights;
  const shouldAnimate = highlights.length >= 4;

  return (
    <div className="highlights-ticker" aria-label="Match highlights">
      <div className={`highlights-ticker__track${shouldAnimate ? '' : ' highlights-ticker__track--static'}`}>
        {items.map((h, i) => (
          <span key={`${h.id}-${i}`} className="highlights-ticker__item">
            <span className="highlights-ticker__match-num">(#{h.matchNumber})</span>
            <span className="highlights-ticker__emoji">{h.emoji}</span>
            <span className="highlights-ticker__text">{h.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
});

export default HighlightsTicker;
