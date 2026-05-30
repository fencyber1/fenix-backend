import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './subjects.controller';
import { createSubjectSchema, listSubjectsQuerySchema, subjectIdParamSchema, updateSubjectSchema } from './subjects.schemas';

const router = Router();
router.use(authenticate);

router.get('/', validate(listSubjectsQuerySchema, 'query'), asyncHandler(controller.list));
router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(createSubjectSchema), asyncHandler(controller.create));
router.put('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(subjectIdParamSchema, 'params'), validate(updateSubjectSchema), asyncHandler(controller.update));
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(subjectIdParamSchema, 'params'), asyncHandler(controller.remove));

export default router;
