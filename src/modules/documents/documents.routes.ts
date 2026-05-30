import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './documents.controller';
import {
  confirmDocumentSchema,
  documentIdParamSchema,
  listDocumentsQuerySchema,
  presignSchema,
} from './documents.schemas';

const router = Router();
router.use(authenticate);

router.get('/', validate(listDocumentsQuerySchema, 'query'), asyncHandler(controller.list));
router.post('/presign', authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'), validate(presignSchema), asyncHandler(controller.presign));
router.post('/confirm', authorize('SUPER_ADMIN', 'ADMIN', 'TEACHER'), validate(confirmDocumentSchema), asyncHandler(controller.confirm));
router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), validate(documentIdParamSchema, 'params'), asyncHandler(controller.remove));

export default router;
