import { createServer } from 'node:http';
import { env } from './config/env';
import { prisma } from './config/database';
import { logger } from './core/logger/logger';
import { createApp } from './app';
import { attachRealtime } from './sockets';
import { startDevMaintenance } from './jobs/maintenance.job';

const http = createServer(createApp());
attachRealtime(http);
http.listen(env.PORT, () => logger.info(`Sathi API listening on ${env.BACKEND_URL}/api/v1`));
startDevMaintenance();

/** Stop accepting connections, close the DB pool, then exit. Forced exit after 10s. */
const shutdown = () => {
  setTimeout(() => process.exit(1), 10_000).unref();
  http.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.message : String(reason) }));
