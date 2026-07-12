import { Router } from 'express';
import authRoutes from '@/modules/auth/auth.routes';
import invitationRoutes from '@/modules/invitations/invitations.routes';
import studentRoutes from '@/modules/students/students.routes';
import attendanceRoutes from '@/modules/attendance/attendance.routes';
import gradeRoutes from '@/modules/grades/grades.routes';
import feeRoutes from '@/modules/fees/fees.routes';
import classRoutes from '@/modules/classes/classes.routes';
import subjectRoutes from '@/modules/subjects/subjects.routes';
import staffRoutes from '@/modules/staff/staff.routes';
import userRoutes from '@/modules/users/users.routes';
import tenantRoutes from '@/modules/tenants/tenants.routes';
import notificationRoutes from '@/modules/notifications/notifications.routes';
import auditRoutes from '@/modules/audit/audit.routes';
import documentRoutes from '@/modules/documents/documents.routes';
import dashboardRoutes from '@/modules/dashboard/dashboard.routes';

/** Versioned API router: all routes mounted under /api/v1. */
export function buildApiRouter(): Router {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use('/invitations', invitationRoutes);
  router.use('/students', studentRoutes);
  router.use('/attendance', attendanceRoutes);
  router.use('/grades', gradeRoutes);
  router.use('/fees', feeRoutes);
  router.use('/classes', classRoutes);
  router.use('/subjects', subjectRoutes);
  router.use('/staff', staffRoutes);
  router.use('/users', userRoutes);
  router.use('/tenants', tenantRoutes);
  router.use('/notifications', notificationRoutes);
  router.use('/audit-logs', auditRoutes);
  router.use('/documents', documentRoutes);
  router.use('/dashboard', dashboardRoutes);

  return router;
}
