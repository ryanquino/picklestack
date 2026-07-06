import { useState } from 'react';
import type { PairingMode } from '../types';
import { setPairingMode } from '../api';

interface PairingModeToggleProps {
  sessionId: string;
  currentMode: PairingMode;
  onModeChange: (mode: PairingMode) => void;
}

function PairingModeToggle({ sessionId, currentMode, onModeChange }: PairingModeToggleProps) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSmartMode = currentMode === 'smart';

  async function handleToggle() {
    const newMode: PairingMode = isSmartMode ? 'queue' : 'smart';
    setUpdating(true);
    setError(null);

    try {
      await setPairingMode(sessionId, newMode);
      onModeChange(newMode);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update pairing mode');
      }
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="pairing-toggle">
      <div className="pairing-toggle__row">
        <span className={`pairing-toggle__label${!isSmartMode ? ' pairing-toggle__label--active' : ''}`}>
          Queue Order
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isSmartMode}
          aria-label={`Pairing mode: ${isSmartMode ? 'Smart Pairing' : 'Queue Order'}. Click to switch to ${isSmartMode ? 'Queue Order' : 'Smart Pairing'}.`}
          disabled={updating}
          onClick={handleToggle}
          className={`pairing-toggle__switch${isSmartMode ? ' pairing-toggle__switch--on' : ''}`}
        >
          <span className="pairing-toggle__knob" />
        </button>
        <span className={`pairing-toggle__label${isSmartMode ? ' pairing-toggle__label--active' : ''}`}>
          Smart Pairing
        </span>
      </div>
      {error && (
        <p role="alert" className="pairing-toggle__error">
          {error}
        </p>
      )}
    </div>
  );
}

export default PairingModeToggle;
