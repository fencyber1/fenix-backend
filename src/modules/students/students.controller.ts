import type { Request, Response } from 'express';
import { created, ok, paginated } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { clientIp, userAgent } from '@/middleware/requestContext';
import type { AuditContext } from '@/modules/audit/audit.service';
import * as service from './students.service';
import type {
  CreateStudentInput,
  ImportStudentsInput,
  ListStudentsQuery,
  UpdateStudentInput,
} from './students.schemas';

function auditCtx(req: Request): AuditContext {
  return { actorId: req.auth?.userId ?? null, ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function list(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const query = req.query as unknown as ListStudentsQuery;
  const { items, meta } = await service.listStudents(auth, query);
  return paginated(res, items, meta, 'Students retrieved');
}

export async function getOne(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const student = await service.getStudent(auth, req.params.id as string);
  return ok(res, student, 'Student retrieved');
}

export async function create(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const student = await service.createStudent(auth, req.body as CreateStudentInput, auditCtx(req));
  return created(res, student, 'Student created');
}

export async function update(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const student = await service.updateStudent(
    auth,
    req.params.id as string,
    req.body as UpdateStudentInput,
    auditCtx(req),
  );
  return ok(res, student, 'Student updated');
}

export async function remove(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  await service.softDeleteStudent(auth, req.params.id as string, auditCtx(req));
  return ok(res, null, 'Student deleted');
}

export async function importCsv(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const result = await service.importStudents(auth, req.body as ImportStudentsInput, auditCtx(req));
  return ok(res, result, 'Import processed');
}
