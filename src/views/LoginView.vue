<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-header">
        <div class="login-logo"></div>
        <h1 class="login-title">欢迎回来</h1>
        <p class="login-subtitle">请登录您的账号以继续</p>
      </div>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username" class="form-label">账号</label>
          <input
            id="username"
            v-model="form.username"
            type="text"
            class="form-input"
            placeholder="请输入账号"
            required
            autocomplete="username"
            :disabled="loading"
          />
        </div>

        <div class="form-group">
          <label for="password" class="form-label">密码</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            class="form-input"
            placeholder="请输入密码"
            required
            autocomplete="current-password"
            :disabled="loading"
          />
        </div>

        <button type="submit" class="login-button" :disabled="loading">
          <span v-if="loading" class="loading-spinner"></span>
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const form = reactive({
  username: '',
  password: ''
})

const loading = ref(false)
const errorMessage = ref('')

// 检查是否已登录
onMounted(() => {
  if (userStore.isLoggedIn) {
    router.replace('/')
  }
})

const handleLogin = async () => {
  errorMessage.value = ''
  
  if (!form.username.trim() || !form.password) {
    errorMessage.value = '请输入账号和密码'
    return
  }

  loading.value = true
  
  try {
    const result = await userStore.login(form.username.trim(), form.password)
    
    if (result.success) {
      router.push('/')
    } else {
      errorMessage.value = result.message || '登录失败'
    }
  } catch (error: any) {
    console.error('登录失败:', error)
    errorMessage.value = error.message || '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background:
    radial-gradient(at 0% 0%, rgba(37, 167, 105, 0.08) 0px, transparent 50%),
    radial-gradient(at 100% 0%, rgba(37, 167, 105, 0.04) 0px, transparent 50%),
    radial-gradient(circle at top left, hsl(150, 30%, 96%), hsl(160, 30%, 99%));
  background-attachment: fixed;
  background-size: cover;
}

.login-container {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: 48px 40px;
  box-shadow: var(--shadow-md);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.login-logo {
  width: 270px;
  height: 108px;
  background-image: url('https://numind-dev-1334169463.cos.ap-chengdu.myqcloud.com/sop/logo/%E8%8E%AB%E5%B0%8F%E6%B4%BElogo%20%E9%BB%91%E8%89%B2.png');
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  margin: 0 auto 20px;
}

.login-title {
  font-family: var(--font-sans);
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 8px;
}

.login-subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.error-message {
  padding: 12px 16px;
  background: #fee;
  border: 1px solid #fcc;
  border-radius: var(--radius-md);
  color: #c33;
  font-size: 14px;
  margin-bottom: 20px;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  font-family: var(--font-sans);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}

.form-input::placeholder {
  color: var(--color-text-muted);
}

.form-input:disabled {
  background: var(--color-bg-muted);
  cursor: not-allowed;
}

.login-button {
  width: 100%;
  padding: 14px 24px;
  font-size: 16px;
  font-weight: 600;
  font-family: var(--font-sans);
  color: #ffffff;
  background: var(--color-primary);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.login-button:hover:not(:disabled) {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
}

.login-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .login-container {
    padding: 32px 24px;
  }

  .login-title {
    font-size: 24px;
  }
  
  .login-logo {
    width: 200px;
    height: 80px;
  }
}
</style>
