import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './classes.controller';
import {
  classIdParamSchema,
  createClassSchema,
  enrollStudentSchema,
  listClassesQuerySchema,
  updateClassSchema,
} from './classes.schemas';

const router = Router();
router.use(authenticate);

router.get('/', validate(listClassesQuerySchema, 'query'), asyncHandler(controller.list));
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(createClassSchema), asyncHandler(controller.create));
router.get('/:id', validate(classIdParamSchema, 'params'), asyncHandler(controller.getOne));
router.get('/:id/roster', validate(classIdParamSchema, 'params'), asyncHandler(controller.roster));
router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(classIdParamSchema, 'params'),
  validate(updateClassSchema),
  asyncHandler(controller.update),
);
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(classIdParamSchema, 'params'),
  asyncHandler(controller.remove),
);
router.post(
  '/:id/enroll',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(classIdParamSchema, 'params'),
  validate(enrollStudentSchema),
  asyncHandler(controller.enroll),
);

export default router;
