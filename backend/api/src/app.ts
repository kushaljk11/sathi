import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, isProd } from './config/env';
import { corsOptions } from './config/cors';
import { API_PREFIX, JSON_BODY_LIMIT } from './constants/app.constants';
import { errorHandler, notFoundHandler } from './core/middleware/error.middleware';
import { apiLimiter } from './core/middleware/rate-limit.middleware';
import { requestLogger } from './core/middleware/request-logger.middleware';
import routes from './routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet({ hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false }));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use('/api', apiLimiter);

  app.use(API_PREFIX, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
