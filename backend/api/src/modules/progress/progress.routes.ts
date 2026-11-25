import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './progress.controller';
import { createReviewSchema, progressRangeQuery, relationshipIdParams } from './progress.validation';

const router = Router();
router.use(authenticate, requireRole('YOUTH', 'COUNSELOR'));

router.get('/progress/me', requireRole('YOUTH'), validate({ query: progressRangeQuery }), controller.getMyProgress);
router.get('/relationships/:id/progress', requireRole('COUNSELOR'), validate({ params: relationshipIdParams, query: progressRangeQuery }), controller.getRelationshipProgress);
router.post('/relationships/:id/reviews', requireRole('COUNSELOR'), validate({ params: relationshipIdParams, body: createReviewSchema }), controller.createReview);

export default router;
