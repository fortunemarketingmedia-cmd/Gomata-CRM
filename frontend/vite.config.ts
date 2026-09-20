import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4001';

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': apiTarget }
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
      include: ['qrcode/lib/browser.js']
    },
    build: { outDir: 'dist' }
  };
});
