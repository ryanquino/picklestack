import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePlayerName } from './createSessionValidation';

/**
 * Property 5: Player name validation correctness
 * Validates: Requirements 7.5
 *
 * For any string, validatePlayerName SHALL return an error if and only if
 * the trimmed string length is outside 1-30 characters.
 */
describe('Feature: ui-polish-and-features, Property 5: Player name validation correctness', () => {
  it('returns error if and only if trimmed length is outside 1-30', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        (name: string) => {
          const result = validatePlayerName(name);
          const trimmedLength = name.trim().length;
          const shouldBeInvalid = trimmedLength < 1 || trimmedLength > 30;

          if (shouldBeInvalid) {
            expect(result).not.toBeNull();
          } else {
            expect(result).toBeNull();
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns error for empty strings', () => {
    fc.assert(
      fc.property(
        fc.constant(''),
        (name: string) => {
          const result = validatePlayerName(name);
          expect(result).not.toBeNull();
        }
      )
    );
  });

  it('returns error for whitespace-only strings', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 }).map(arr => arr.join('')),
        (name: string) => {
          const result = validatePlayerName(name);
          // Trimmed length is 0, so should return error
          expect(result).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null for strings with leading/trailing whitespace where trimmed length is valid (1-30)', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }).map(arr => arr.join('')),
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length >= 1 && s.trim().length <= 30),
          fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }).map(arr => arr.join(''))
        ),
        ([leading, core, trailing]) => {
          const name = leading + core + trailing;
          const trimmedLength = name.trim().length;
          if (trimmedLength >= 1 && trimmedLength <= 30) {
            const result = validatePlayerName(name);
            expect(result).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null for strings exactly at boundary length 1 (after trim)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1 }).filter(c => c.trim().length === 1),
        (name: string) => {
          const result = validatePlayerName(name);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('returns null for strings exactly at boundary length 30 (after trim)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 30, maxLength: 30 }).filter(s => s.trim().length === 30),
        (name: string) => {
          const result = validatePlayerName(name);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  it('returns error for strings with trimmed length 31', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 31, maxLength: 50 }).filter(s => s.trim().length === 31),
        (name: string) => {
          const result = validatePlayerName(name);
          expect(result).not.toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });
});
