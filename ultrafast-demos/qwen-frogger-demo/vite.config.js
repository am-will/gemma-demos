import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { demo: resolve(import.meta.dirname, 'index.html'), game: resolve(import.meta.dirname, 'game/index.html') }
    }
  }
});
