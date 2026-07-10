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

function HighlightsTicker({ highlights }: HighlightsTickerProps) {
  if (!highlights || highlights.length === 0) return null;

  // Duplicate items for seamless loop
  const items = [...highlights, ...highlights];

  return (
    <div className="highlights-ticker" aria-label="Match highlights">
      <div className="highlights-ticker__track">
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
}

export default HighlightsTicker;
