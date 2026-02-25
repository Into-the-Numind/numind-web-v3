import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { login as loginApi, getUserInfo } from '@/api/auth'
import request from '@/api/request'

export interface UserInfo {
  id: string | number
  username: string
  nickname?: string
  avatar?: string
  email?: string
  phone?: string
  role?: string
  [key: string]: any
}

export const useUserStore = defineStore('user', () => {
  // State
  const token = ref<string>(localStorage.getItem('token') || localStorage.getItem('auth_token') || '')
  const userInfo = ref<UserInfo | null>(null)
  const loading = ref(false)

  // Getters
  const isLoggedIn = computed(() => !!token.value)
  const username = computed(() => userInfo.value?.username || '')
  const nickname = computed(() => userInfo.value?.nickname || userInfo.value?.username || '')

  // Actions
  const setToken = (newToken: string) => {
    token.value = newToken
    localStorage.setItem('token', newToken)
    localStorage.setItem('auth_token', newToken)
  }

  const clearToken = () => {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('auth_token')
    localStorage.removeItem('userInfo')
    localStorage.removeItem('user_info')
  }

  const setUserInfo = (info: UserInfo) => {
    userInfo.value = info
    const serialized = JSON.stringify(info)
    localStorage.setItem('userInfo', serialized)
    localStorage.setItem('user_info', serialized)
  }

  // 登录
  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      loading.value = true
      const res = await loginApi({ username, password })
      
      if (res.code === 200 || res.code === 0) {
        const { access_token, token: userToken, user } = res.data || {}
        const actualToken = access_token || userToken
        
        if (actualToken) {
          setToken(actualToken)
          if (user) {
            setUserInfo(user)
          }
          return { success: true }
        } else {
          return { success: false, message: '登录响应格式错误' }
        }
      } else {
        return { success: false, message: res.message || res.msg || '登录失败' }
      }
    } catch (error: any) {
      console.error('登录错误:', error)
      return { 
        success: false, 
        message: error.message || '网络错误，请稍后重试'
      }
    } finally {
      loading.value = false
    }
  }

  // 获取用户信息
  const fetchUserInfo = async (): Promise<boolean> => {
    try {
      if (!token.value) return false
      
      const res = await getUserInfo()
      if (res.code === 200 || res.code === 0) {
        setUserInfo(res.data)
        return true
      }
      return false
    } catch (error) {
      console.error('获取用户信息失败:', error)
      return false
    }
  }

  // 周期性 Token 验证（每 5 分钟，与原版 auth.js 一致）
  let tokenValidationTimer: ReturnType<typeof setInterval> | null = null
  const TOKEN_VALIDATION_INTERVAL = 5 * 60 * 1000

  const startTokenValidation = () => {
    stopTokenValidation()
    tokenValidationTimer = setInterval(async () => {
      if (!token.value) {
        stopTokenValidation()
        return
      }
      try {
        await request.get('/v1/sop/templates', { params: { page: 1, page_size: 1 } })
      } catch {
        // 401/403 已由 request.ts 拦截器处理（清除 token + 跳转登录）
      }
    }, TOKEN_VALIDATION_INTERVAL)
  }

  const stopTokenValidation = () => {
    if (tokenValidationTimer !== null) {
      clearInterval(tokenValidationTimer)
      tokenValidationTimer = null
    }
  }

  // 退出登录
  const logout = () => {
    stopTokenValidation()
    clearToken()
  }

  // 初始化（从本地存储恢复，兼容原版 auth_token / user_info key）
  const init = () => {
    const savedToken = localStorage.getItem('token') || localStorage.getItem('auth_token')
    const savedUserInfo = localStorage.getItem('userInfo') || localStorage.getItem('user_info')

    if (savedToken) {
      token.value = savedToken
    }

    if (savedUserInfo) {
      try {
        userInfo.value = JSON.parse(savedUserInfo)
      } catch {
        localStorage.removeItem('userInfo')
        localStorage.removeItem('user_info')
      }
    }

    if (token.value) {
      startTokenValidation()
    }
  }

  return {
    token,
    userInfo,
    loading,
    isLoggedIn,
    username,
    nickname,
    login,
    logout,
    fetchUserInfo,
    init,
    setToken,
    clearToken,
    startTokenValidation,
    stopTokenValidation
  }
})
