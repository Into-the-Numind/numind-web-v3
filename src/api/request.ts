import axios, { type AxiosInstance, type AxiosResponse } from 'axios'

// API 响应类型
export interface ApiResponse<T = any> {
  code: number
  message?: string
  msg?: string
  data: T
}

// 运行时基础地址标准化，避免误配置到旧版 /dev 页面
const normalizeBaseURL = (raw: string | undefined): string => {
  const base = (raw || '').trim()
  if (!base) {
    return '/api'
  }

  // 历史环境里 /dev 会返回旧版 HTML 而非 API JSON
  if (/\/dev\/?$/i.test(base) || /youshu\.asia\/dev\/?$/i.test(base)) {
    return '/api'
  }

  return base
}

const initialBaseURL = normalizeBaseURL(import.meta.env.VITE_API_BASE_URL)

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: initialBaseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 根据当前页面位置推断后端直连地址（用于 dev/qa 兜底）
const resolveDirectBackendBase = (): string | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const host = window.location.hostname
  if (host !== '49.233.219.254') {
    return null
  }

  // dev: 9203 -> 9091, qa: 9204 -> 9093
  const pagePort = window.location.port
  const backendPort = pagePort === '9204' ? '9093' : '9091'
  return `${window.location.protocol}//${host}:${backendPort}`
}

// 兜底基址候选：优先 /api，其次直连后端（避免误落到前端 /v1 路由）
const getFallbackBaseCandidates = (currentBase: string): string[] => {
  const normalizedCurrent = (currentBase || '').trim()
  const candidates: string[] = []

  if (normalizedCurrent !== '/api') {
    candidates.push('/api')
  }

  const directBackendBase = resolveDirectBackendBase()
  if (directBackendBase && directBackendBase !== normalizedCurrent) {
    candidates.push(directBackendBase)
  }

  return candidates
}

const isLikelyHtml = (payload: unknown): boolean => {
  if (typeof payload !== 'string') {
    return false
  }
  const snippet = payload.slice(0, 256).toLowerCase()
  return snippet.includes('<!doctype html') || snippet.includes('<html')
}

const shouldFallbackByResponse = (response?: AxiosResponse<any>): boolean => {
  if (!response) {
    return false
  }

  const contentType = String(response.headers?.['content-type'] || '').toLowerCase()
  if (contentType.includes('text/html') || isLikelyHtml(response.data)) {
    return true
  }

  // /api 映射缺失时常见 404 + Page not found
  if (response.status === 404) {
    const message = String(response.data?.message || response.data?.msg || '').toLowerCase()
    if (message.includes('page not found')) {
      return true
    }
  }

  return false
}

const tryFallbackRequest = (config: any): Promise<any> | null => {
  if (!config) {
    return null
  }

  const candidates: string[] = Array.isArray(config.__apiBaseFallbackCandidates)
    ? config.__apiBaseFallbackCandidates
    : getFallbackBaseCandidates(String(config.baseURL || ''))
  const index = Number(config.__apiBaseFallbackIndex || 0)

  if (index >= candidates.length) {
    return null
  }

  const retryConfig = {
    ...config,
    baseURL: candidates[index],
    __apiBaseFallbackCandidates: candidates,
    __apiBaseFallbackIndex: index + 1
  }

  return request.request(retryConfig)
}

// 获取 token（避免循环依赖，兼容原版 auth_token key）
export const getToken = (): string | null => {
  return localStorage.getItem('token') || localStorage.getItem('auth_token')
}

// 清除登录状态（同时清除原版 key）
export const clearAuth = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('auth_token')
  localStorage.removeItem('userInfo')
  localStorage.removeItem('user_info')
}

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // FormData 时将 Content-Type 设为 false，阻止 axios 内部 dispatchRequest
    // 将其回填为 x-www-form-urlencoded，让浏览器自动设置 multipart/form-data + boundary
    if (config.data instanceof FormData) {
      config.headers.setContentType(false)
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data as any

    // 如果返回了 HTML 或其它非标准对象，通常是反向代理/网关配置问题
    if (!res || typeof res !== 'object' || !Object.prototype.hasOwnProperty.call(res, 'code')) {
      if (shouldFallbackByResponse(response)) {
        const retryPromise = tryFallbackRequest((response as any).config)
        if (retryPromise) {
          return retryPromise
        }
      }
      return Promise.reject(new Error('API响应格式异常，请检查代理配置'))
    }
    
    // 如果响应成功，直接返回数据
    if (res.code === 200 || res.code === 0) {
      return res as any
    }
    
    // 业务错误
    const errorMessage = res.message || res.msg || '请求失败'
    return Promise.reject(new Error(errorMessage))
  },
  (error) => {
    const { response } = error

    if (shouldFallbackByResponse(response)) {
      const retryPromise = tryFallbackRequest(error?.config)
      if (retryPromise) {
        return retryPromise
      }
    }
    
    // 处理不同状态码
    if (response) {
      switch (response.status) {
        case 401:
          // Token 过期或未授权
          clearAuth()
          // 如果不是登录页面，跳转到登录
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login'
          }
          return Promise.reject(new Error('登录已过期，请重新登录'))
          
        case 403: {
          // 区分 token 过期（后端可能返回 403）和真正的权限不足
          const msg403 = response.data?.message || response.data?.msg || ''
          const isAuthExpired = !getToken() || msg403.includes('token') || msg403.includes('过期') || msg403.includes('expired')
          if (isAuthExpired) {
            clearAuth()
            if (!window.location.pathname.includes('/login')) {
              window.location.href = '/login'
            }
            return Promise.reject(new Error('登录已过期，请重新登录'))
          }
          return Promise.reject(new Error(msg403 || '没有权限访问该资源'))
        }
          
        case 404:
          return Promise.reject(new Error('请求的资源不存在'))
          
        case 500:
          return Promise.reject(new Error('服务器内部错误'))
          
        default: {
          const message = response.data?.message || response.data?.msg || `请求失败 (${response.status})`
          return Promise.reject(new Error(message))
        }
      }
    }
    
    // 网络错误
    if (error.message?.includes('Network Error') || error.message?.includes('ECONNREFUSED')) {
      return Promise.reject(new Error('网络连接失败，请检查网络'))
    }
    
    // 超时
    if (error.message?.includes('timeout')) {
      return Promise.reject(new Error('请求超时，请稍后重试'))
    }
    
    return Promise.reject(new Error(error.message || '请求失败'))
  }
)

export default request
