import type { ErrorHandler } from 'hono';
import type { AppEnv } from '../types';
import { HttpError } from '../lib/errors';

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  console.error('[unhandled]', err);
  return c.json({ error: 'Internal server error' }, 500);
};
