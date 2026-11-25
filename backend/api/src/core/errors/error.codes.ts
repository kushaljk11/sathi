/** Machine-readable error codes returned in `{ success: false, error: { code } }`. */
export const ERROR_CODES = {
  GENERIC: 'ERROR',
  VALIDATION: 'VALIDATION',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_LARGE: 'TOO_LARGE',
  BAD_ORIGIN: 'BAD_ORIGIN',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
