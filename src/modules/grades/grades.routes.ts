import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './grades.controller';
import {
  gradeIdParamSchema,
  listGradesQuerySchema,
  reportCardQuerySchema,
  updateGradeSchema,
  upsertGradeSchema,
} from './grades.schemas';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  validate(upsertGradeSchema),
  asyncHandler(controller.create),
);

router.get('/', validate(listGradesQuerySchema, 'query'), asyncHandler(controller.list));

router.get(
  '/report-card',
  validate(reportCardQuerySchema, 'query'),
  asyncHandler(controller.reportCard),
);

router.put(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'),
  validate(gradeIdParamSchema, 'params'),
  validate(updateGradeSchema),
  asyncHandler(controller.update),
);

export default router;
