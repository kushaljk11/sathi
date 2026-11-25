import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MESSAGES } from '../../constants/messages.constants';
import { AppError } from '../errors/app.error';
import { ERROR_CODES } from '../errors/error.codes';
import { logger } from '../logger/logger';

const fail = (res: Response, status: number, code: string, message: string, extra?: object) =>
  res.status(status).json({ success: false, error: { code, message, ...extra } });

export const notFoundHandler = (_req: Request, res: Response) => fail(res, 404, ERROR_CODES.NOT_FOUND, MESSAGES.ROUTE_NOT_FOUND);

/** Last middleware: maps known errors to the API error envelope. Stack traces are never sent to clients. */
// Express only treats a handler as an error handler when it declares all four parameters.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return fail(res, 400, ERROR_CODES.VALIDATION, MESSAGES.INVALID_INPUT, { fields: err.flatten().fieldErrors });
  if (err instanceof AppError) return fail(res, err.status, err.code, err.message);

  const code = (err as { code?: string })?.code;
  if (code === 'P2002') return fail(res, 409, ERROR_CODES.CONFLICT, MESSAGES.ALREADY_EXISTS);
  if (code === 'P2025') return fail(res, 404, ERROR_CODES.NOT_FOUND, MESSAGES.NOT_FOUND);
  if (code === 'LIMIT_FILE_SIZE') return fail(res, 413, ERROR_CODES.TOO_LARGE, MESSAGES.FILE_TOO_LARGE);
  if ((err as { type?: string })?.type === 'entity.parse.failed') return fail(res, 400, ERROR_CODES.VALIDATION, 'Malformed JSON body');
  if ((err as { type?: string })?.type === 'entity.too.large') return fail(res, 413, ERROR_CODES.TOO_LARGE, 'Request body too large');

  logger.error('Unhandled error', { method: req.method, path: req.path, error: err instanceof Error ? err.message : String(err) });
  return fail(res, 500, ERROR_CODES.INTERNAL, MESSAGES.INTERNAL);
}
