import { OAuth2Client } from 'google-auth-library';
import { calendar } from '@googleapis/calendar';
import { env, googleConfigured } from '../../lib/env';
import { prisma, decrypt } from '../../lib/core';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events']; // minimum needed for events with Meet links

export class MeetingProviderError extends Error {
  constructor(public code: 'NOT_CONNECTED' | 'REVOKED' | 'PROVIDER_ERROR' | 'NOT_CONFIGURED', message: string) { super(message); }
}

export interface MeetingDetails { providerMeetingId?: string; providerEventId?: string; meetingUrl: string }
export interface MeetingProvider {
  create(input: { organizerUserId: string; requestId: string; start: Date; end: Date; existingEventId?: string | null }): Promise<MeetingDetails>;
  reschedule(input: { organizerUserId: string; eventId: string; start: Date; end: Date }): Promise<void>;
  cancel(input: { organizerUserId: string; eventId: string }): Promise<void>;
}

export const oauthClient = () => new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);

async function authed(userId: string) {
  if (!googleConfigured) throw new MeetingProviderError('NOT_CONFIGURED', 'Google integration is not configured on this server');
  const cred = await prisma.googleCredential.findUnique({ where: { userId } });
  if (!cred) throw new MeetingProviderError('NOT_CONNECTED', 'Connect your Google account to create meetings');
  if (cred.status === 'REVOKED') throw new MeetingProviderError('REVOKED', 'Google authorization was revoked. Please reconnect.');
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(cred.encryptedRefresh) });
  return calendar({ version: 'v3', auth: client });
}

async function wrap<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MeetingProviderError) throw e;
    const msg = String((e as { message?: string })?.message ?? e);
    if (/invalid_grant|unauthorized_client|Token has been expired or revoked/i.test(msg)) {
      await prisma.googleCredential.update({ where: { userId }, data: { status: 'REVOKED', lastError: 'invalid_grant' } }).catch(() => {});
      throw new MeetingProviderError('REVOKED', 'Google authorization expired or was revoked. Please reconnect.');
    }
    throw new MeetingProviderError('PROVIDER_ERROR', 'Google Calendar request failed');
  }
}

/** Google Calendar event with generated Google Meet conference. No attendees are added (emails are not shared). */
export const googleMeetProvider: MeetingProvider = {
  async create({ organizerUserId, requestId, start, end, existingEventId }) {
    return wrap(organizerUserId, async () => {
      const cal = await authed(organizerUserId);
      let ev = existingEventId ? (await cal.events.get({ calendarId: 'primary', eventId: existingEventId })).data : null;
      if (!ev) {
        ev = (await cal.events.insert({
          calendarId: 'primary', conferenceDataVersion: 1, sendUpdates: 'none',
          requestBody: {
            summary: 'Sathi counseling session', description: 'Online session scheduled via Sathi. Recording is not enabled.',
            start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() }, visibility: 'private',
            guestsCanSeeOtherGuests: false, guestsCanInviteOthers: false,
            conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
          },
        })).data;
      }
      for (let i = 0; i < 3 && ev.conferenceData?.createRequest?.status?.statusCode === 'pending'; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        ev = (await cal.events.get({ calendarId: 'primary', eventId: ev.id! })).data;
      }
      const url = ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri;
      if (!url) throw new MeetingProviderError('PROVIDER_ERROR', 'Google did not return a Meet link');
      return { providerEventId: ev.id ?? undefined, providerMeetingId: ev.conferenceData?.conferenceId ?? undefined, meetingUrl: url };
    });
  },
  async reschedule({ organizerUserId, eventId, start, end }) {
    await wrap(organizerUserId, async () => {
      const cal = await authed(organizerUserId);
      await cal.events.patch({ calendarId: 'primary', eventId, sendUpdates: 'none', requestBody: { start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } } });
    });
  },
  async cancel({ organizerUserId, eventId }) {
    await wrap(organizerUserId, async () => {
      const cal = await authed(organizerUserId);
      await cal.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'none' });
    });
  },
};

/** Provider registry — swappable in tests and for future providers (e.g. CUSTOM_VIDEO). */
export const providers: { GOOGLE_MEET: MeetingProvider } = { GOOGLE_MEET: googleMeetProvider };
