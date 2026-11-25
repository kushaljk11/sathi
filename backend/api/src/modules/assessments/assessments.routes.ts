import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './assessments.controller';
import { assessmentAnswers, saveDraftSchema } from './assessments.validation';

const router = Router();
router.use(authenticate);

router.get('/questions', controller.listQuestions);
router.post('/', requireRole('YOUTH'), controller.startOrResume);
router.put('/:id/draft', requireRole('YOUTH'), validate({ body: saveDraftSchema }), controller.saveDraft);
router.post('/:id/submit', requireRole('YOUTH'), controller.submit);
router.get('/history', requireRole('YOUTH'), controller.history);
router.get('/need-profile', requireRole('YOUTH'), controller.getNeedProfile);
router.put('/need-profile', requireRole('YOUTH'), validate({ body: assessmentAnswers }), controller.updateNeedProfile);

export default router;
