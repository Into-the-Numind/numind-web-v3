<!--
  FeishuConnection — 飞书 (Lark) 账号连接卡片（设置页「账号连接」区）。

  契约：numind-server biz/feishu/service.go（device-code 两步流，G2-authorize
  2026-06-24 重设计）。状态来自 useFeishuStore（Pinia setup store，
  src/stores/feishu.ts），HTTP 全走 src/api/feishu.ts → request.ts
  （.claude/rules/frontend-state.md §2）。

  ───────────────────────────────────────────────────────────────────────────
  连接现在是「两步」（device-code，无 redirect-OAuth）：
    1. create_app — 打开建应用页（lark-cli config init），用户在飞书侧建自建应用。
    2. authorize  — 应用建好后打开授权页（device-code），用户授权 scopes。
  两步均由 POST /v1/feishu/connect 幂等推进：每次调用返回当前 next_step + url，
  next_step 依次 create_app → authorize → done。

  主推路径 = AI 助手对话：在对话里说「连接飞书」，由 agent 用 AgentAuthPrompt
  卡片逐步引导（两步均走 pause_type=auth + URL，已泛化），体验最完整。本设置页
  把这条作为首选 CTA。

  设置页也保留「直接连接」：点「连接飞书」后由本组件驱动两步——
    开 create_app url → 轮询 connect() 推进；待 next_step 变 authorize →
    开 authorize url → 轮询 connect() 推进；待 next_step=done → fetchStatus 确认已连。

  异步 4 状态（ui-ux.md 硬规则 2，所有异步视图必须处理）：
    - loading：首屏 / 刷新连接状态时的 skeleton 占位。
    - empty：未连接（status=none）→ 文案 + 主推「去 AI 助手连接」+ 次选「直接连接」。
    - error：fetchStatus 失败 → 错误文案 + 「重试」。
    - success：已连接（connected）展示已建应用 ID + 「解绑」。

  销毁性操作「解绑」走 ConfirmModal（ui-ux.md 硬规则 4），禁止裸 confirm()。
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

    <!-- ============ success / empty 共用卡片骨架 ============ -->
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
          <div v-if="store.appIdMasked" class="fc-meta">应用 ID：{{ store.appIdMasked }}</div>
        </template>

        <!-- empty：未连接 + 主推「去 AI 助手连接」 -->
        <template v-else>
          <div class="fc-desc">
            连接飞书后，agent 可代你查询/发送飞书消息、读写文档等（不计费、无功能门）。
          </div>
          <div class="fc-hint">
            连接分两步：先在飞书侧创建一个自建应用，再扫码/打开链接授权。推荐在 AI
            助手对话里说「连接飞书」，由助手逐步引导你完成（体验最顺）。
          </div>
        </template>

        <!-- 直接连接进行中：两步驱动的进度提示（点「直接连接」后显示） -->
        <div v-if="awaitingAuth" class="fc-awaiting">
          <span class="fc-spinner" aria-hidden="true" />
          <span>已在新标签页打开{{ awaitingStepLabel }}，{{ awaitingHint }}</span>
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

        <!-- empty：主推「去 AI 助手连接」+ 次选「直接连接」 -->
        <template v-else>
          <button type="button" class="fc-btn fc-btn--primary" @click="goToAssistant">
            去 AI 助手连接
          </button>
          <button
            type="button"
            class="fc-btn fc-btn--ghost"
            :disabled="store.connecting || awaitingAuth"
            @click="startConnect"
          >
            {{ store.connecting || awaitingAuth ? '连接中…' : '直接连接' }}
          </button>
        </template>
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
import { useRouter } from 'vue-router'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useFeishuStore } from '@/stores/feishu'
import { useNotificationsStore } from '@/stores/notifications'
import type { FeishuActionPhase, FeishuConnectResult } from '@/api/feishu'

const store = useFeishuStore()
const notifications = useNotificationsStore()
const router = useRouter()

// 解绑确认弹窗开关。
const confirmVisible = ref(false)

// ============ 直接连接（device-code 两步驱动）的进行态 ============
// 「直接连接」点击后置位；连接完成 / 失败 / 组件卸载时清除。awaitingStep 记录
// 当前正在等待用户完成哪一步（create_app=建应用 / authorize=授权）。
const awaitingAuth = ref(false)
const awaitingStep = ref<FeishuActionPhase | null>(null)
// setInterval 句柄；连接完成 / 失败 / 组件卸载时清理，避免泄漏。
let pollTimer: ReturnType<typeof setInterval> | null = null
// 已在本次直接连接里打开过的 URL（去重：同一步反复轮询不重复弹新标签）。
let openedUrl = ''
const POLL_INTERVAL_MS = 4000

