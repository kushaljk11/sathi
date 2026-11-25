import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './support.controller';
import { createNoteSchema, relationshipIdParams, updateRelationshipStatusSchema } from './support.validation';

const router = Router();
router.use(authenticate, requireRole('YOUTH', 'COUNSELOR'));

router.get('/relationships', controller.listRelationships);
router.get('/relationships/:id', validate({ params: relationshipIdParams }), controller.getRelationship);
router.patch('/relationships/:id/status', requireRole('COUNSELOR', 'YOUTH'), validate({ params: relationshipIdParams, body: updateRelationshipStatusSchema }), controller.updateRelationshipStatus);

// Private counselor notes: counselor only; never shown to youth or admins.
router.get('/relationships/:id/notes', requireRole('COUNSELOR'), validate({ params: relationshipIdParams }), controller.listNotes);
router.post('/relationships/:id/notes', requireRole('COUNSELOR'), validate({ params: relationshipIdParams, body: createNoteSchema }), controller.createNote);

router.get('/relationships/:id/shared-profile', requireRole('COUNSELOR'), validate({ params: relationshipIdParams }), controller.getSharedProfile);

export default router;
