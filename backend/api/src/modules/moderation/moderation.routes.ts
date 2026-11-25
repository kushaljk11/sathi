import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './moderation.controller';
import { caseActionSchema, caseIdParamsSchema, queueQuerySchema } from './moderation.validation';

/** Mounted at /admin/moderation. */
const router = Router();
router.use(authenticate, requireRole('ADMIN'));

router.get('/queue', validate({ query: queueQuerySchema }), controller.queue);
router.get('/cases/:id', validate({ params: caseIdParamsSchema }), controller.getCase);
router.post('/cases/:id/action', validate({ params: caseIdParamsSchema, body: caseActionSchema }), controller.applyAction);

export default router;
