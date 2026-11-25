import { Router } from 'express';
import { authenticate, requireRole } from '../../core/middleware/auth.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import { upload } from '../../helpers/file.helper';
import * as controller from './organizations.controller';
import { addStaffSchema, attendanceSchema, bookingStatusSchema, idParamSchema, organizationProfileSchema, programSchema, serviceSchema } from './organizations.validation';

const orgOnly = requireRole('ORGANIZATION');
const params = validate({ params: idParamSchema });

/** Organization profile, documents and staff. Mounted at /users/organization. */
const router = Router();
router.use(authenticate);

router.get('/me', orgOnly, controller.getOrganization);
router.put('/me', orgOnly, validate({ body: organizationProfileSchema }), controller.updateOrganization);
router.post('/me/documents', orgOnly, upload.single('file'), controller.uploadDocument);
router.post('/me/submit-verification', orgOnly, controller.submitVerification);
router.post('/me/staff', orgOnly, validate({ body: addStaffSchema }), controller.addStaff);
router.delete('/me/staff/:userId', orgOnly, controller.removeStaff);

/** Organization-side program and service management. Mounted at /programs/org. */
const programRouter = Router();
programRouter.use(authenticate);

programRouter.get('/programs', orgOnly, controller.listPrograms);
programRouter.post('/programs', orgOnly, validate({ body: programSchema }), controller.createProgram);
programRouter.put('/programs/:id', orgOnly, validate({ params: idParamSchema, body: programSchema }), controller.updateProgram);
programRouter.post('/programs/:id/submit', orgOnly, params, controller.submitProgram);
programRouter.post('/programs/:id/archive', orgOnly, params, controller.archiveProgram);
programRouter.get('/programs/:id/bookings', orgOnly, params, controller.listProgramBookings);
programRouter.post('/bookings/:id/attendance', orgOnly, validate({ params: idParamSchema, body: attendanceSchema }), controller.recordAttendance);
programRouter.post('/bookings/:id/status', orgOnly, validate({ params: idParamSchema, body: bookingStatusSchema }), controller.updateBookingStatus);

programRouter.get('/services', orgOnly, controller.listServices);
programRouter.post('/services', orgOnly, validate({ body: serviceSchema }), controller.createService);
programRouter.put('/services/:id', orgOnly, validate({ params: idParamSchema, body: serviceSchema }), controller.updateService);
programRouter.post('/services/:id/submit', orgOnly, params, controller.submitService);
programRouter.post('/services/:id/archive', orgOnly, params, controller.archiveService);

export { programRouter as organizationProgramRoutes };
export default router;
