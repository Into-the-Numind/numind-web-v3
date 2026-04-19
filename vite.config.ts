import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  const rawBase = (env.VITE_APP_BASE_PATH || '/').trim()
  const normalizedBase = rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`

  return {
    base: normalizedBase,
    plugins: [vue()],
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
