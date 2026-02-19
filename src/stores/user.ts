import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { login as loginApi, getUserInfo } from '@/api/auth'

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
  const token = ref<string>(localStorage.getItem('token') || '')
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
  }

  const clearToken = () => {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
  }

  const setUserInfo = (info: UserInfo) => {
    userInfo.value = info
    localStorage.setItem('userInfo', JSON.stringify(info))
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

  // 退出登录
  const logout = () => {
    clearToken()
  }

  // 初始化（从本地存储恢复）
  const init = () => {
    const savedToken = localStorage.getItem('token')
    const savedUserInfo = localStorage.getItem('userInfo')
    
    if (savedToken) {
      token.value = savedToken
    }
    
    if (savedUserInfo) {
      try {
        userInfo.value = JSON.parse(savedUserInfo)
      } catch {
        localStorage.removeItem('userInfo')
      }
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
    clearToken
  }
})
