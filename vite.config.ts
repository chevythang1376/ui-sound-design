import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs so `npm run build` output can be hosted from any path.
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        plain: 'examples/plain.html',
        cms: 'examples/cms-block.html',
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Real CSS for the contrast test (Vitest stubs CSS to empty strings by default).
    css: { include: [/styles\/main\.css/] },
  },
});
