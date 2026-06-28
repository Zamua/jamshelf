/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // domain tests are pure; UI/component tests opt into jsdom per-file
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
