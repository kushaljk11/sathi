/** Reusable user-facing messages. Keep wording neutral — never include wellbeing details. */
export const MESSAGES = {
  ROUTE_NOT_FOUND: 'Route not found',
  INVALID_INPUT: 'Invalid input',
  AUTH_REQUIRED: 'Authentication required',
  AUTH_INVALID_TOKEN: 'Invalid or expired token',
  AUTH_ACCOUNT_UNAVAILABLE: 'Account unavailable',
  FORBIDDEN: 'Forbidden',
  BAD_ORIGIN: 'Cross-site request blocked',
  INTERNAL: 'Something went wrong',
  ALREADY_EXISTS: 'This already exists',
  NOT_FOUND: 'Not found',
  FILE_TOO_LARGE: 'File too large',
} as const;
