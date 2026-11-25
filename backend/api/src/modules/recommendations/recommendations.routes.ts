import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './recommendations.controller';
import { createRecommendationSchema, rankQuery, recommendationIdParams, relationshipIdParams, respondSchema } from './recommendations.validation';

/** Mounted at /programs before the programs router; per-route role guards because the prefix is shared. */
const router = Router();
router.use(authenticate);

// Youth
router.get('/my/recommendations', requireRole('YOUTH'), controller.myRecommendations);
router.post('/my/recommendations/:id', requireRole('YOUTH'), validate({ params: recommendationIdParams, body: respondSchema }), controller.respond);

// Counselor
router.get('/recommend/for/:relationshipId', requireRole('COUNSELOR'), validate({ params: relationshipIdParams, query: rankQuery }), controller.rankForRelationship);
router.post('/recommend', requireRole('COUNSELOR'), validate({ body: createRecommendationSchema }), controller.create);
router.get('/recommend/sent/:relationshipId', requireRole('COUNSELOR'), validate({ params: relationshipIdParams }), controller.sent);

export default router;
