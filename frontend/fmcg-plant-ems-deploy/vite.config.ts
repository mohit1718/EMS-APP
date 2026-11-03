import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build inlines all JS and CSS into dist/index.html, so the same file works
// on a web server and when opened directly from disk (file://), where browsers
// block separate module scripts.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 3000 },
});
