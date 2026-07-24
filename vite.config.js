import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  // GitHub Pages 部署在 /仓库名/ 子路径下，base 必须匹配
  base: './',
  plugins: [vue(), cesium()],
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4096
  },
  worker: {
    format: 'es'
  }
});
