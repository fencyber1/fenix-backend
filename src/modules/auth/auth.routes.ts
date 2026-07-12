import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { validate } from '@/middleware/validate';
import { authenticate } from '@/middleware/auth';
import { authRateLimiter } from '@/middleware/rateLimit';
import * as controller from './auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas';

const router = Router();

// Public auth endpoints (rate-limited).
router.post('/register', authRateLimiter, validate(registerSchema), asyncHandler(controller.register));
router.post('/login', authRateLimiter, validate(loginSchema), asyncHandler(controller.login));
router.post('/refresh', asyncHandler(controller.refresh));
router.post('/logout', asyncHandler(controller.logout));
router.post(
  '/forgot-password',
  authRateLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(controller.forgotPassword),
);
router.post(
  '/reset-password',
  authRateLimiter,
  validate(resetPasswordSchema),
  asyncHandler(controller.resetPassword),
);
router.post('/verify-email', validate(verifyEmailSchema), asyncHandler(controller.verifyEmail));

// Authenticated.
router.get('/me', authenticate, asyncHandler(controller.me));
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(controller.changePassword),
);

export default router;
