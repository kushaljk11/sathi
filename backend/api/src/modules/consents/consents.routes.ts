import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './consents.controller';
import { updateConsentsSchema } from './consents.validation';

const router = Router();
router.use(authenticate, requireRole('YOUTH'));

router.get('/descriptions', controller.descriptions);
router.get('/', controller.list);
router.put('/', validate({ body: updateConsentsSchema }), controller.update);
router.get('/access-log', controller.accessLog);

export default router;
