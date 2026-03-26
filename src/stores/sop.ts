import { defineStore } from 'pinia'
import { marked } from 'marked'
import hljs from 'highlight.js'
import { createIcons, diagnoseMissingIcons } from '@/utils/lucide-icons'

declare global {
  interface Window {
    __sopLegacyInit?: (options: {
      templateId?: string
      runId?: string
      onNavigateHome?: () => void
      onSwitchRun?: (runId: string, templateId: string) => void
    }) => Promise<void>
    __sopLegacyCleanup?: () => void
    API_BASE_URL?: string
    authManager?: { getToken: () => string | null }
    lucide?: { createIcons: () => void }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    marked?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hljs?: any
  }
}

interface SopMountOptions {
  templateId?: string
  runId?: string
  onNavigateHome?: () => void
  onSwitchRun?: (runId: string, templateId: string) => void
}

const LEGACY_CSS_ID = 'sop-legacy-css'
const LEGACY_SCRIPT_ID = 'sop-legacy-script'
const LEGACY_VENDOR_STYLE_LINKS: Array<{ id: string; href: string }> = [
  {
    id: 'sop-highlight-style',
    href: '/vendor/github-dark-dimmed.min.css'
  },
  {
    id: 'sop-fontawesome-style',
    href: '/vendor/font-awesome/css/all.min.css'
  }
]
let legacyScriptPromise: Promise<void> | null = null

const normalizeBaseURL = (raw: string | undefined): string => {
  const base = (raw || '').trim()
  if (!base) {
    return '/api'
  }
  if (/\/dev\/?$/i.test(base) || /youshu\.asia\/dev\/?$/i.test(base)) {
    return '/api'
  }
  return base.replace(/\/$/, '')
}

const buildAuthManager = () => {
  const getToken = () => localStorage.getItem('token') || ''
  const requireAuth = () => {
    const token = getToken()
    if (token) return true
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login'
    }
    return false
  }

  const fetchWithAuth = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = getToken()
    const headers = new Headers(init?.headers || {})

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return fetch(input, {
      ...init,
      headers
    })
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    window.location.href = '/login'
  }

  return {
    requireAuth,
    getToken,
    fetchWithAuth,
    logout
  }
}

const ensureLegacyCss = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.getElementById(LEGACY_CSS_ID)) {
      resolve()
      return
    }

    const link = document.createElement('link')
    link.id = LEGACY_CSS_ID
    link.rel = 'stylesheet'
    link.href = '/legacy/sop-legacy.css?v=20260326b'
    link.onload = () => resolve()
    link.onerror = () => reject(new Error('sop-legacy.css 加载失败'))
    document.head.appendChild(link)
  })
}

const removeLegacyCss = () => {
  const link = document.getElementById(LEGACY_CSS_ID)
  if (link && link.parentNode) {
    link.parentNode.removeChild(link)
  }
}

const ensureLegacyVendorStyles = () => {
  LEGACY_VENDOR_STYLE_LINKS.forEach(({ id, href }) => {
    if (document.getElementById(id)) {
      return
    }

    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  })
}

const removeLegacyVendorStyles = () => {
  LEGACY_VENDOR_STYLE_LINKS.forEach(({ id }) => {
    const link = document.getElementById(id)
    if (link && link.parentNode) {
      link.parentNode.removeChild(link)
    }
  })
}

const ensureLegacyScript = (): Promise<void> => {
  if (legacyScriptPromise) {
    return legacyScriptPromise
  }

  legacyScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(LEGACY_SCRIPT_ID) as HTMLScriptElement | null
    if (existing?.dataset.loaded === '1') {
      resolve()
      return
    }

    const script = existing || document.createElement('script')
    script.id = LEGACY_SCRIPT_ID
    script.src = '/legacy/sop-legacy.js?v=20260326b'
    script.async = false

    script.onload = () => {
      script.dataset.loaded = '1'
      resolve()
    }
    script.onerror = () => {
      reject(new Error('legacy SOP 脚本加载失败'))
    }

    if (!existing) {
      document.body.appendChild(script)
    }
  })

  return legacyScriptPromise
}

const setupLegacyGlobals = () => {
  window.API_BASE_URL = normalizeBaseURL(import.meta.env.VITE_API_BASE_URL)
  window.authManager = buildAuthManager()

  window.lucide = {
    createIcons: () => {
      createIcons()
    }
  }

  marked.setOptions({
    gfm: true,
    breaks: true,
    async: false,
    pedantic: false
  })

  marked.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
        const highlighted = hljs.highlight(text, { language }).value
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
      }
    }
  })

  window.marked = marked as unknown as Window['marked']
  window.hljs = hljs as unknown as Window['hljs']
}

export const useSopStore = defineStore('sop', {
  state: () => ({
    initialized: false,
    mounting: false,
    lastError: '' as string
  }),
  actions: {
    async mountLegacy(options: SopMountOptions) {
      if (this.mounting) return

      this.mounting = true
      this.lastError = ''
      try {
        // 兼容原版前端登录：原版只设 'auth_token'，legacy SOP 模块只读 'token'
        const fallbackToken = localStorage.getItem('token') || localStorage.getItem('auth_token')
        if (fallbackToken && !localStorage.getItem('token')) {
          localStorage.setItem('token', fallbackToken)
        }

        setupLegacyGlobals()
        await ensureLegacyCss()
        ensureLegacyVendorStyles()
        await ensureLegacyScript()

        if (window.lucide) {
          window.lucide.createIcons()
        }

        diagnoseMissingIcons()

        if (typeof window.__sopLegacyInit !== 'function') {
          throw new Error('legacy SOP 初始化函数未就绪')
        }
        await window.__sopLegacyInit(options)
        this.initialized = true
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'legacy SOP 初始化失败'
        throw error
      } finally {
        this.mounting = false
      }
    },
    unmountLegacy() {
      if (typeof window.__sopLegacyCleanup === 'function') {
        window.__sopLegacyCleanup()
      }

      // 中止进行中的 SSE 请求
      const w = window as any
      if (w.__sopSseAbortController) {
        w.__sopSseAbortController.abort()
        w.__sopSseAbortController = null
      }

      removeLegacyCss()
      removeLegacyVendorStyles()

      legacyScriptPromise = null
      this.initialized = false
    }
  }
})
