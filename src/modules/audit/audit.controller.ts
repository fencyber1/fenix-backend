import type { Request, Response } from 'express';
import { paginated } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { listAuditLogs } from './audit.read.service';
import type { ListAuditQuery } from './audit.schemas';

export async function list(req: Request, res: Response): Promise<Response> {
  requireAuth(req);
  const { items, meta } = await listAuditLogs(req.query as unknown as ListAuditQuery);
  return paginated(res, items, meta, 'Audit logs retrieved');
}
