
/** Shape returned by the appointment list. */
export const APPOINTMENT_INCLUDE = {
  counselor: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
  youth: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
  meeting: { select: { status: true, provider: true, creationStatus: true } },
  payments: { select: { status: true, provider: true, amountPaisa: true, reference: true }, orderBy: { createdAt: 'desc' as const } },
  sessionRecord: true,
} as const;
