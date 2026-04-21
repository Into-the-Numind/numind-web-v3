import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  const rawBase = (env.VITE_APP_BASE_PATH || '/').trim()
  const normalizedBase = rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`

  return {
    base: normalizedBase,
    plugins: [
      vue(),
      // 老浏览器（Safari<15.4 / iOS 15.3- / 老 WeChat X5 / 老 Android WebView）
      // 兼容性兜底：生成 legacy bundle + 按 .browserslistrc 注入 core-js polyfills。
      // 现代浏览器加载 type="module" 的 modern bundle，老浏览器自动 fallback 到 nomodule 版。
      // targets 读 .browserslistrc（单一真理源）。
      //
      // modernPolyfills: true — 对 modern bundle 也按 browserslist 注入 core-js polyfills，
      //   修复 "支持 ES modules 但缺少新 API" 的场景（如 Safari 14 支持 ESM 但缺 Array.prototype.at）。
      //   依赖 .browserslistrc 中的 iOS>=12 / Safari>=12 — 若调高这两个下限，应评估是否仍需此参数。
      // renderLegacyChunks: true — 默认值，显式列出表达意图。
      legacy({
        modernPolyfills: true,
        renderLegacyChunks: true
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          // 本地开发默认直连 localhost 后端；E2E 或无本地 Go 环境时可用
          // VITE_PROXY_TARGET 指向 dev（如 http://49.233.219.254:9091）。
          target: env.VITE_PROXY_TARGET || 'http://localhost:9091',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          // SSE 流式响应：禁用 proxy 层 response buffering
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const ct = proxyRes.headers['content-type'] || ''
              if (ct.includes('text/event-stream')) {
                proxyRes.headers['cache-control'] = 'no-cache'
                proxyRes.headers['x-accel-buffering'] = 'no'
              }
            })
          }
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true
    }
  }
})
