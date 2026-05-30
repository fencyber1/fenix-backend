import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './staff.controller';
import { createStaffSchema, listStaffQuerySchema, staffIdParamSchema, updateStaffSchema } from './staff.schemas';

const router = Router();
router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(listStaffQuerySchema, 'query'), asyncHandler(controller.list));
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(createStaffSchema), asyncHandler(controller.create));
router.get('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(staffIdParamSchema, 'params'), asyncHandler(controller.getOne));
router.put('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(staffIdParamSchema, 'params'), validate(updateStaffSchema), asyncHandler(controller.update));
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(staffIdParamSchema, 'params'), asyncHandler(controller.remove));

export default router;
