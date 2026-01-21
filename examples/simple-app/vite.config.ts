import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alaraPlugin } from '@alara/buildtime';

export default defineConfig({
  plugins: [
    alaraPlugin({
      serverPort: 4000,
    }),
    react(),
  ],
});
