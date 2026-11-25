import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './chat.controller';
import { listMessagesQuery, messageIdParams, relationshipIdParams, reportMessageSchema } from './chat.validation';

const router = Router();
router.use(authenticate);

router.get('/:relationshipId/messages', validate({ params: relationshipIdParams, query: listMessagesQuery }), controller.listMessages);
router.post('/:relationshipId/messages', validate({ params: relationshipIdParams }), controller.sendMessage);
router.post('/:relationshipId/block', validate({ params: relationshipIdParams }), controller.blockConversation);
router.post('/:relationshipId/unblock', validate({ params: relationshipIdParams }), controller.unblockConversation);
router.post('/messages/:id/report', validate({ params: messageIdParams, body: reportMessageSchema }), controller.reportMessage);

export default router;
