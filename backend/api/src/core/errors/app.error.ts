import { ERROR_CODES } from './error.codes';

/**
 * Expected, user-facing error. The error middleware serialises it as
 * `{ success: false, error: { code, message } }` with the given HTTP status.
 * Feature-specific codes (e.g. 'SLOT_UNAVAILABLE') may be passed as plain strings.
 */
export class AppError extends Error {
  constructor(public status: number, message: string, public code: string = ERROR_CODES.GENERIC) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError(404, `${what} not found`, ERROR_CODES.NOT_FOUND);
export const forbidden = () => new AppError(403, 'Forbidden', ERROR_CODES.FORBIDDEN);
export const unauthenticated = (message = 'Authentication required') => new AppError(401, message, ERROR_CODES.UNAUTHENTICATED);
