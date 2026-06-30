import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite 构建配置，用于构建渲染进程 React 应用。
 */
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
