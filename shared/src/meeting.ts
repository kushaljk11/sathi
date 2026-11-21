export type MeetingStatus = 'PENDING' | 'CREATING' | 'READY' | 'FAILED' | 'CANCELLED' | 'COMPLETED';

const M: Record<MeetingStatus, MeetingStatus[]> = {
  PENDING: ['CREATING', 'READY', 'CANCELLED'],
  CREATING: ['READY', 'FAILED', 'CANCELLED'],
  FAILED: ['CREATING', 'READY', 'CANCELLED'],
  READY: ['CANCELLED', 'COMPLETED', 'CREATING'], // CREATING on reschedule re-sync
  CANCELLED: [],
  COMPLETED: [],
};
export const canMeetingTransition = (a: MeetingStatus, b: MeetingStatus) => M[a].includes(b);

/** Meetings exist only for confirmed online appointments. */
export const needsOnlineMeeting = (appointmentStatus: string, mode: string) =>
  appointmentStatus === 'CONFIRMED' && mode === 'ONLINE';

/** Join link is visible only to participants, only when ready, and only near the session window. */
export function canJoin(opts: { isParticipant: boolean; status: MeetingStatus; startTime: Date; endTime: Date; now?: Date }) {
  const now = opts.now ?? new Date();
  const opensAt = new Date(opts.startTime.getTime() - 24 * 3600_000);
  return opts.isParticipant && opts.status === 'READY' && now >= opensAt && now <= opts.endTime;
}

export const REMINDER_OFFSETS_MIN = [24 * 60, 60, 15];
