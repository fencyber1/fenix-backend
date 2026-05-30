import type { Request, Response } from 'express';
import { ok } from '@/utils/http';
import { requireAuth } from '@/middleware/auth';
import { getDashboard } from './dashboard.service';

export async function dashboard(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  return ok(res, await getDashboard(auth), 'Dashboard generated');
}
