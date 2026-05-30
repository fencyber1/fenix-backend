import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import * as controller from './notifications.controller';
import { listNotificationsQuerySchema, notificationIdParamSchema } from './notifications.schemas';

const router = Router();
router.use(authenticate);

router.get('/', validate(listNotificationsQuerySchema, 'query'), asyncHandler(controller.list));
router.patch('/read-all', asyncHandler(controller.markAllRead));
router.patch('/:id/read', validate(notificationIdParamSchema, 'params'), asyncHandler(controller.markRead));

export default router;
