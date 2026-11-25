import type { Role } from '@sathi/shared';

/** Authenticated principal attached to `req.user` by the auth middleware. The role always comes from the database. */
export interface AuthUser {
  id: string;
  role: Role;
}
