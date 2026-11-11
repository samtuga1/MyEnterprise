// Vite builds two apps from one codebase: the storefront (index.html) and the
// admin (admin.html). Output goes to public/app/, which PHP serves with the
// right base path (public/index.php). In development, `npm run dev` serves
// the apps on :5173 and forwards /api, /media and /uploads to PHP on :8000
// (start it with `npm run api`).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = import.meta.dirname;
// PHP API for the dev proxy (npm run api serves it on :8000; override with API_TARGET).
const API = process.env.API_TARGET || 'http://127.0.0.1:8000';

// /admin, /admin/orders … → admin.html during development (PHP does this in production).
const adminFallback = () => ({
  name: 'admin-history-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/admin(\/[^.]*)?(\?.*)?$/.test(req.url)) req.url = '/admin.html';
      next();
    });
  },
});

export default defineConfig({
  root,
  base: './',
  plugins: [react(), adminFallback()],
  build: {
    outDir: resolve(root, '../public/app'),
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'es2020',
    rollupOptions: {
      input: { index: resolve(root, 'index.html'), admin: resolve(root, 'admin.html') },
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/media': API,
      '/uploads': API,
    },
  },
});
