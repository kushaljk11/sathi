import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './payments.controller';
import { initiatePaymentSchema } from './payments.validation';

const router = Router();

router.get('/providers', controller.providers);
router.post('/initiate', authenticate, requireRole('YOUTH'), validate({ body: initiatePaymentSchema }), controller.initiate);
router.get('/:reference', authenticate, controller.status);
router.get('/', authenticate, controller.list);

// Gateway return URLs are public browser redirects; the controller always verifies server-to-server.
router.get('/esewa/return/:reference', controller.esewaReturn);
router.get('/esewa/failed/:reference', controller.esewaFailed);
router.get('/khalti/return/:reference', controller.khaltiReturn);

export default router;
