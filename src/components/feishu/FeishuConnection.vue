<!--
  FeishuConnection — 飞书 (Lark) 账号连接卡片（设置页「账号连接」区）。

  契约：numind-server design.md §10（前端契约）。
  状态来自 useFeishuStore（Pinia setup store，src/stores/feishu.ts），HTTP 全走
  src/api/feishu.ts → request.ts（.claude/rules/frontend-state.md §2）。

  异步 4 状态（ui-ux.md 硬规则 2，所有异步视图必须处理）：
    - loading：首屏 / 刷新连接状态时的 skeleton 占位。
    - empty：未连接（status=none）→ 文案 + CTA「连接飞书」。
    - error：fetchStatus 失败 → 错误文案 + 「重试」。
    - success：已连接（active）展示已授权应用/scope + 「解绑」；
              过期（expired）展示需重连提示 + 「重新连接」。

  销毁性操作「解绑」走 ConfirmModal（ui-ux.md 硬规则 4），禁止裸 confirm()。

  连接流程：connect() 返回 next_step（create_app / authorize）+ url。
  本组件不内嵌 OAuth 回调；点击 CTA 后在新标签页打开 url（建应用 / 授权），
  同时本地进入「等待完成」轮询态，由 store.fetchStatus 周期性刷新，
  一旦后端 status 变为 active 即自动停止轮询并切到 success 渲染
  （design.md §10「用户完成后前端轮询 run 状态自动续显」的连接版）。
-->
<template>
  <div class="feishu-connection">
    <!-- ============ loading：首屏 skeleton ============ -->
    <div v-if="showLoading" class="fc-card fc-card--loading" aria-busy="true">
      <div class="fc-skeleton fc-skeleton--icon" />
      <div class="fc-skeleton-lines">
        <div class="fc-skeleton fc-skeleton--title" />
        <div class="fc-skeleton fc-skeleton--text" />
      </div>
    </div>

    <!-- ============ error：fetchStatus 失败 + 重试 ============ -->
    <div v-else-if="showError" class="fc-card fc-card--error" role="alert">
      <div class="fc-icon fc-icon--error">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div class="fc-body">
        <div class="fc-title">无法获取飞书连接状态</div>
        <div class="fc-desc">{{ store.error || '网络异常，请稍后重试' }}</div>
      </div>
      <button type="button" class="fc-btn fc-btn--ghost" :disabled="store.loading" @click="reload">
        {{ store.loading ? '重试中…' : '重试' }}
      </button>
    </div>

    <!-- ============ success / expired / empty 共用卡片骨架 ============ -->
    <div v-else class="fc-card">
      <div class="fc-icon" :class="iconStateClass">
        <!-- 飞书 logo 占位（避免引外部资源，用内联几何标识）。 -->
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 7h16M4 12h10M4 17h7" />
        </svg>
      </div>

      <div class="fc-body">
        <div class="fc-title-row">
          <span class="fc-title">飞书</span>
          <span class="fc-status-pill" :class="statusPillClass">{{ statusLabel }}</span>
        </div>

        <!-- success：已连接 -->
        <template v-if="store.connected">
          <div class="fc-desc">已连接你的飞书账号，agent 可代你执行飞书操作（不计费）。</div>
          <div v-if="store.appId" class="fc-meta">应用 ID：{{ store.appId }}</div>
          <div v-if="store.scopes.length" class="fc-scopes">
            <span v-for="s in store.scopes" :key="s" class="fc-scope-tag">{{ s }}</span>
          </div>
        </template>

        <!-- expired：过期需重连 -->
        <template v-else-if="store.expired">
          <div class="fc-desc">
            授权已过期，飞书相关操作暂不可用。请重新连接以恢复 agent 的飞书能力。
          </div>
        </template>

        <!-- empty：未连接 + CTA -->
        <template v-else>
          <div class="fc-desc">
            连接飞书后，agent 可代你查询/发送飞书消息、读写文档等（不计费、无功能门）。
          </div>
        </template>

        <!-- 等待外部授权完成时的轮询提示（点 CTA 在新标签打开授权页后显示） -->
        <div v-if="awaitingAuth" class="fc-awaiting">
          <span class="fc-spinner" aria-hidden="true" />
          <span>已在新标签页打开{{ awaitingStepLabel }}，完成后将自动刷新…</span>
          <button type="button" class="fc-link" @click="reload">手动刷新</button>
        </div>
      </div>

      <!-- 右侧动作区 -->
      <div class="fc-actions">
        <!-- success：解绑（销毁性，走 ConfirmModal） -->
        <button
          v-if="store.connected"
          type="button"
          class="fc-btn fc-btn--danger-ghost"
          :disabled="store.disconnecting"
          @click="confirmVisible = true"
        >
          {{ store.disconnecting ? '解绑中…' : '解绑' }}
        </button>

        <!-- expired：重新连接 -->
        <button
          v-else-if="store.expired"
          type="button"
          class="fc-btn fc-btn--primary"
          :disabled="store.connecting"
          @click="startConnect"
        >
          {{ store.connecting ? '处理中…' : '重新连接' }}
        </button>

        <!-- empty：连接飞书 CTA -->
        <button
          v-else
          type="button"
          class="fc-btn fc-btn--primary"
          :disabled="store.connecting"
          @click="startConnect"
        >
          {{ store.connecting ? '处理中…' : '连接飞书' }}
        </button>
      </div>
    </div>

    <!-- 解绑确认弹窗（ui-ux.md 硬规则 4：销毁性操作必须确认） -->
    <ConfirmModal
      v-model="confirmVisible"
      title="解绑飞书"
      message="解绑后 agent 将无法再代你执行飞书操作。飞书侧已创建的应用会保留，可随时重新连接。确定解绑？"
      variant="danger"
      confirm-text="解绑"
      @confirm="handleDisconnect"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useFeishuStore } from '@/stores/feishu'
