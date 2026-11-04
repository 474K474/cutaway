import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Относительный base, чтобы сборка работала и на GitHub Pages (/cutaway/), и на любом хостинге.
export default defineConfig({
  plugins: [react()],
  base: './',
});
