import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // @traco/core é consumido direto do código-fonte TypeScript (condição "source")
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/v1': 'http://127.0.0.1:4310' },
  },
});
