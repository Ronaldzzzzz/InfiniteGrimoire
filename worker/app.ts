import { Hono } from 'hono';

// Later tasks add fields (e.g. DB, clock).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppDeps {}

export function createApp(_deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));
  return app;
}
