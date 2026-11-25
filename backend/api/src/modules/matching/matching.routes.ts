import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './matching.controller';
import { matchingConfigSchema } from './matching.validation';

const router = Router();
router.use(authenticate);

router.post('/run', requireRole('YOUTH'), controller.run);
router.get('/runs/latest', requireRole('YOUTH'), controller.latestRun);
router.get('/config', requireRole('ADMIN'), controller.listConfigs);
router.post('/config', requireRole('ADMIN'), validate({ body: matchingConfigSchema }), controller.createConfig);

export default router;
