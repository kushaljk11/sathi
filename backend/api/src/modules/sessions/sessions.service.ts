import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/app.error';
import { notify } from '../../helpers/notification.helper';
import { loadAppointmentForActor } from '../bookings/bookings.service';
import type { SessionRecordInput } from './sessions.types';

/** Session record (shared with youth). Private notes are a separate endpoint/model. */
export async function upsertSessionRecord(actorId: string, appointmentId: string, input: SessionRecordInput) {
  const { a, isCounselor } = await loadAppointmentForActor(appointmentId, actorId);
  if (!isCounselor) throw new AppError(403, 'Forbidden');
  if (!['CONFIRMED', 'COMPLETED'].includes(a.status)) throw new AppError(409, 'Session records are for confirmed or completed sessions');
  const rec = await prisma.sessionRecord.upsert({ where: { appointmentId: a.id }, update: input, create: { ...input, appointmentId: a.id } });
  await notify(a.youth.userId, { type: 'SESSION_RECORD', title: 'Session summary available', body: 'Your counselor shared a session summary.', key: `session-record:${rec.id}` });
  return rec;
}
