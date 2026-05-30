import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './audit.controller';
import { listAuditQuerySchema } from './audit.schemas';

const router = Router();
router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(listAuditQuerySchema, 'query'), asyncHandler(controller.list));

export default router;
