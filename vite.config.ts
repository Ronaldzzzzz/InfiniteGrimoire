import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// The Cloudflare plugin spins up its own dev server, which conflicts with vitest.
const underVitest = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: [react(), ...(underVitest ? [] : [cloudflare()])],
  test: { environment: 'node' },
});
