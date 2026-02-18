import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface UserInfo {
  id: number
  username: string
  nickname?: string
  avatar?: string
}

export const useUserStore = defineStore('user', () => {
  // State
  const token = ref<string>(localStorage.getItem('token') || '')
  const userInfo = ref<UserInfo | null>(null)
  const loading = ref(false)

  // Getters
  const isLogin = computed(() => !!token.value)
  const displayName = computed(() => userInfo.value?.nickname || userInfo.value?.username || '访客')

  // Actions
  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  function setUserInfo(info: UserInfo) {
    userInfo.value = info
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
  }

  async function login(username: string, password: string) {
    loading.value = true
    try {
      // TODO: 调用登录 API
      console.log('登录:', username, password)
      // 模拟成功
      setToken('mock-token-' + Date.now())
      setUserInfo({ id: 1, username, nickname: username })
      return true
    } finally {
      loading.value = false
    }
  }

  return {
    token,
    userInfo,
    loading,
    isLogin,
    displayName,
    setToken,
    setUserInfo,
    logout,
    login
  }
})