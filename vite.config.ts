import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'web',
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'web/index.html')
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: false
      }
    }
  }
});
