import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // dist/.vite/manifest.json lets scripts/bundle-budget.mjs tell initial chunks from lazy ones.
  build: { manifest: true },
  server: {
    // `npm run dev` serves the client only; `/ws` and `/api` come from `wrangler dev` on 8787.
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/api': { target: 'http://localhost:8787' },
    },
  },
});
