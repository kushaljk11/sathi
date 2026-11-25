import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './availability.controller';
import { exceptionSchema, generateSlotsSchema, replaceAvailabilitySchema } from './availability.validation';

const router = Router();
router.use(authenticate);

// Mounted at /counselors alongside the public directory, so role guards are per route.
const counselorOnly = requireRole('COUNSELOR');

router.get('/me/availability', counselorOnly, controller.getAvailability);
router.put('/me/availability', counselorOnly, validate({ body: replaceAvailabilitySchema }), controller.replaceAvailability);
router.post('/me/exceptions', counselorOnly, validate({ body: exceptionSchema }), controller.addException);
router.delete('/me/exceptions/:id', counselorOnly, controller.removeException);
router.post('/me/slots/generate', counselorOnly, validate({ body: generateSlotsSchema }), controller.generateSlots);
router.get('/me/slots', counselorOnly, controller.listSlots);
router.delete('/me/slots/:id', counselorOnly, controller.removeSlot);

export default router;