import { useNotificationsStore } from '@/stores/notifications'
import type { FeishuNextStep } from '@/api/feishu'

const store = useFeishuStore()
const notifications = useNotificationsStore()

// 解绑确认弹窗开关。
const confirmVisible = ref(false)

// ============ 等待外部授权完成的轮询态 ============
// 点 CTA 在新标签打开授权/建应用页后置位；后端 status 变 active 时清除。
const awaitingAuth = ref(false)
const awaitingStep = ref<FeishuNextStep | null>(null)
// setInterval 句柄；组件卸载 / 连接成功时清理，避免泄漏。
let pollTimer: ReturnType<typeof setInterval> | null = null
const POLL_INTERVAL_MS = 4000

const awaitingStepLabel = computed(() =>
  awaitingStep.value === 'create_app' ? '飞书建应用页' : '飞书授权页'
)

// ============ 4 状态判定 ============
// loading 仅在「尚无任何已知状态」的首屏 fetch 时显示 skeleton（避免连接/解绑时
// 的二次 fetch 把整卡闪成骨架）。store 初始 status='none'，故用首屏标志位区分。
const initialized = ref(false)
const showLoading = computed(() => store.loading && !initialized.value)
const showError = computed(() => !!store.error && !store.loading)

// ============ 展示派生 ============
const statusLabel = computed(() => {
  if (store.connected) return '已连接'
  if (store.expired) return '已过期'
  return '未连接'
})
const statusPillClass = computed(() => ({
  'fc-status-pill--active': store.connected,
  'fc-status-pill--expired': store.expired,
  'fc-status-pill--none': store.notConnected
}))
const iconStateClass = computed(() => ({
  'fc-icon--active': store.connected,
  'fc-icon--muted': !store.connected
}))

// ============ 轮询控制 ============
function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  awaitingAuth.value = false
  awaitingStep.value = null
}

function startPolling(step: FeishuNextStep): void {
  awaitingAuth.value = true
  awaitingStep.value = step
  if (pollTimer !== null) clearInterval(pollTimer)
  pollTimer = setInterval(() => {
    void (async () => {
      await store.fetchStatus()
      // 连接成功即停止轮询并提示。
      if (store.connected) {
        stopPolling()
        notifications.success('飞书连接成功')
      }
    })()
  }, POLL_INTERVAL_MS)
}

// ============ 动作 ============
/** 重新拉取状态（error 重试 / 等待态手动刷新）。 */
async function reload(): Promise<void> {
  await store.fetchStatus()
  initialized.value = true
  if (store.connected) stopPolling()
}

/**
 * 发起连接 / 重新连接：拿到 url 后在新标签打开（建应用 / 授权），进入轮询等待态。
 * connect 失败时 store 已落 error 并 rethrow，这里给 toast 提示。
 */
async function startConnect(): Promise<void> {
  try {
    const res = await store.connect()
    if (!res?.url) {
      notifications.error('未能获取飞书连接链接，请稍后重试')
      return
    }
    // 新标签打开（noopener 防止被打开页反向操控当前页）。
    window.open(res.url, '_blank', 'noopener,noreferrer')
    startPolling(res.next_step)
  } catch {
    notifications.error(store.error || '发起飞书连接失败')
  }
}

/** ConfirmModal 确认后执行解绑；成功 toast，失败 store 已落 error + rethrow → 这里 toast。 */
async function handleDisconnect(): Promise<void> {
  try {
    await store.disconnect()
    stopPolling()
    notifications.success('已解绑飞书')
  } catch {
    notifications.error(store.error || '解绑飞书失败')
  }
}

