import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './programs.controller';
import { feedbackSchema, idParams, listProgramsQuery } from './programs.validation';

/** Discovery and youth bookings. Organization endpoints live in the organizations module. */
const router = Router();
router.use(authenticate);

// Discovery (any signed-in user)
router.get('/', validate({ query: listProgramsQuery }), controller.listPrograms);
router.get('/services', controller.listServices);
router.get('/categories', controller.listCategories);

// Youth bookings
router.get('/my/bookings', requireRole('YOUTH'), controller.myBookings);
router.get('/:id', validate({ params: idParams }), controller.getProgram);
router.post('/:id/book', requireRole('YOUTH'), validate({ params: idParams }), controller.book);
router.post('/:id/save', requireRole('YOUTH'), validate({ params: idParams }), controller.save);
router.delete('/:id/waitlist', requireRole('YOUTH'), validate({ params: idParams }), controller.leaveWaitlist);
router.post('/bookings/:id/cancel', requireRole('YOUTH'), validate({ params: idParams }), controller.cancelBooking);
router.post('/bookings/:id/feedback', requireRole('YOUTH'), validate({ params: idParams, body: feedbackSchema }), controller.submitFeedback);

export default router;
