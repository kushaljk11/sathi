import { Router } from 'express';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './resources.controller';
import { listResourcesQuery, resourceIdParams } from './resources.validation';

// Public resource library: published resources only, no authentication.
const router = Router();

router.get('/', validate({ query: listResourcesQuery }), controller.listResources);
router.get('/:id', validate({ params: resourceIdParams }), controller.getResource);

export default router;
