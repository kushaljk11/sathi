import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { createLimiter } from '../../core/middleware/rate-limit.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import { POST_RATE_LIMIT, POST_RATE_WINDOW_MS } from './community.constants';
import * as controller from './community.controller';
import {
  appealSchema,
  blockSchema,
  contentParamsSchema,
  createCommentSchema,
  createPostSchema,
  idParamsSchema,
  listPostsQuerySchema,
  reactionSchema,
  reportSchema,
} from './community.validation';

const router = Router();
router.use(authenticate);

const postLimiter = createLimiter(POST_RATE_WINDOW_MS, POST_RATE_LIMIT, { keyGenerator: (req) => req.user!.id });

router.get('/categories', controller.categories);

router.get('/posts', validate({ query: listPostsQuerySchema }), controller.listPosts);
router.post('/posts', postLimiter, validate({ body: createPostSchema }), controller.createPost);
router.get('/posts/:id', validate({ params: idParamsSchema }), controller.getPost);
router.post('/posts/:id/comments', postLimiter, validate({ params: idParamsSchema, body: createCommentSchema }), controller.createComment);

router.put('/content/:type/:id', postLimiter, validate({ params: contentParamsSchema }), controller.editContent);
router.delete('/content/:type/:id', validate({ params: contentParamsSchema }), controller.removeContent);

router.post('/posts/:id/reactions', validate({ params: idParamsSchema, body: reactionSchema }), controller.toggleReaction);

router.post('/reports', validate({ body: reportSchema }), controller.reportContent);

router.get('/blocks', controller.listBlocks);
router.post('/blocks', validate({ body: blockSchema }), controller.blockAuthor);
router.delete('/blocks/:id', validate({ params: idParamsSchema }), controller.unblock);

router.get('/my-content', controller.myContent);
router.post('/appeals', validate({ body: appealSchema }), controller.submitAppeal);

export default router;
