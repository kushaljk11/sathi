import type { CorsOptions } from 'cors';
import { env } from './env';

/** Only the configured web app origin may call the API with credentials (cookies). */
export const corsOptions: CorsOptions = { origin: [env.FRONTEND_URL], credentials: true };

/** Socket.IO uses the same allowed origin as the REST API. */
export const socketCorsOptions = { origin: env.FRONTEND_URL, credentials: true };
