import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './notifications.controller';
import { listNotificationsQuery } from './notifications.validation';

const router = Router();
router.use(authenticate);

router.get('/', validate({ query: listNotificationsQuery }), controller.listNotifications);
router.post('/:id/read', controller.markRead);
router.post('/read-all', controller.markAllRead);

export default router;
