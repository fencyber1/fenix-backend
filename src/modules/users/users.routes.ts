import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './users.controller';
import { inviteUserSchema } from './users.schemas';

const router = Router();
router.use(authenticate);

router.post('/invite', authorize('SUPER_ADMIN', 'ADMIN'), validate(inviteUserSchema), asyncHandler(controller.invite));

export default router;
