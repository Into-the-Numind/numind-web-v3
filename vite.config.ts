import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')
  
  // 根据环境设置 base 路径
  // 生产环境 (main): /v3/ (部署到 youshu.asia/v3/)
  // 开发/测试: / (部署到 IP:port)
  const base = env.VITE_APP_ENV === 'production' ? '/v3/' : '/'
  
  return {
    base,
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
          target: 'https://youshu.asia/dev',
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
