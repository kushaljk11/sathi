import { Router } from 'express';
import { prisma } from './config/database';
import { googleConfigured, khaltiConfigured, esewaConfigured } from './config/env';
import { openapi } from './config/openapi';
import { asyncHandler } from './utils/async-handler.util';
import { ok } from './utils/response.util';

import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/users.routes';
import profileRoutes from './modules/profiles/profiles.routes';
import organizationRoutes, { organizationProgramRoutes } from './modules/organizations/organizations.routes';
import consentRoutes from './modules/consents/consents.routes';
import assessmentRoutes from './modules/assessments/assessments.routes';
import safetyRoutes from './modules/safety/safety.routes';
import checkinRoutes from './modules/checkins/checkins.routes';
import matchingRoutes from './modules/matching/matching.routes';
import availabilityRoutes from './modules/availability/availability.routes';
import counselorRoutes from './modules/counselors/counselors.routes';
import bookingRoutes from './modules/bookings/bookings.routes';
import sessionRoutes from './modules/sessions/sessions.routes';
import paymentRoutes from './modules/payments/payments.routes';
import meetingRoutes from './modules/meetings/meetings.routes';
import supportRoutes from './modules/support/support.routes';
import planRoutes from './modules/plans/plans.routes';
import progressRoutes from './modules/progress/progress.routes';
import recommendationRoutes from './modules/recommendations/recommendations.routes';
import programRoutes from './modules/programs/programs.routes';
import communityRoutes from './modules/community/community.routes';
import moderationRoutes from './modules/moderation/moderation.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import resourceRoutes from './modules/resources/resources.routes';
import chatRoutes from './modules/chat/chat.routes';
import adminRoutes from './modules/admin/admin.routes';
import { blogRoutes, contactRoutes, adminCmsRoutes } from './modules/cms/cms.routes';

/**
 * All versioned API routes (mounted at /api/v1 by app.ts).
 * Order matters where modules share a prefix: more specific mounts come first.
 */
const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ok(res, { status: 'ok', db: 'up', integrations: { google: googleConfigured, esewa: esewaConfigured, khalti: khaltiConfigured } });
  }),
);
router.get('/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});
router.get('/openapi.json', (_req, res) => {
  res.json(openapi);
});

router.use('/auth', authRoutes);
router.use('/users/organization', organizationRoutes);
router.use('/users', userRoutes);
router.use('/users', profileRoutes);
router.use('/check-ins', checkinRoutes);
router.use('/assessments', assessmentRoutes);
router.use('/safety', safetyRoutes);
router.use('/matching', matchingRoutes);
router.use('/consents', consentRoutes);
router.use('/counselors', availabilityRoutes);
router.use('/counselors', counselorRoutes);
router.use('/appointments', bookingRoutes);
router.use('/appointments', sessionRoutes);
router.use('/payments', paymentRoutes);
router.use('/meetings', meetingRoutes);
router.use('/support', supportRoutes);
router.use('/support', planRoutes);
router.use('/support', progressRoutes);
router.use('/programs/org', organizationProgramRoutes);
router.use('/programs', recommendationRoutes);
router.use('/programs', programRoutes);
router.use('/community', communityRoutes);
router.use('/notifications', notificationRoutes);
router.use('/resources', resourceRoutes);
router.use('/chat', chatRoutes);
router.use('/blog', blogRoutes);
router.use('/contact', contactRoutes);
router.use('/admin/cms', adminCmsRoutes);
router.use('/admin/moderation', moderationRoutes);
router.use('/admin', adminRoutes);

export default router;
