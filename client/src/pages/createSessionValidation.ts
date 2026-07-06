/**
 * Validation logic for the single-page session creation form.
 * Exported for use in property-based tests.
 */

export interface ValidationErrors {
  name?: string;
  courtName?: string;
  courtCount?: string;
  playerName?: string;
}

/**
 * Validates the session form fields.
 * Returns an error for name if trimmed length is outside 1-50,
 * for courtName if length exceeds 50,
 * for courtCount if not an integer between 1 and 12.
 */
export function validateSessionForm(state: {
  name: string;
  courtName: string;
  courtCount: number;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  const trimmedName = state.name.trim();
  if (trimmedName.length < 1 || trimmedName.length > 50) {
    errors.name = 'Session name must be 1-50 characters';
  }

  if (state.courtName.length > 50) {
    errors.courtName = 'Court name must be 0-50 characters';
  }

  const count = Number(state.courtCount);
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    errors.courtCount = 'Court count must be between 1 and 12';
  }

  return errors;
}

/**
 * Validates a player name for the check-in section.
 * Returns an error message if trimmed length is outside 1-30, or null if valid.
 */
export function validatePlayerName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 30) {
    return 'Player name must be 1-30 characters';
  }
  return null;
}
