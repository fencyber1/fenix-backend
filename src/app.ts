import express, { type Application, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import path from 'node:path';
import fs from 'node:fs';
import { env, isProd } from '@/config/env';
import { logger } from '@/lib/logger';
import { requestContext } from '@/middleware/requestContext';
import { csrfGuard } from '@/middleware/csrf';
import { globalRateLimiter } from '@/middleware/rateLimit';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import { buildApiRouter } from '@/routes';
import { deepHealth, liveness } from '@/lib/health';
import filesRoutes from '@/modules/files/files.routes';

/** Builds the Express application with all security middleware and routes. */
export function createApp(): Application {
  const app = express();

  // Trust the configured number of proxy hops (LB / Nginx) so req.ip and
  // secure-cookie detection work behind TLS terminators.
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  // Security headers. CSP + HSTS enabled in production.
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              baseUri: ["'self'"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
            },
          }
        : false,
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (no Origin) and allow-listed origins. For
        // disallowed origins we decline CORS headers (callback false) rather
        // than throwing; the CSRF guard then returns a clean 403 for any
        // cookie-bearing cross-site mutation attempt.
        callback(null, !origin || env.CORS_ORIGINS.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(cookieParser());
  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      // Disable access logging in tests; otherwise log everything except the
      // high-frequency liveness probe.
      autoLogging:
        env.NODE_ENV === 'test'
          ? false
          : { ignore: (req: Request) => req.url === '/health/live' },
      customProps: (req) => ({ requestId: (req as Request).requestId }),
    }),
  );

  // Local-storage file routes (mounted only for the local driver). These accept
  // raw binary uploads so they are registered before the JSON body parser.
  if (env.STORAGE_DRIVER === 'local') {
    app.use('/files', filesRoutes);
  }

  // JSON body parsing (after raw upload route).
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ---- Health / readiness probes (public, before rate limiting) ----
  // Liveness: cheap, no dependency calls.
  app.get('/health/live', (_req: Request, res: Response) => {
    res.json({ success: true, message: 'alive', data: liveness() });
  });

  // Readiness/deep health: checks DB, Redis, and configured providers.
  const healthHandler = (includeProviders: boolean) => async (_req: Request, res: Response) => {
    const report = await deepHealth(includeProviders);
    const httpStatus = report.status === 'unhealthy' ? 503 : 200;
    res
      .status(httpStatus)
      .json({ success: report.status !== 'unhealthy', message: report.status, data: report });
  };
  // Readiness excludes external providers (only gates traffic on DB+Redis).
  app.get('/health/ready', (req, res, next) => {
    void healthHandler(false)(req, res).catch(next);
  });
  // Full health includes providers (degraded when a provider is misconfigured).
  app.get('/health', (req, res, next) => {
    void healthHandler(true)(req, res).catch(next);
  });

  // CSRF protection + global rate limiting on the API surface.
  app.use(env.API_PREFIX, csrfGuard, globalRateLimiter, buildApiRouter());

  // SPA fallback — serve the built frontend and let React Router handle routing.
  // In production the frontend is built into ../frontend/dist relative to backend root.
  const spaDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(spaDist)) {
    app.use(express.static(spaDist));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(spaDist, 'index.html'));
    });
  }

  // 404 + error handling.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
