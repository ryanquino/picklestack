/**
 * Custom error class for input validation failures.
 * Includes the invalid field name(s) so API layer can map to HTTP 400.
 */
export class ValidationError extends Error {
  public readonly fields: string[];

  constructor(message: string, fields: string[]) {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/**
 * Custom error class for resource not found conditions.
 * API layer should map to HTTP 404.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
