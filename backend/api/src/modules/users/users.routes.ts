import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './users.controller';
import { deleteAccountSchema, notificationPreferencesSchema, updateMeSchema } from './users.validation';

const router = Router();
router.use(authenticate);

router.patch('/me', validate({ body: updateMeSchema }), controller.updateMe);
router.get('/me/notification-preferences', controller.getNotificationPreferences);
router.put('/me/notification-preferences', validate({ body: notificationPreferencesSchema }), controller.updateNotificationPreferences);
router.get('/me/export', controller.exportData);
router.post('/me/delete', validate({ body: deleteAccountSchema }), controller.deleteAccount);

export default router;
