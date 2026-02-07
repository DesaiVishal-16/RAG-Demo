import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: true
  },
  server: {
    port: 3000
  }
});
