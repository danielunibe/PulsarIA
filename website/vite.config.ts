import { fileURLToPath } from 'node:url';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': root },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(root, 'index.html'),
        downloads: path.resolve(root, 'downloads.html'),
        privacy: path.resolve(root, 'privacy.html'),
        terms: path.resolve(root, 'terms.html'),
      },
    },
  },
});
