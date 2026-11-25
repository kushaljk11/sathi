import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './safety.controller';
import { screeningSchema } from './safety.validation';

/** Safety pathway (independent of matching). */
const router = Router();
router.use(authenticate);

router.get('/questions', controller.listQuestions);
router.get('/resources', controller.listResources);
router.post('/screenings', requireRole('YOUTH'), validate({ body: screeningSchema }), controller.createScreening);

export default router;
