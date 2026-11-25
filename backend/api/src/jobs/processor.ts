import { sendEmail } from '../integrations/email/email.client';
import { ensureMeeting } from '../modules/meetings/meetings.service';
import { deliverNotification } from './delivery.job';
import { appointmentReminder, followUp, daily } from './reminders.job';
import { sweep } from './maintenance.job';

export { DelayError } from './delivery.job';
export { sweep, daily };

/**
 * Single entry point for every background job. Used by the BullMQ worker (backend/worker)
 * and directly by tests, so business rules live in one place.
 */
export async function processJob(name: string, data: Record<string, unknown>) {
  switch (name) {
    case 'email':
      return sendEmail(String(data.to), String(data.subject), String(data.text));
    case 'deliver':
      return deliverNotification(data);
    case 'appointment-reminder':
      return appointmentReminder(data);
    case 'followup':
      return followUp(data);
    case 'meeting-create':
      await ensureMeeting(String(data.appointmentId));
      return;
    case 'sweep':
      return sweep();
    case 'daily':
      return daily();
  }
}
