import type { Role } from '@sathi/shared';

export const ROLES = {
  YOUTH: 'YOUTH',
  COUNSELOR: 'COUNSELOR',
  ORGANIZATION: 'ORGANIZATION',
  ADMIN: 'ADMIN',
} as const satisfies Record<Role, Role>;

/** Roles that take part in a support relationship. */
export const SUPPORT_ROLES: Role[] = [ROLES.YOUTH, ROLES.COUNSELOR];
