import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { connectDatabase, disconnectDatabase } from '@/lib/prisma';
import { disconnectRedis } from '@/lib/redis';
import { closeQueue } from '@/adapters/queue';
import { startupSelfCheck } from '@/lib/health';
import { initErrorTracking, flushErrorTracking } from '@/lib/observability';

async function bootstrap(): Promise<void> {
  initErrorTracking();
  await connectDatabase();

  // Verify external dependencies before accepting traffic. Throws on a critical
  // (DB/Redis) failure; warns on provider misconfiguration.
  await startupSelfCheck();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`SMS API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down gracefully`);
    // Stop accepting new connections, then drain dependencies.
    server.close(async () => {
      await closeQueue().catch(() => undefined);
      await disconnectRedis().catch(() => undefined);
      await disconnectDatabase().catch(() => undefined);
      await flushErrorTracking().catch(() => undefined);
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception; exiting');
    void flushErrorTracking().finally(() => process.exit(1));
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