const awaitingStepLabel = computed(() => {
  if (awaitingStep.value === 'create_app') return '飞书建应用页'
  if (awaitingStep.value === 'app_scope') return '飞书管理员审批页'
  if (awaitingStep.value === 'confirmation') return '飞书操作确认页'
  return '飞书授权页'
})
// 两步的进度文案：建应用阶段提示「建好后会自动进入授权」，授权阶段提示「完成后自动连接」。
const awaitingHint = computed(() =>
  awaitingStep.value === 'create_app' ? '应用建好后会自动进入授权这一步…' : '授权完成后将自动连接…'
)

// ============ 4 状态判定 ============
// loading 仅在「尚无任何已知状态」的首屏 fetch 时显示 skeleton（避免连接/解绑时
// 的二次 fetch 把整卡闪成骨架）。store 初始 status='none'，故用首屏标志位区分。
const initialized = ref(false)
const showLoading = computed(() => store.loading && !initialized.value)
const showError = computed(() => !!store.error && !store.loading)

// ============ 展示派生 ============
const statusLabel = computed(() => (store.connected ? '已连接' : '未连接'))
const statusPillClass = computed(() => ({
  'fc-status-pill--active': store.connected,
  'fc-status-pill--none': store.notConnected
}))
const iconStateClass = computed(() => ({
  'fc-icon--active': store.connected,
  'fc-icon--muted': !store.connected
}))

// ============ 直接连接驱动 ============
/** 停止轮询并复位所有「直接连接」进行态。 */
function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  awaitingAuth.value = false
  awaitingStep.value = null
  openedUrl = ''
}

/**
 * 在新标签打开连接 URL（去重）。device-code 流里 connect() 幂等返回当前步骤的
 * 同一 URL，轮询时会反复拿到——只在 URL 变化（进入新一步）时弹新标签，避免刷屏。
 */
function openStepUrl(url: string): void {
  if (!url || url === openedUrl) return
  openedUrl = url
  // noopener 防止被打开页反向操控当前页。
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * 处理一次 connect() 返回：按 next_step 推进 device-code 两步流。
 * 返回 true 表示连接已完成（done），调用方应停止轮询。
 */
function advance(res: FeishuConnectResult): boolean {
  if (res.state === 'connected') return true
  if (!res.action) return false
  awaitingStep.value = res.action.phase
  if (res.action.url) openStepUrl(res.action.url)
  return false
}

/** 连接成功收尾：拉一次状态确认、复位进行态、toast。 */
async function finishConnected(): Promise<void> {
  stopPolling()
  await store.fetchStatus()
  notifications.success('飞书连接成功')
}

/**
 * 轮询推进：每隔 POLL_INTERVAL_MS 调用幂等的 connect() 推进一步。
 * - 仍 create_app/authorize：保持等待（用户尚未完成当前步）。
 * - 一旦 next_step 进到下一步（建应用→授权），URL 变化 → openStepUrl 自动弹授权页。
 * - next_step=done：连接完成，收尾。
 * connect() 报错时（store 已落 error）停止轮询并 toast，避免静默空转。
 */
function startPolling(): void {
  if (pollTimer !== null) clearInterval(pollTimer)
  pollTimer = setInterval(() => {
    void (async () => {
      try {
        const res = await store.connect()
        if (advance(res)) await finishConnected()
      } catch {
        stopPolling()
        notifications.error(store.error || '飞书连接中断，请重试')
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

/** 主推：跳转到 AI 助手工作台，引导用户在对话里说「连接飞书」。 */
function goToAssistant(): void {
  notifications.info('在 AI 助手对话里说「连接飞书」，助手会一步步引导你完成')
  void router.push({ name: 'home' })
}

/**
 * 次选「直接连接」：在设置页直接驱动 device-code 两步流。
 * connect() 幂等：首次返回 create_app（或已建过应用则直接 authorize）+ url；
 * 打开 url 后开始轮询，由 startPolling 推进到 authorize、最终 done。
 * connect 失败时 store 已落 error 并 rethrow，这里 toast 提示。
 */
async function startConnect(): Promise<void> {
  if (awaitingAuth.value) return
  awaitingAuth.value = true
  openedUrl = ''
  try {
    const res = await store.connect()
    if (advance(res)) {
      await finishConnected()
      return
    }
    if (!res.action?.url) {
      stopPolling()
      notifications.error('未能获取飞书连接链接，请稍后重试')
      return
    }
    startPolling()
  } catch {
    stopPolling()
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

.fc-hint {
  margin-top: 6px;
  font-size: var(--text-xs, 12px);
  line-height: 1.5;
  color: var(--color-text-muted, #9ca0ad);
}

.fc-meta {
  margin-top: 6px;
  font-size: var(--text-xs, 12px);
  color: var(--color-text-muted, #9ca0ad);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
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
/* 列向堆叠：未连接时有「去 AI 助手连接」(主) + 「直接连接」(次) 两个按钮；
   已连接时只有「解绑」。stretch 让两按钮等宽对齐。 */
.fc-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2, 8px);
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
