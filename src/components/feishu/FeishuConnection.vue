<template>
  <section class="feishu-connection" aria-label="飞书个人工作空间">
    <div
      v-if="showLoading"
      class="fc-card fc-card--loading"
      data-testid="feishu-connection-loading"
      aria-busy="true"
      aria-label="正在获取飞书连接状态"
    >
      <div class="fc-skeleton fc-skeleton--icon" />
      <div class="fc-skeleton-lines">
        <div class="fc-skeleton fc-skeleton--title" />
        <div class="fc-skeleton fc-skeleton--text" />
      </div>
    </div>

    <div
      v-else-if="showError"
      class="fc-card fc-card--error"
      data-testid="feishu-connection-error"
      role="alert"
    >
      <AlertCircle class="fc-icon fc-icon--error" :size="20" aria-hidden="true" />
      <div class="fc-body">
        <h3 class="fc-title">无法获取飞书连接状态</h3>
        <p class="fc-desc">{{ store.error || '网络异常，请稍后重试。' }}</p>
      </div>
      <AppButton
        variant="secondary"
        size="sm"
        data-testid="feishu-status-retry"
        :loading="store.loading"
        @click="reload"
      >
        重试
      </AppButton>
    </div>

    <div
      v-else
      class="fc-card"
      :class="{ 'fc-card--connected': store.connected }"
      :data-testid="store.connected ? 'feishu-connection-success' : 'feishu-connection-empty'"
    >
      <span class="fc-icon" :class="store.connected ? 'fc-icon--active' : 'fc-icon--muted'" aria-hidden="true">
        <ShieldCheck :size="20" />
      </span>

      <div class="fc-body">
        <div class="fc-title-row">
          <div>
            <p class="fc-eyebrow">个人工作空间</p>
            <h3 class="fc-title">飞书</h3>
          </div>
          <span class="fc-status-pill" :class="`fc-status-pill--${statusTone}`">
            {{ statusLabel }}
          </span>
        </div>

        <template v-if="store.connected">
          <p class="fc-desc">已连接你的个人飞书工作空间。文档、多维表格和知识库将在首次使用时按需授权，不包含消息发送。</p>
        </template>

        <template v-else>
          <p class="fc-desc">{{ stateDescription }}</p>
          <p class="fc-hint">
            直接在 AI 助手中提出飞书任务即可开始；首次使用时按需授权，不包含消息发送。
          </p>
        </template>

        <p v-if="store.appIdMasked" class="fc-meta">应用 ID：{{ store.appIdMasked }}</p>

        <ul v-if="showCapabilities" class="fc-capabilities" aria-label="飞书能力状态">
          <li
            v-for="domain in capabilityDomains"
            :key="domain.key"
            class="fc-capability"
            :data-testid="`feishu-capability-${domain.key}`"
          >
            <span>{{ domain.label }}</span>
            <span class="fc-capability-state" :class="`fc-capability-state--${capabilityState(domain.key)}`">
              {{ capabilityLabel(domain.key) }}
            </span>
          </li>
        </ul>
      </div>

      <div class="fc-actions">
        <AppButton
          v-if="store.state === 'disconnecting'"
          variant="secondary"
          size="sm"
          data-testid="feishu-refresh-disconnecting"
          :loading="store.loading"
          @click="reload"
        >
          刷新状态
        </AppButton>

        <template v-else-if="store.connected">
          <AppButton
            variant="secondary"
            size="sm"
            data-testid="feishu-reauthorize"
            @click="openAgent('重新授权')"
          >
            重新授权
          </AppButton>
          <AppButton
            variant="text"
            size="sm"
            data-testid="feishu-unbind"
            :loading="store.disconnecting"
            @click="confirmVisible = true"
          >
            解绑
          </AppButton>
        </template>

        <AppButton
          v-else
          variant="primary"
          size="sm"
          :data-testid="actionTestId"
          @click="openAgent(actionLabel)"
        >
          {{ actionLabel }}
        </AppButton>
      </div>
    </div>

    <ConfirmModal
      v-model="confirmVisible"
      title="解绑飞书"
      message="解绑只删除有数保存的连接与授权资料；飞书侧的远端应用会保留，已有资源不受影响。确定解绑？"
      variant="danger"
      confirm-text="解绑"
      @confirm="handleDisconnect"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertCircle, ShieldCheck } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useFeishuStore } from '@/stores/feishu'
import { useNotificationsStore } from '@/stores/notifications'
import type { FeishuCapabilityDomain, FeishuCapabilityState, FeishuConnectionState } from '@/api/feishu'

const store = useFeishuStore()
const router = useRouter()
const notifications = useNotificationsStore()
const confirmVisible = ref(false)
const initialized = ref(false)

const capabilityDomains: { key: FeishuCapabilityDomain; label: string }[] = [
  { key: 'docs', label: '文档' },
  { key: 'base', label: '多维表格' },
  { key: 'wiki', label: '知识库' }
]

const statusLabels: Record<FeishuConnectionState, string> = {
  none: '未连接',
  creating_app: '正在创建应用',
  app_ready: '等待继续',
  waiting_app_approval: '等待管理员批准',
  waiting_user_auth: '等待授权',
  connected: '已连接',
  reauth_required: '需要重新授权',
  error: '连接异常',
  disconnecting: '正在解绑'
}

