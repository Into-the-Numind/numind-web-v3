import { defineStore } from 'pinia'
import { marked } from 'marked'
import hljs from 'highlight.js'
import { createIcons, icons } from 'lucide'

declare global {
  interface Window {
    API_BASE_URL?: string
    authManager?: {
      requireAuth: () => boolean
      getToken: () => string
      fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      logout?: () => void
    }
    lucide?: {
      createIcons: () => void
    }
    marked?: {
      parse: (markdown: string) => string
      setOptions: (options: Record<string, unknown>) => void
    }
    hljs?: {
      getLanguage: (name: string) => unknown
      highlight: (code: string, config?: { language?: string }) => { value: string }
    }
    __salesAgentLegacyInit?: () => Promise<void>
    __salesAgentLegacyCleanup?: () => void
    _citationEscHandler?: ((e: KeyboardEvent) => void) | null
  }
}

const LEGACY_CSS_ID = 'sales-agent-legacy-css'
const LEGACY_SCRIPT_ID = 'sales-agent-legacy-script'
const LEGACY_VENDOR_STYLE_LINKS: Array<{ id: string; href: string }> = [
  {
    id: 'sales-agent-highlight-style',
    href: '/vendor/github-dark-dimmed.min.css'
  },
  {
    id: 'sales-agent-easymde-style',
    href: '/vendor/easymde.min.css'
  },
  {
    id: 'sales-agent-fontawesome-style',
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
    link.href = '/legacy/sales-agent-legacy.css?v=20260220'
    link.onload = () => resolve()
    link.onerror = () => reject(new Error('sales-agent-legacy.css 加载失败'))
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
    script.src = '/legacy/sales-agent-legacy.js?v=20260220'
    script.async = false

    script.onload = () => {
      script.dataset.loaded = '1'
      resolve()
    }
    script.onerror = () => {
      reject(new Error('legacy sales-agent 脚本加载失败'))
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

  // 兼容 legacy 脚本里的 window.lucide / data-lucide 图标渲染
  window.lucide = {
    createIcons: () => {
      createIcons({ icons })
    }
  }

  marked.setOptions({
    gfm: true,
    breaks: true,
    async: false,
    pedantic: false
  })

  // marked v17+ 不再支持 setOptions({ highlight })，需通过 renderer 集成 hljs
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

export const useSalesAgentStore = defineStore('salesAgent', {
  state: () => ({
    initialized: false,
    mounting: false,
    lastError: '' as string
  }),
  actions: {
    async mountLegacy() {
      if (this.mounting) return

      this.mounting = true
      this.lastError = ''
      try {
        setupLegacyGlobals()
        await ensureLegacyCss()
        ensureLegacyVendorStyles()
        await ensureLegacyScript()

        if (window.lucide) {
          window.lucide.createIcons()
        }

        if (typeof window.__salesAgentLegacyInit !== 'function') {
          throw new Error('legacy 初始化函数未就绪')
        }
        await window.__salesAgentLegacyInit()
        this.initialized = true
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'legacy 初始化失败'
        throw error
      } finally {
        this.mounting = false
      }
    },
    unmountLegacy() {
      // 调用 legacy JS 的清理函数，移除 document 级事件监听器并重置状态
      if (typeof window.__salesAgentLegacyCleanup === 'function') {
        window.__salesAgentLegacyCleanup()
      }

      // 中止进行中的 SSE 请求
      const w = window as any
      if (w.__sseAbortController) {
        w.__sseAbortController.abort()
        w.__sseAbortController = null
      }

      removeLegacyCss()
      removeLegacyVendorStyles()

      // 重置脚本加载状态，允许下次重新初始化
      legacyScriptPromise = null
      this.initialized = false
    }
  }
})
