// Directory routes — list phòng ban, lookup manager. Phục vụ form đề xuất.

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';

export const directoryRoutes = new Hono<AppEnv>();
directoryRoutes.use('*', requireAuth);

directoryRoutes.get('/departments', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT code, ad_name, full_name FROM departments WHERE is_active = 1 ORDER BY code`,
  ).all();
  return c.json({ departments: res.results ?? [] });
});

directoryRoutes.get('/my-manager', async (c) => {
  const user = c.get('user');
  if (!user.deptCode) return c.json({ manager: null });
  const row = await c.env.DB.prepare(
    `SELECT user_email AS email, user_name AS name
       FROM department_managers
      WHERE dept_code = ?1 AND is_active = 1
      ORDER BY id ASC LIMIT 1`,
  )
    .bind(user.deptCode)
    .first();
  return c.json({ manager: row ?? null });
});
