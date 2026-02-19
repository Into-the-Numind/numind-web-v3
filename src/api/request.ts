import axios, { type AxiosInstance, type AxiosResponse } from 'axios'

// API 响应类型
export interface ApiResponse<T = any> {
  code: number
  message?: string
  msg?: string
  data: T
}

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 获取 token（避免循环依赖）
const getToken = (): string | null => {
  return localStorage.getItem('token')
}

// 清除登录状态
const clearAuth = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('userInfo')
}

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
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
          
        case 403:
          return Promise.reject(new Error('没有权限访问该资源'))
          
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
