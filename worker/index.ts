import { gameData } from '../src/engine/data';
import { createApp } from './app';
import { createCryptoRng } from './crypto-rng';
import { D1Store } from './d1-store';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      const app = createApp({
        store: new D1Store(env.DB),
        now: Date.now,
        rng: createCryptoRng,
        data: gameData,
      });
      return app.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
