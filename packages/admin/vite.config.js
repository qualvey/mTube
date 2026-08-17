import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    host: '::',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  plugins: [
    vue(),
    tailwindcss(),
  ],
  // 构建时注入版本元数据（Dockerfile 传 GIT_SHA/BUILD_TIME，CI 构建时注入）
  // 对比 /api/v1/version 实现「发现新版本 → 提示刷新」
  define: {
    __APP_GIT_SHA__: JSON.stringify(process.env.GIT_SHA || 'dev'),
    __APP_BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME || ''),
  },
})
