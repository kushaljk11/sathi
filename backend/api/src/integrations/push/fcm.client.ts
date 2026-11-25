import { env, fcmConfigured } from '../../config/env';
import { logger } from '../../core/logger/logger';

/** Push via FCM HTTP v1 when configured. The payload is neutral and never contains wellbeing details. */
export async function sendPush(token: string, title: string) {
  if (!fcmConfigured) return logger.info('[DEV PUSH ADAPTER] FCM not configured; push skipped');
  const { JWT } = await import('google-auth-library');
  const client = new JWT({ email: env.FCM_CLIENT_EMAIL, key: env.FCM_PRIVATE_KEY!.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
  const { token: access } = await client.getAccessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title: 'Sathi', body: title } } }),
  });
  if (!res.ok) throw new Error(`FCM ${res.status}`);
}
