import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './checkins.controller';
import { checkInSchema, listCheckInsQuery } from './checkins.validation';

const router = Router();
router.use(authenticate, requireRole('YOUTH'));

router.post('/', validate({ body: checkInSchema }), controller.createCheckIn);
router.get('/', validate({ query: listCheckInsQuery }), controller.listCheckIns);

export default router;
