import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './attendance.controller';
import {
  attendanceIdParamSchema,
  attendanceReportQuerySchema,
  bulkMarkSchema,
  correctAttendanceSchema,
  listAttendanceQuerySchema,
} from './attendance.schemas';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  validate(bulkMarkSchema),
  asyncHandler(controller.bulkMark),
);

router.get('/', validate(listAttendanceQuerySchema, 'query'), asyncHandler(controller.list));

router.get(
  '/report',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  validate(attendanceReportQuerySchema, 'query'),
  asyncHandler(controller.report),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  validate(attendanceIdParamSchema, 'params'),
  validate(correctAttendanceSchema),
  asyncHandler(controller.correct),
);

export default router;
