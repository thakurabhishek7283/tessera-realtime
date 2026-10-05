import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo>/, so CI passes BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  resolve: { dedupe: ['lit', '@lit/context'] },
  build: {
    target: 'es2022',
    sourcemap: true,
    // chat-only.html: a bare <tessera-chat>, for the lazy-loading e2e test.
    rolldownOptions: { input: ['index.html', 'chat-only.html'] },
  },
});
