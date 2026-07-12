import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import { authRateLimiter } from '@/middleware/rateLimit';
import * as controller from './invitations.controller';
import { inviteUserSchema, registerWithTokenSchema } from './invitations.schemas';

const router = Router();

// Public
router.get('/validate', asyncHandler(controller.validateToken));
router.post('/register', authRateLimiter, validate(registerWithTokenSchema), asyncHandler(controller.register));

// Admin-only
router.use(authenticate);
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(inviteUserSchema), asyncHandler(controller.invite));
router.get('/', authorize('SUPER_ADMIN', 'ADMIN'), asyncHandler(controller.list));
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), asyncHandler(controller.revoke));

export default router;
