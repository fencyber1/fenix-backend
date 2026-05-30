import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './students.controller';
import {
  createStudentSchema,
  importStudentsSchema,
  listStudentsQuerySchema,
  studentIdParamSchema,
  updateStudentSchema,
} from './students.schemas';

const router = Router();
router.use(authenticate);

router.get('/', validate(listStudentsQuerySchema, 'query'), asyncHandler(controller.list));

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(createStudentSchema),
  asyncHandler(controller.create),
);

router.post(
  '/import',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(importStudentsSchema),
  asyncHandler(controller.importCsv),
);

router.get(
  '/:id',
  validate(studentIdParamSchema, 'params'),
  asyncHandler(controller.getOne),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  validate(studentIdParamSchema, 'params'),
  validate(updateStudentSchema),
  asyncHandler(controller.update),
);

router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(studentIdParamSchema, 'params'),
  asyncHandler(controller.remove),
);

export default router;
