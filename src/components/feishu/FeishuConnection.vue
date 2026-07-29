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
      class="fc-card fc-card--summary"
      :class="{ 'fc-card--connected': store.connected }"
      :data-testid="store.connected ? 'feishu-connection-success' : 'feishu-connection-empty'"
    >
      <div class="fc-summary">
        <div class="fc-main">
          <span class="fc-icon" :class="store.connected ? 'fc-icon--active' : 'fc-icon--muted'" aria-hidden="true">
            <ShieldCheck :size="20" />
          </span>
          <div class="fc-identity">
            <h3 class="fc-title">飞书</h3>
            <span class="fc-status-pill" :class="`fc-status-pill--${statusTone}`">
              {{ statusLabel }}
            </span>
          </div>
        </div>

        <div v-if="store.state === 'disconnecting'" class="fc-actions">
          <AppButton
            variant="secondary"
            size="sm"
            data-testid="feishu-refresh-disconnecting"
            :loading="store.loading"
            @click="reload"
          >
            刷新状态
          </AppButton>

        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, ShieldCheck } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import { useFeishuStore } from '@/stores/feishu'
import type { FeishuConnectionState } from '@/api/feishu'

const store = useFeishuStore()
const initialized = ref(false)

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

const showLoading = computed(() => store.loading && !initialized.value)
const showError = computed(() => Boolean(store.error) && !store.loading)
const statusLabel = computed(() => statusLabels[store.state])
const statusTone = computed(() => {
  if (store.connected) return 'active'
  if (store.state === 'error') return 'error'
  if (store.state === 'reauth_required') return 'warning'
  return 'muted'
})

async function reload(): Promise<void> {
  await store.fetchStatus()
  initialized.value = true
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

.fc-card--error {
  border-color: rgb(239 68 68 / 34%); /* TODO(admin-rebrand): replace with --danger token */
}

.fc-card--summary {
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-lg);
}

.fc-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: var(--space-lg);
}

.fc-main,
.fc-identity {
  display: flex;
  align-items: center;
}

.fc-main {
  min-width: 0;
  gap: var(--space-md);
}

.fc-identity {
  gap: var(--space-sm);
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

.fc-title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  line-height: var(--line-height-tight);
}

.fc-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.fc-status-pill {
  flex: 0 0 auto;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  line-height: 1.4;
  white-space: nowrap;
}

.fc-status-pill {
  padding: 3px var(--space-sm);
}

.fc-status-pill--active {
  color: var(--accent-link);
  background: var(--accent-soft);
}

.fc-status-pill--warning {
  color: #a16207;
  background: #fef7df;
}

.fc-status-pill--muted {
  color: var(--text-secondary);
  background: var(--surface-tint);
}

.fc-status-pill--error {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
  background: rgb(239 68 68 / 8%); /* TODO(admin-rebrand): replace with --danger token */
}

.fc-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
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

  .fc-summary {
    flex-direction: column;
    align-items: flex-start;
  }

  .fc-actions {
    width: 100%;
    flex-direction: row;
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fc-skeleton {
    animation: none;
  }
}
</style>
