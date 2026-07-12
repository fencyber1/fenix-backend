import type { Request, Response } from 'express';
import { created, ok, paginated } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './grades.service';
import type {
  ListGradesQuery,
  ReportCardQuery,
  UpdateGradeInput,
  UpsertGradeInput,
} from './grades.schemas';

function auditCtx(req: Request): AuditContext {
  return { tenantId: req.auth?.tenantId ?? '', actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function create(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const grade = await service.upsertGrade(auth, req.body as UpsertGradeInput, auditCtx(req));
  return created(res, grade, 'Grade recorded');
}

export async function update(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const grade = await service.updateGrade(
    auth,
    req.params.id as string,
    req.body as UpdateGradeInput,
    auditCtx(req),
  );
  return ok(res, grade, 'Grade updated');
}

export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const { items, meta } = await service.listGrades(auth, req.query as unknown as ListGradesQuery);
  return paginated(res, items, meta, 'Grades retrieved');
}

export async function reportCard(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const data = await service.getReportCardData(auth, req.query as unknown as ReportCardQuery);
  return ok(res, data, 'Report card data generated');
}
