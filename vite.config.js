import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import cesium from 'vite-plugin-cesium';

export default defineConfig(({ mode }) => {
  // 开发环境保持相对路径；GitHub Pages 生产构建时通过 DEPLOY_BASE 传入 /仓库名/
  // 绝对 base 能避免子路径无尾斜杠时 Cesium 资源 404
  const base = process.env.DEPLOY_BASE || './';
  return {
    base,
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
  };
});
