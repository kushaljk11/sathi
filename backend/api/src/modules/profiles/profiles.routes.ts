import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import { upload } from '../../helpers/file.helper';
import * as controller from './profiles.controller';
import { counselorProfileSchema, youthProfileSchema } from './profiles.validation';

const router = Router();
router.use(authenticate);

// Mounted at /users alongside other modules, so role guards are per route.
router.get('/youth/me', requireRole('YOUTH'), controller.getYouthProfile);
router.put('/youth/me', requireRole('YOUTH'), validate({ body: youthProfileSchema }), controller.updateYouthProfile);

router.get('/counselor/me', requireRole('COUNSELOR'), controller.getCounselorProfile);
router.put('/counselor/me', requireRole('COUNSELOR'), validate({ body: counselorProfileSchema }), controller.updateCounselorProfile);
router.post('/counselor/me/documents', requireRole('COUNSELOR'), upload.single('file'), controller.uploadCounselorDocument);
router.post('/counselor/me/submit-verification', requireRole('COUNSELOR'), controller.submitCounselorVerification);

router.get('/documents/:id', controller.downloadDocument);

export default router;
