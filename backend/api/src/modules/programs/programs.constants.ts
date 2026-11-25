/** Program fields that are safe to show to any signed-in user. */
export const PUBLIC_PROGRAM_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  startsAt: true,
  endsAt: true,
  seats: true,
  seatsTaken: true,
  minAge: true,
  maxAge: true,
  eligibility: true,
  locationArea: true,
  mode: true,
  costPaisa: true,
  requirements: true,
  organization: { select: { id: true, name: true, locationArea: true } },
} as const;
