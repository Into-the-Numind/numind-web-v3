import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  // 生产环境默认使用 /v3/ 子路径部署
  const defaultBase = env.VITE_APP_ENV === 'production' ? '/v3/' : '/'
  const rawBase = (env.VITE_APP_BASE_PATH || defaultBase).trim()
  const normalizedBase = rawBase === '/' ? '/' : `/${rawBase.replace(/^\/+|\/+$/g, '')}/`
  
  return {
    base: normalizedBase,
    plugins: [
      vue(),
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
          // 本地开发默认直连 dev/qa 后端 API（返回 /v1 JSON）
          target: 'http://49.233.219.254:9091',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
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
