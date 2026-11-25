import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './bookings.controller';
import { cancelBookingSchema, createBookingSchema, decisionSchema, holdSlotSchema, listBookingsQuery, outcomeSchema, rescheduleSchema } from './bookings.validation';

const router = Router();
router.use(authenticate);

router.post('/holds', requireRole('YOUTH'), validate({ body: holdSlotSchema }), controller.holdSlot);
router.delete('/holds/:id', requireRole('YOUTH'), controller.releaseHold);
router.post('/', requireRole('YOUTH'), validate({ body: createBookingSchema }), controller.createBooking);
router.get('/', requireRole('YOUTH', 'COUNSELOR'), validate({ query: listBookingsQuery }), controller.listAppointments);
router.post('/:id/decision', requireRole('COUNSELOR'), validate({ body: decisionSchema }), controller.decide);
router.post('/:id/cancel', requireRole('YOUTH', 'COUNSELOR'), validate({ body: cancelBookingSchema }), controller.cancel);
router.post('/:id/reschedule', requireRole('YOUTH'), validate({ body: rescheduleSchema }), controller.reschedule);
router.post('/:id/outcome', requireRole('COUNSELOR'), validate({ body: outcomeSchema }), controller.outcome);

export default router;
