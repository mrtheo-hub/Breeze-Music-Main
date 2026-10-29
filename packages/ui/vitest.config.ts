import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // globals: true lets Testing Library register its automatic cleanup.
  test: { environment: 'jsdom', globals: true },
});
