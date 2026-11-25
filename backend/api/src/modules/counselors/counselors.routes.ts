import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './counselors.controller';
import { directoryQuerySchema, slotsQuerySchema } from './counselors.validation';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: directoryQuerySchema }), controller.list);
router.get('/:id', controller.getById);
router.get('/:id/slots', validate({ query: slotsQuerySchema }), controller.slots);

export default router;
