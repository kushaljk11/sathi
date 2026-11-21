export interface RefundPolicy { fullHours: number; partialHours: number; partialPercent: number }
export const DEFAULT_REFUND_POLICY: RefundPolicy = { fullHours: 24, partialHours: 2, partialPercent: 50 };

/** Returns refund amount in paisa (integer). */
export function calculateRefund(
  amountPaisa: number,
  appointmentAt: Date,
  cancelledAt: Date,
  cancelledBy: 'YOUTH' | 'COUNSELOR',
  policy: RefundPolicy = DEFAULT_REFUND_POLICY,
): number {
  if (cancelledBy === 'COUNSELOR') return amountPaisa;
  const hours = (appointmentAt.getTime() - cancelledAt.getTime()) / 3_600_000;
  if (hours > policy.fullHours) return amountPaisa;
  if (hours >= policy.partialHours) return Math.floor((amountPaisa * policy.partialPercent) / 100);
  return 0;
}
