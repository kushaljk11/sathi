import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates (and coerces) the request with Zod before the controller runs.
 * The parsed values replace `req.body`, `req.query` and `req.params`, so controllers can
 * safely cast them to the `z.infer` types exported from the module's `*.types.ts`.
 * ZodErrors are forwarded to the error middleware (HTTP 400, code VALIDATION).
 */
export const validate = (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.params) req.params = schemas.params.parse(req.params);
    // Express 5 exposes `req.query` as a getter, so it has to be redefined rather than assigned.
    if (schemas.query) Object.defineProperty(req, 'query', { value: schemas.query.parse(req.query), writable: true, configurable: true, enumerable: true });
    next();
  } catch (e) {
    next(e);
  }
};
