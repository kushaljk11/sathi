import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './sessions.controller';
import { sessionRecordSchema } from './sessions.validation';

const router = Router();

router.put('/:id/session-record', authenticate, requireRole('COUNSELOR'), validate({ body: sessionRecordSchema }), controller.saveSessionRecord);

export default router;
