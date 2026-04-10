import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

/**
 * Vitest 单元测试配置
 *
 * 与 vite.config.ts 的 resolve.alias 保持一致，让组件单测可以用 @/ 别名 import。
 *
 * 测试文件约定：
 *   - src/**\/*.test.ts            (composable / 工具函数单测)
 *   - src/**\/*.spec.ts            (与 .test.ts 等价)
 *   - src/**\/__tests__/**\/*.test.ts  (按目录组织的组件测试)
 *
 * 排除：
 *   - e2e 目录（由 Playwright 管理）
 *   - node_modules / dist
 */
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,vue}', 'src/**/__tests__/**/*.{test,spec}.{ts,vue}'],
    exclude: ['node_modules', 'e2e', 'dist']
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
