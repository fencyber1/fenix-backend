import type { Request, Response } from 'express';
import { created, ok, paginated } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import { assertCanAccessStudent } from '@/modules/shared/scope';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './attendance.service';
import type {
  AttendanceReportQuery,
  BulkMarkInput,
  CorrectAttendanceInput,
  ListAttendanceQuery,
} from './attendance.schemas';

function auditCtx(req: Request): AuditContext {
  return { actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function bulkMark(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.bulkMark(auth, req.body as BulkMarkInput, auditCtx(req));
  return created(res, result, 'Attendance recorded');
}

export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const query = req.query as unknown as ListAttendanceQuery;
  // Parents/students may only query by their own studentId.
  if (query.studentId && (auth.role === 'PARENT' || auth.role === 'STUDENT')) {
    await assertCanAccessStudent(auth, query.studentId);
  }
  const { items, meta } = await service.listAttendance(auth, query);
  return paginated(res, items, meta, 'Attendance retrieved');
}

export async function correct(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.correctAttendance(
    auth,
    req.params.id as string,
    req.body as CorrectAttendanceInput,
    auditCtx(req),
  );
  return ok(res, result, 'Attendance corrected');
}

export async function report(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.attendanceReport(auth, req.query as unknown as AttendanceReportQuery);
  return ok(res, result, 'Attendance report generated');
}
