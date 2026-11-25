import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';

const transport = env.EMAIL_HOST
  ? nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT ?? 587,
      secure: env.EMAIL_PORT === 465,
      auth: env.EMAIL_USER ? { user: env.EMAIL_USER, pass: env.EMAIL_PASSWORD } : undefined,
    })
  : null;

/** Sends a plain-text email through SMTP. Without EMAIL_HOST a clearly-labelled DEV adapter logs it instead. */
export async function sendEmail(to: string, subject: string, text: string) {
  if (!transport) return logger.info(`[DEV EMAIL ADAPTER] to=${to} subject="${subject}"\n${text}`);
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, text });
}
