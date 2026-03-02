/*
// my-react-app/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  server: {
    proxy: {
      // Patient CRUD, auth, prescriptions → Node.js (port 8080)
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // AI Agent, counseling, dosing → Python FastAPI (port 8000)
      '/agent': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent/, ''),
      },
    },
  },
});*/


// my-react-app/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  server: {
    proxy: {
      // Patient CRUD, auth, prescriptions → Node.js (port 8080)
      '/api': {
        target:       'http://localhost:8080',
        changeOrigin: true,
      },
      // AI Agent, counseling, dosing → Python FastAPI (port 8000)
      // ✅ No rewrite — /agent prefix is kept so FastAPI routes match exactly:
      //    Frontend: /agent/analyze  →  FastAPI: POST /agent/analyze  ✅
      //    Frontend: /agent/health   →  FastAPI: GET  /agent/health   ✅
      '/agent': {
        target:       'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});