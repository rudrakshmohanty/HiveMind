import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_BACKEND_URL || 'http://localhost:8000';

  return {
    plugins: [react()],
    publicDir: '../assets',
    css: {
      preprocessorOptions: {
        scss: {
          // Resolve webpack-style `~package` imports used by @carbon/styles
          importer: [
            (url) => {
              if (url.startsWith('~')) {
                return { file: path.resolve('./node_modules', url.slice(1)) };
              }
              return null;
            },
          ],
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': backendTarget,
        '/ws': backendTarget.replace('http', 'ws'),
      },
    },
  };
});
