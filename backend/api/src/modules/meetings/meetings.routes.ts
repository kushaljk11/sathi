import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './meetings.controller';
import { manualLinkSchema } from './meetings.validation';

const router = Router();

// ---------- Google OAuth (counselors) ----------
router.get('/google/status', authenticate, requireRole('COUNSELOR'), controller.googleStatus);
router.post('/google/connect', authenticate, requireRole('COUNSELOR'), controller.googleConnect);
// Public browser redirect from Google; the one-time `state` ties it to the counselor who started the flow.
router.get('/google/callback', controller.googleCallback);
router.delete('/google', authenticate, requireRole('COUNSELOR'), controller.googleDisconnect);

// ---------- Meeting access (participants only) ----------
router.get('/upcoming', authenticate, requireRole('YOUTH', 'COUNSELOR'), controller.upcoming);
router.get('/appointment/:id', authenticate, controller.forAppointment);
router.post('/appointment/:id/retry', authenticate, requireRole('COUNSELOR'), controller.retry);
router.post('/appointment/:id/cancel', authenticate, requireRole('COUNSELOR'), controller.cancel);
router.put('/appointment/:id/manual-link', authenticate, requireRole('COUNSELOR'), validate({ body: manualLinkSchema }), controller.setManualLink);

export default router;