const stateDescriptions: Partial<Record<FeishuConnectionState, string>> = {
  creating_app: '个人飞书应用正在创建。请回到 AI 助手继续完成这一步。',
  app_ready: '个人飞书应用已准备好。请回到 AI 助手继续完成授权。',
  waiting_app_approval: '应用正在等待飞书管理员批准。批准后，请回到 AI 助手继续原任务。',
  waiting_user_auth: '正在等待你的飞书授权。请回到 AI 助手继续完成这一步。',
  reauth_required: '此前的飞书授权已失效。请在 AI 助手中重新授权后继续原任务。',
  error: '连接状态暂时异常。请在 AI 助手中重新发起飞书任务。',
  disconnecting: '正在安全删除有数保存的飞书连接资料。'
}

const showLoading = computed(() => store.loading && !initialized.value)
const showError = computed(() => Boolean(store.error) && !store.loading)
const showCapabilities = computed(() => store.connected || store.state !== 'none')
const statusLabel = computed(() => statusLabels[store.state])
const statusTone = computed(() => (store.connected ? 'active' : store.state === 'error' ? 'error' : 'muted'))
const stateDescription = computed(
  () => stateDescriptions[store.state] ?? '让 AI 帮你创建个人飞书应用并完成需要的授权。'
)
const actionLabel = computed(() => {
  if (store.state === 'reauth_required') return '重新授权'
  if (['creating_app', 'app_ready', 'waiting_app_approval', 'waiting_user_auth'].includes(store.state)) {
    return '继续连接'
  }
  return '连接飞书'
})
const actionTestId = computed(() => {
  if (store.state === 'reauth_required') return 'feishu-reauthorize'
  if (['creating_app', 'app_ready', 'waiting_app_approval', 'waiting_user_auth'].includes(store.state)) {
    return 'feishu-continue-connection'
  }
  return 'feishu-connect'
})

function capabilityState(domain: FeishuCapabilityDomain): FeishuCapabilityState {
  return store.capabilities[domain].state
}

function capabilityLabel(domain: FeishuCapabilityDomain): string {
  const labels: Record<FeishuCapabilityState, string> = {
    unknown: '尚未验证',
    available: '可用',
    needs_app_scope: '等待应用权限',
    needs_user_scope: '需要授权',
    revoked: '已撤销',
    resource_denied: '资源未授权'
  }
  return labels[capabilityState(domain)]
}

async function reload(): Promise<void> {
  await store.fetchStatus()
  initialized.value = true
}

function openAgent(action: string): void {
  notifications.info(`请在 AI 助手中${action}；完成飞书官方页面操作后，原任务会自动继续。`)
  void router.push({ name: 'home' })
}

async function handleDisconnect(): Promise<void> {
  try {
    await store.disconnect()
    notifications.success('已解绑飞书个人工作空间')
  } catch {
    notifications.error(store.error || '解绑飞书失败，请稍后重试。')
  }
}

onMounted(() => {
  void reload()
})
</script>

<style scoped>
.feishu-connection {
  width: 100%;
}

.fc-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-lg);
  padding: var(--space-xl);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.fc-card--connected {
  border-color: var(--accent-light);
}

.fc-card--error {
  border-color: rgb(239 68 68 / 34%); /* TODO(admin-rebrand): replace with --danger token */
}

.fc-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
}

.fc-icon--active {
  color: var(--primary);
  background: var(--accent-soft);
}

.fc-icon--muted {
  color: var(--text-secondary);
  background: var(--surface-tint);
}

.fc-icon--error {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
  background: rgb(239 68 68 / 10%); /* TODO(admin-rebrand): replace with --danger token */
}

.fc-body {
  flex: 1 1 auto;
  min-width: 0;
}

.fc-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}

.fc-eyebrow {
  margin: 0 0 var(--space-xs);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--line-height-tight);
}

.fc-title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  line-height: var(--line-height-tight);
}

.fc-desc,
.fc-hint,
.fc-meta {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.fc-desc {
  color: var(--text-secondary);
}

.fc-hint,
.fc-meta {
  margin-top: var(--space-sm);
  color: var(--text-muted);
}

.fc-meta {
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.fc-status-pill,
.fc-capability-state {
  flex: 0 0 auto;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  line-height: 1.4;
  white-space: nowrap;
}

.fc-status-pill {
  padding: 3px var(--space-sm);
}

.fc-status-pill--active,
.fc-capability-state--available {
  color: var(--accent-link);
  background: var(--accent-soft);
}

.fc-status-pill--muted,
.fc-capability-state--unknown,
.fc-capability-state--needs_app_scope,
.fc-capability-state--needs_user_scope,
.fc-capability-state--resource_denied {
  color: var(--text-secondary);
  background: var(--surface-tint);
}

.fc-status-pill--error,
.fc-capability-state--revoked {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
  background: rgb(239 68 68 / 8%); /* TODO(admin-rebrand): replace with --danger token */
}

.fc-capabilities {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
  padding: 0;
  margin: var(--space-lg) 0 0;
  list-style: none;
}

.fc-capability {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  background: var(--surface-tint);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
}

.fc-capability-state {
  padding: 2px 6px;
}

.fc-actions {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-sm);
}

.fc-card--loading {
  align-items: center;
}

.fc-skeleton {
  background: linear-gradient(90deg, var(--surface-tint) 25%, var(--surface-hover) 50%, var(--surface-tint) 75%);
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  animation: fc-shimmer 1.3s ease-in-out infinite;
}

.fc-skeleton--icon {
  width: 40px;
  height: 40px;
}

.fc-skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-sm);
}

.fc-skeleton--title {
  width: 28%;
  height: 16px;
}

.fc-skeleton--text {
  width: 68%;
  height: 12px;
}

@keyframes fc-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 767px) {
  .fc-card {
    flex-wrap: wrap;
    padding: var(--space-lg);
  }

  .fc-actions {
    width: 100%;
    flex-direction: row;
    justify-content: flex-end;
  }

  .fc-capabilities {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fc-skeleton {
    animation: none;
  }
}
</style>
