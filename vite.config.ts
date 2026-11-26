import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev` serves the client only; `/ws` comes from `wrangler dev` on 8787.
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
});
