import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  // The sandboxed preload must be CommonJS; .cjs because this package is "type": "module".
  preload: {
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
  },
});
