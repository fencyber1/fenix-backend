import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/rbac';
import { validate } from '@/middleware/validate';
import * as controller from './schools.controller';
import { notificationPrefSchema, updateSchoolSchema } from './schools.schemas';

const router = Router();
router.use(authenticate);

router.get('/me', asyncHandler(controller.get));
router.put('/me', authorize('SUPER_ADMIN', 'ADMIN'), validate(updateSchoolSchema), asyncHandler(controller.update));
router.get('/me/notification-preferences', asyncHandler(controller.getPrefs));
router.put('/me/notification-preferences', validate(notificationPrefSchema), asyncHandler(controller.setPrefs));

export default router;
