import { createServer } from 'node:http';
import { env } from './lib/env';
import { createApp } from './app';
import { attachRealtime } from './realtime';
import { startDevMaintenance } from './jobs/processor';

const http = createServer(createApp());
attachRealtime(http);
http.listen(env.PORT, () => console.log(`Sathi API listening on ${env.BACKEND_URL}/api/v1`));
startDevMaintenance();

const shutdown = () => { http.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
