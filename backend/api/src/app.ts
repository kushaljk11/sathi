import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env, isProd, googleConfigured, khaltiConfigured, esewaConfigured } from './lib/env';
import { errorHandler, ok, prisma, asyncH } from './lib/core';
import authRoutes from './modules/auth/auth.routes';
import checkinRoutes from './modules/checkins/checkins.routes';
import matchingRoutes from './modules/matching/matching.routes';
import userRoutes from './modules/users/users.routes';
import assessmentRoutes, { safety } from './modules/assessments/assessments.routes';
import consentRoutes from './modules/consents/consents.routes';
import counselorRoutes from './modules/counselors/counselors.routes';
import appointmentRoutes from './modules/appointments/appointments.routes';
import paymentRoutes from './modules/payments/payments.routes';
import meetingRoutes from './modules/meetings/meetings.routes';
import supportRoutes from './modules/support/support.routes';
import programRoutes from './modules/programs/programs.routes';
import communityRoutes from './modules/community/community.routes';
import adminRoutes from './modules/admin/admin.routes';
import { notifications, resources, chat } from './modules/misc/misc.routes';
import { openapi } from './openapi';
import { blog, contact, adminCms } from './modules/cms/cms.routes';

/** CSRF defence for cookie-authenticated endpoints: require same-origin Origin/Referer. */
function originCheck(req: Request, res: Response, next: NextFunction) {
  const o = req.get('origin') ?? req.get('referer') ?? '';
  if (env.NODE_ENV === 'test' || !o || o.startsWith(env.FRONTEND_URL)) return next();
  res.status(403).json({ success: false, error: { code: 'BAD_ORIGIN', message: 'Cross-site request blocked' } });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet({ hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false }));
  app.use(cors({ origin: [env.FRONTEND_URL], credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));

  const v1 = express.Router();
  v1.get('/health', asyncH(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ok(res, { status: 'ok', db: 'up', integrations: { google: googleConfigured, esewa: esewaConfigured, khalti: khaltiConfigured } });
  }));
  v1.get('/health/live', (_req, res) => { res.json({ status: 'ok' }); });
  v1.get('/openapi.json', (_req, res) => { res.json(openapi); });
  v1.use('/auth/refresh', originCheck);
  v1.use('/auth/logout', originCheck);
  v1.use('/auth', authRoutes);
  v1.use('/users', userRoutes);
  v1.use('/check-ins', checkinRoutes);
  v1.use('/assessments', assessmentRoutes);
  v1.use('/safety', safety);
  v1.use('/matching', matchingRoutes);
  v1.use('/consents', consentRoutes);
  v1.use('/counselors', counselorRoutes);
  v1.use('/appointments', appointmentRoutes);
  v1.use('/payments', paymentRoutes);
  v1.use('/meetings', meetingRoutes);
  v1.use('/support', supportRoutes);
  v1.use('/programs', programRoutes);
  v1.use('/community', communityRoutes);
  v1.use('/notifications', notifications);
  v1.use('/resources', resources);
  v1.use('/chat', chat);
  v1.use('/blog', blog);
  v1.use('/contact', contact);
  v1.use('/admin/cms', adminCms);
  v1.use('/admin', adminRoutes);
  app.use('/api/v1', v1);

  app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }));
  app.use(errorHandler);
  return app;
}
