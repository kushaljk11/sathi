export type AppointmentStatus =
  | 'PENDING_PAYMENT' | 'PENDING_COUNSELOR' | 'CONFIRMED' | 'DECLINED'
  | 'CANCELLED' | 'COMPLETED' | 'MISSED' | 'EXPIRED';

const T: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING_PAYMENT: ['PENDING_COUNSELOR', 'CANCELLED', 'EXPIRED'],
  PENDING_COUNSELOR: ['CONFIRMED', 'DECLINED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'MISSED', 'CANCELLED'],
  DECLINED: [], CANCELLED: [], COMPLETED: [], MISSED: [], EXPIRED: [],
};
export const canTransition = (from: AppointmentStatus, to: AppointmentStatus) => T[from].includes(to);
export function assertTransition(from: AppointmentStatus, to: AppointmentStatus) {
  if (!canTransition(from, to)) throw new Error(`Invalid appointment transition ${from} -> ${to}`);
}
export const SLOT_HOLD_MINUTES = 10;

/** Program capacity decision; seats never go negative. */
export function programSeatOutcome(seats: number, taken: number): 'CONFIRMED' | 'WAITLISTED' {
  return taken < seats ? 'CONFIRMED' : 'WAITLISTED';
}

/** Returns null when there is no data (distinct from 0%). */
export function taskCompletionRate(statuses: string[]): number | null {
  const relevant = statuses.filter((s) => s !== 'CANCELLED');
  if (!relevant.length) return null;
  const done =
    relevant.filter((s) => s === 'COMPLETED').length +
    0.5 * relevant.filter((s) => s === 'PARTIALLY_COMPLETED').length;
  return Math.round((done / relevant.length) * 100);
}
