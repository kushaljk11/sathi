import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger/logger';

/** One log line per request (method, path, status, duration). Query strings and bodies are never logged. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.baseUrl + req.path,
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
    });
  });
  next();
}
