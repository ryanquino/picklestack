import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateSessionForm } from './createSessionValidation';

/**
 * Property 4: Session form validation correctness
 *
 * For any session name string, court name string, and court count number,
 * validateSessionForm SHALL return an error for `name` if and only if the
 * trimmed name length is outside 1-50 characters, return an error for
 * `courtName` if and only if the length exceeds 50 characters, and return
 * an error for `courtCount` if and only if the value is not an integer
 * between 1 and 12 inclusive.
 *
 * **Validates: Requirements 7.3**
 */
describe('Feature: ui-polish-and-features, Property 4: Session form validation correctness', () => {
  // Arbitrary for strings with leading/trailing whitespace
  const stringWithWhitespace = fc.tuple(
    fc.integer({ min: 0, max: 5 }),
    fc.string({ minLength: 0, maxLength: 100 }),
    fc.integer({ min: 0, max: 5 })
  ).map(([leadingCount, middle, trailingCount]) => ' '.repeat(leadingCount) + middle + ' '.repeat(trailingCount));

  // Arbitrary for diverse name inputs (0-100 chars including whitespace-padded)
  const nameArbitrary = fc.oneof(
    fc.string({ minLength: 0, maxLength: 100 }),
    stringWithWhitespace,
    fc.constant(''),
    fc.constant('   '),
    fc.integer({ min: 51, max: 100 }).map(len => 'a'.repeat(len))
  );

  // Arbitrary for court name inputs (0-100 chars)
  const courtNameArbitrary = fc.oneof(
    fc.string({ minLength: 0, maxLength: 100 }),
    fc.constant(''),
    fc.integer({ min: 51, max: 100 }).map(len => 'x'.repeat(len))
  );

  // Arbitrary for court count including floats, negatives, zero, > 12
  const courtCountArbitrary = fc.oneof(
    fc.integer({ min: -100, max: 100 }),
    fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
    fc.constant(0),
    fc.constant(0.5),
    fc.constant(-1),
    fc.constant(13),
    fc.constant(1),
    fc.constant(12)
  );

  it('returns name error if and only if trimmed name length is outside 1-50', () => {
    fc.assert(
      fc.property(nameArbitrary, (name) => {
        const result = validateSessionForm({ name, courtName: 'Valid', courtCount: 4 });
        const trimmedLength = name.trim().length;
        const shouldHaveError = trimmedLength < 1 || trimmedLength > 50;

        if (shouldHaveError) {
          expect(result.name).toBeDefined();
        } else {
          expect(result.name).toBeUndefined();
        }
      }),
      { numRuns: 200 }
    );
  });

  it('returns courtName error if and only if length exceeds 50', () => {
    fc.assert(
      fc.property(courtNameArbitrary, (courtName) => {
        const result = validateSessionForm({ name: 'Valid Session', courtName, courtCount: 4 });
        const shouldHaveError = courtName.length > 50;

        if (shouldHaveError) {
          expect(result.courtName).toBeDefined();
        } else {
          expect(result.courtName).toBeUndefined();
        }
      }),
      { numRuns: 200 }
    );
  });

  it('returns courtCount error if and only if value is not an integer between 1 and 12', () => {
    fc.assert(
      fc.property(courtCountArbitrary, (courtCount) => {
        const result = validateSessionForm({ name: 'Valid Session', courtName: 'Court', courtCount });
        const shouldHaveError = !Number.isInteger(courtCount) || courtCount < 1 || courtCount > 12;

        if (shouldHaveError) {
          expect(result.courtCount).toBeDefined();
        } else {
          expect(result.courtCount).toBeUndefined();
        }
      }),
      { numRuns: 200 }
    );
  });

  it('validates all fields simultaneously with diverse inputs', () => {
    fc.assert(
      fc.property(nameArbitrary, courtNameArbitrary, courtCountArbitrary, (name, courtName, courtCount) => {
        const result = validateSessionForm({ name, courtName, courtCount });

        // Name validation
        const trimmedLength = name.trim().length;
        const nameInvalid = trimmedLength < 1 || trimmedLength > 50;
        if (nameInvalid) {
          expect(result.name).toBeDefined();
        } else {
          expect(result.name).toBeUndefined();
        }

        // Court name validation
        const courtNameInvalid = courtName.length > 50;
        if (courtNameInvalid) {
          expect(result.courtName).toBeDefined();
        } else {
          expect(result.courtName).toBeUndefined();
        }

        // Court count validation
        const courtCountInvalid = !Number.isInteger(courtCount) || courtCount < 1 || courtCount > 12;
        if (courtCountInvalid) {
          expect(result.courtCount).toBeDefined();
        } else {
          expect(result.courtCount).toBeUndefined();
        }
      }),
      { numRuns: 200 }
    );
  });

  it('returns no errors for valid inputs', () => {
    // Valid name: 1-50 chars after trimming
    const validName = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length >= 1 && s.trim().length <= 50);
    // Valid court name: 0-50 chars
    const validCourtName = fc.string({ minLength: 0, maxLength: 50 });
    // Valid court count: integer 1-12
    const validCourtCount = fc.integer({ min: 1, max: 12 });

    fc.assert(
      fc.property(validName, validCourtName, validCourtCount, (name, courtName, courtCount) => {
        const result = validateSessionForm({ name, courtName, courtCount });
        expect(result.name).toBeUndefined();
        expect(result.courtName).toBeUndefined();
        expect(result.courtCount).toBeUndefined();
      }),
      { numRuns: 200 }
    );
  });
});
