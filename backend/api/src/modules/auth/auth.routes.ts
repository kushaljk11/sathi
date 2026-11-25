import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware';
import { authLimiter } from '../../core/middleware/rate-limit.middleware';
import { originCheck } from '../../core/middleware/origin.middleware';
import { validate } from '../../core/middleware/validation.middleware';
import * as controller from './auth.controller';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema } from './auth.validation';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
// Cookie-authenticated endpoints get a same-origin (CSRF) check.
router.post('/refresh', originCheck, controller.refresh);
router.post('/logout', originCheck, controller.logout);
router.post('/verify-email', validate({ body: verifyEmailSchema }), controller.verifyEmail);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), controller.resetPassword);
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), controller.changePassword);
router.get('/me', authenticate, controller.me);

export default router;
