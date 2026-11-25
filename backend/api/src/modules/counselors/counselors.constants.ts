import { MINUTE_MS } from '../../utils/date.util';

export const DIRECTORY_LIMIT = 50;

/** Earliest bookable slot is this far in the future when the client does not pass a later `from`. */
export const MIN_BOOKING_LEAD_MS = 30 * MINUTE_MS;

/** Fields of a counselor profile that are safe to show in the public directory. */
export const PUBLIC_COUNSELOR_SELECT = {
  id: true,
  qualifications: true,
  experienceYears: true,
  bio: true,
  specializations: true,
  supportedConcerns: true,
  languages: true,
  ageGroups: true,
  locationArea: true,
  mode: true,
  sessionFeePaisa: true,
  acceptingBookings: true,
  user: { select: { displayName: true } },
} as const;
