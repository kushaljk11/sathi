import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ACCESS_TOKEN_TTL } from '../constants/app.constants';

export const signAccessToken = (userId: string) => jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

/** Returns the user id (`sub`) or throws if the token is invalid/expired. */
export const verifyAccessToken = (token: string): string => (jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string }).sub;
