<!--
  ConnectExtension — 把登录态/采集 token 交给浏览器插件（T8）

  路由 /connect-extension。
  调 GET /v1/xhs/ext-token 拿 token，通过两条通道交给插件：
    1. chrome.runtime.sendMessage(EXTENSION_ID, ...) —— 插件已发布时的首选通道
    2. window.postMessage(...) —— content script 注入页面后的兜底通道
  给"已授权 / 请重试"反馈。

  安全说明：本页面需要 CSP `script-src 'self'`（不允许内联第三方脚本），
  token 仅通过受控的 postMessage/runtime 通道下发，不写入 DOM、不打印到控制台。
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-vue-next'

import AppButton from '@/components/common/AppButton.vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { useXhsStore } from '@/stores/xhs'
import { EXTENSION_ID } from './extensionConstants'

const router = useRouter()
const store = useXhsStore()

type ConnectState = 'connecting' | 'done' | 'error'
const state = ref<ConnectState>('connecting')
const errorMsg = ref('')

// chrome.runtime 类型在普通页面环境不存在，做最小声明用于可选调用。
interface ChromeRuntimeLike {
  runtime?: {
    sendMessage?: (
      extensionId: string,
      message: unknown,
      callback?: (response: unknown) => void
    ) => void
    lastError?: { message?: string }
  }
}

function deliverToExtension(token: string, expiresAt: string): boolean {
  const payload = {
    type: 'NUMIND_XHS_EXT_TOKEN',
    token,
    expires_at: expiresAt
  }

  let delivered = false

  // 通道 1：chrome.runtime.sendMessage（需已知 EXTENSION_ID 且插件已安装）
  const chromeApi = (window as unknown as { chrome?: ChromeRuntimeLike }).chrome
  if (
    EXTENSION_ID &&
    EXTENSION_ID !== 'PLACEHOLDER_EXTENSION_ID' &&
    chromeApi?.runtime?.sendMessage
  ) {
    try {
      chromeApi.runtime.sendMessage(EXTENSION_ID, payload)
      delivered = true
    } catch {
      // 忽略，落到 postMessage 兜底
    }
  }

  // 通道 2：window.postMessage（content script 注入后监听同源消息）
  try {
    window.postMessage(payload, window.location.origin)
    delivered = true
  } catch {
    // 两条通道都失败时由调用方处理
  }

  return delivered
}

async function authorize() {
  state.value = 'connecting'
  errorMsg.value = ''
  const res = await store.fetchExtToken()
  if (!res || !res.token) {
    state.value = 'error'
    errorMsg.value = store.error || '获取授权令牌失败，请重试'
    return
  }
  const ok = deliverToExtension(res.token, res.expires_at)
  if (ok) {
    state.value = 'done'
  } else {
    state.value = 'error'
    errorMsg.value = '未能与插件通信，请确认插件已安装并刷新后重试'
  }
}

onMounted(authorize)
</script>

<template>
  <MainLayout>
    <div class="connect-extension">
      <div class="back-link" @click="router.push('/xhs/install')">
        <ArrowLeft :size="16" />
        <span>返回安装引导</span>
      </div>

      <div class="card">
        <!-- connecting -->
        <template v-if="state === 'connecting'">
          <Loader2 :size="48" class="icon spin" />
          <h1>正在授权…</h1>
          <p>正在把登录态安全地交给采集插件，请稍候。</p>
        </template>

        <!-- done -->
        <template v-else-if="state === 'done'">
          <CheckCircle2 :size="48" class="icon icon--ok" />
          <h1>已授权</h1>
          <p>插件已获得采集授权，现在可以前往小红书一键采集笔记了。</p>
          <div class="actions">
            <AppButton variant="primary" @click="router.push('/xhs')">返回选题库</AppButton>
            <AppButton variant="secondary" @click="authorize">重新授权</AppButton>
          </div>
        </template>

        <!-- error -->
        <template v-else>
          <XCircle :size="48" class="icon icon--err" />
          <h1>授权失败</h1>
          <p>{{ errorMsg }}</p>
          <div class="actions">
            <AppButton variant="primary" @click="authorize">请重试</AppButton>
            <AppButton variant="secondary" @click="router.push('/xhs/install')">
              查看安装引导
            </AppButton>
          </div>
        </template>
      </div>

      <p class="csp-note">
        本页面在
        <code>script-src 'self'</code> 的内容安全策略下运行，授权令牌仅通过受控通道下发给插件。
      </p>
    </div>
  </MainLayout>
</template>

<style scoped>
.connect-extension {
  max-width: 520px;
  margin: 0 auto;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-muted, #6b7085);
  cursor: pointer;
  margin-bottom: 24px;
  user-select: none;
}

.back-link:hover {
  color: var(--primary, #10b981);
}

.card {
  background: var(--surface, #fff);
  border: 1px solid #e8e9ee;
  border-radius: 16px;
  padding: 48px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
}

.icon {
  color: var(--primary, #10b981);
}

.icon--ok {
  color: #10b981;
}

.icon--err {
  color: #dc2626;
}

.card h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text, #1a1d26);
}

.card p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary, #4b5563);
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.csp-note {
  margin-top: 20px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted, #9ea1b1);
  text-align: center;
}

.csp-note code {
  background: #f0f1f5;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}
</style>
