import type { Request, Response } from 'express';
import { env, isProd } from '@/config/env';
import { ok } from '@/utils/http';
import { clientIp, userAgent } from '@/middleware/requestContext';
import { requireAuth } from '@/middleware/auth';
import { UnauthorizedError } from '@/utils/errors';
import * as authService from './auth.service';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './auth.schemas';

const REFRESH_COOKIE = 'sms_refresh_token';

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: env.API_PREFIX + '/auth',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: env.API_PREFIX + '/auth' });
}

function meta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return { ipAddress: clientIp(req), userAgent: userAgent(req) };
}

export async function register(req: Request, res: Response): Promise<Response> {
  const body = req.body as RegisterInput;
  const result = await authService.register(body, meta(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  return ok(res, { accessToken: result.accessToken, user: result.user }, 'Account created');
}

export async function login(req: Request, res: Response): Promise<Response> {
  const body = req.body as LoginInput;
  const result = await authService.login(body, meta(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  return ok(res, { accessToken: result.accessToken, user: result.user }, 'Logged in');
}

export async function refresh(req: Request, res: Response): Promise<Response> {
  const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? undefined;
  if (!token) throw new UnauthorizedError('Missing refresh token');
  const result = await authService.refresh(token, meta(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  return ok(res, { accessToken: result.accessToken, user: result.user }, 'Token refreshed');
}

export async function logout(req: Request, res: Response): Promise<Response> {
  const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? undefined;
  await authService.logout(token, req.auth?.userId ?? null, meta(req));
  clearRefreshCookie(res);
  return ok(res, null, 'Logged out');
}

export async function forgotPassword(req: Request, res: Response): Promise<Response> {
  const body = req.body as ForgotPasswordInput;
  await authService.forgotPassword(body.email);
  return ok(res, null, 'If an account exists, a reset link has been sent');
}

export async function resetPassword(req: Request, res: Response): Promise<Response> {
  const body = req.body as ResetPasswordInput;
  await authService.resetPassword(body.token, body.password, meta(req));
  clearRefreshCookie(res);
  return ok(res, null, 'Password has been reset. Please log in.');
}

export async function verifyEmail(req: Request, res: Response): Promise<Response> {
  const body = req.body as VerifyEmailInput;
  await authService.verifyEmail(body.token);
  return ok(res, null, 'Email verified. You can now log in.');
}

export async function changePassword(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const body = req.body as ChangePasswordInput;
  await authService.changePassword(auth.userId, body.currentPassword, body.newPassword, meta(req));
  clearRefreshCookie(res);
  return ok(res, null, 'Password changed. Please log in again.');
}

export async function me(req: Request, res: Response): Promise<Response> {
  const auth = requireAuth(req);
  const user = await authService.getMe(auth.userId);
  return ok(res, user, 'OK');
}
