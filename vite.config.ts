import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  // Electron 33 = Chromium 130: код не нужно понижать до старых браузеров, поэтому он меньше и быстрее запускается
  build: { outDir: '../../dist', emptyOutDir: true, target: 'chrome130', reportCompressedSize: false, modulePreload: false },
  server: { port: 5173, strictPort: true },
  test: { root: '.', include: ['tests/**/*.test.ts'] },
});
