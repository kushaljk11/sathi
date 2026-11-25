import type { AuthUser } from './common.types';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
