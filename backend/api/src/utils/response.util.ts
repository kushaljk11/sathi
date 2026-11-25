import type { Response } from 'express';
import type { ApiSuccess } from '../types/api.types';

/** Sends `{ success: true, data }`. */
export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ success: true, data } satisfies ApiSuccess<T>);
