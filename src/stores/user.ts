import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { login as loginApi, getUserInfo } from '@/api/auth'
import request from '@/api/request'
import { getCreditBalance } from '@/api/credits'
import { useBookmarks } from '@/views/sop/composables/useBookmarks'

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
  const token = ref<string>(
    localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
  )
  const userInfo = ref<UserInfo | null>(null)
  const loading = ref(false)
  const creditBalance = ref<number>(0)
  const quotaSubTotal = ref<number>(0)
  const quotaSubRemain = ref<number>(0)
  const quotaBoosterTotal = ref<number>(0)
  const quotaBoosterRemain = ref<number>(0)

  // Getters
  const isLoggedIn = computed(() => !!token.value)
  const isParentUser = computed(() => userInfo.value?.parent_user_id == null)
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
  const login = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; message?: string }> => {
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
        fetchCreditBalance()
        return true
      }
      return false
    } catch (error) {
      console.error('获取用户信息失败:', error)
      return false
    }
  }

  // 获取额度余额及分布
  const fetchCreditBalance = async () => {
    try {
      const res = await getCreditBalance()
      if (res.data) {
        creditBalance.value = res.data.balance
        quotaSubTotal.value = res.data.sub_total ?? 0
        quotaSubRemain.value = res.data.sub_remain ?? 0
        quotaBoosterTotal.value = res.data.booster_total ?? 0
        quotaBoosterRemain.value = res.data.booster_remain ?? 0
      }
    } catch (e) {
      // 静默失败
    }
  }

  // 周期性 Token 验证（每 5 分钟，与原版 auth.js 一致）
  // 使用 window 属性存储 timer，防止 HMR 时旧引用丢失导致定时器泄漏
  const TIMER_KEY = '__numind_tokenValidationTimer'
  const TOKEN_VALIDATION_INTERVAL = 5 * 60 * 1000

  const startTokenValidation = () => {
    stopTokenValidation()
    ;(window as any)[TIMER_KEY] = setInterval(async () => {
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
    const timerId = (window as any)[TIMER_KEY]
    if (timerId !== undefined && timerId !== null) {
      clearInterval(timerId)
      ;(window as any)[TIMER_KEY] = null
    }
  }

  // 退出登录
  const logout = () => {
    stopTokenValidation()
    clearToken()
    creditBalance.value = 0
    quotaSubTotal.value = 0
    quotaSubRemain.value = 0
    quotaBoosterTotal.value = 0
    quotaBoosterRemain.value = 0
    // useBookmarks 模块级单例 state 不在 Pinia store 内，需手工清理，
    // 避免 router.push('/login') 后另一个用户在同 tab 登录时短暂看到上个用户的书签。
    useBookmarks().clear()
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
    creditBalance,
    quotaSubTotal,
    quotaSubRemain,
    quotaBoosterTotal,
    quotaBoosterRemain,
    isLoggedIn,
    isParentUser,
    username,
    nickname,
    login,
    logout,
    fetchUserInfo,
    fetchCreditBalance,
    init,
    setToken,
    clearToken,
    startTokenValidation,
    stopTokenValidation
  }
})
