import type { Request, Response } from 'express';
import { ok } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { getDashboard, getStudentDashboard, getParentDashboard } from './dashboard.service';

export async function dashboard(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await getDashboard(auth), 'Dashboard generated');
}

export async function studentDashboard(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await getStudentDashboard(auth), 'Student dashboard generated');
}

export async function parentDashboard(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await getParentDashboard(auth), 'Parent dashboard generated');
}