onMounted(() => {
  void reload()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.feishu-connection {
  width: 100%;
}

/* ===== 卡片骨架 ===== */
.fc-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px) var(--space-5, 18px);
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e8e9ee);
  border-radius: var(--radius-md, 14px);
}

.fc-card--error {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.03);
}

/* ===== 图标 ===== */
.fc-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md, 10px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.fc-icon--active {
  background: var(--color-primary-soft, #e9f9f1);
  color: var(--color-primary, #10b981);
}

.fc-icon--muted {
  background: var(--color-surface-hover, #f6f7fb);
  color: var(--color-text-secondary, #6b7085);
}

.fc-icon--error {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md, 10px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-danger, #ef4444);
}

/* ===== 主体文本 ===== */
.fc-body {
  flex: 1;
  min-width: 0;
}

.fc-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin-bottom: 4px;
}

.fc-title {
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  color: var(--color-text, #1a1d26);
}

.fc-desc {
  font-size: var(--text-xs, 13px);
  line-height: 1.6;
  color: var(--color-text-secondary, #6b7085);
}

.fc-meta {
  margin-top: 6px;
  font-size: var(--text-xs, 12px);
  color: var(--color-text-muted, #9ca0ad);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
}

/* ===== scope 标签 ===== */
.fc-scopes {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.fc-scope-tag {
  font-size: 11px;
  line-height: 1.4;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-surface-hover, #f3f4f7);
  color: var(--color-text-secondary, #6b7085);
}

/* ===== 状态徽标 ===== */
.fc-status-pill {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  padding: 1px 8px;
  border-radius: var(--radius-pill, 999px);
}

.fc-status-pill--active {
  background: var(--color-primary-soft, #e9f9f1);
  color: var(--color-primary, #10b981);
}

.fc-status-pill--expired {
  background: rgba(245, 158, 11, 0.12);
  color: var(--color-warning, #d97706);
}

.fc-status-pill--none {
  background: var(--color-surface-hover, #f3f4f7);
  color: var(--color-text-muted, #9ca0ad);
}

/* ===== 等待授权完成提示 ===== */
.fc-awaiting {
  margin-top: 10px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--text-xs, 12px);
  color: var(--color-text-secondary, #6b7085);
}

.fc-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--color-border, #e8e9ee);
  border-top-color: var(--color-primary, #10b981);
  animation: fc-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes fc-spin {
  to {
    transform: rotate(360deg);
  }
}

.fc-link {
  appearance: none;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--color-primary, #10b981);
  cursor: pointer;
  text-decoration: underline;
}

.fc-link:hover {
  opacity: 0.85;
}

/* ===== 动作区 ===== */
.fc-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.fc-btn {
  appearance: none;
  font-family: inherit;
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  padding: 8px 16px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.fc-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.fc-btn--primary {
  background: var(--color-primary, #10b981);
  color: var(--color-primary-foreground, #ffffff);
}

.fc-btn--primary:not(:disabled):hover {
  background: var(--color-primary-hover, #0ea371);
}

.fc-btn--ghost {
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1a1d26);
  border-color: var(--color-border, #e8e9ee);
}

.fc-btn--ghost:not(:disabled):hover {
  background: var(--color-surface-hover, #f6f7fb);
}

.fc-btn--danger-ghost {
  background: var(--color-surface, #ffffff);
  color: var(--color-danger, #ef4444);
  border-color: rgba(239, 68, 68, 0.3);
}

.fc-btn--danger-ghost:not(:disabled):hover {
  background: rgba(239, 68, 68, 0.06);
  border-color: var(--color-danger, #ef4444);
}

/* ===== loading skeleton ===== */
.fc-card--loading {
  align-items: center;
}

.fc-skeleton {
  background: linear-gradient(90deg, #eef0f3 25%, #f6f7fa 50%, #eef0f3 75%);
  background-size: 200% 100%;
  animation: fc-shimmer 1.3s ease-in-out infinite;
  border-radius: var(--radius-sm, 6px);
}

.fc-skeleton--icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md, 10px);
  flex-shrink: 0;
}

.fc-skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fc-skeleton--title {
  width: 30%;
  height: 14px;
}

.fc-skeleton--text {
  width: 70%;
  height: 12px;
}

@keyframes fc-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* ===== 窄屏：动作按钮换行到底部 ===== */
@media (max-width: 560px) {
  .fc-card {
    flex-wrap: wrap;
  }

  .fc-actions {
    width: 100%;
    justify-content: flex-end;
    margin-top: 4px;
  }
}
</style>
