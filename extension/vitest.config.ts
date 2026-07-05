import { defineConfig } from 'vitest/config'

/**
 * 浏览器插件（xhs-script）解析器单测配置。
 *
 * 与仓库根 vitest.config.ts 解耦：插件目录是独立交付物（非 Vue app 源码），
 * 用纯函数 + jsdom 测 lib/parse.js，不引入根配置的 Vue 插件 / 路径别名。
 *
 * 运行：npx vitest run --config extension/vitest.config.ts
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    root: __dirname,
    include: ['**/*.{test,spec}.{js,ts}']
  }
})
