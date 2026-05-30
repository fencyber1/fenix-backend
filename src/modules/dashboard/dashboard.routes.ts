import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import * as controller from './dashboard.controller';

const router = Router();
router.use(authenticate);
router.get('/', authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'), asyncHandler(controller.dashboard));

export default router;
