<!--
  PaymentQRModal — 加量包支付二维码弹窗（骨架 / Task 1）

  当前状态（Task 1）：仅实现状态机骨架 + 生命周期 + Mock API。
  - 真实 API 接入见 Task 2
  - QR 渲染 / 支付宝跳转 / UI 对齐 DESIGN.md 见 Task 3
  - SettingsView 接入 + 成功回调见 Task 4

  状态机（spec §3）：
    idle → creating → pending → paid
                                ↘ expired
                                ↘ error
                                ↘ closed
    所有 state transition 都走 `transitionTo(next)`，不允许直接改 state.value。

  生命周期：
    - watch props.open：true → startFlow()；false → cleanup()
    - onBeforeUnmount(cleanup) 兜底清理 timer

  设计决策：
    - Teleport to body 避免父级 z-index/overflow 裁剪
    - 固定定位遮罩 fallback，不引入外部 UI 框架（CLAUDE.md §5）
    - state 文本在 Task 1 是调试用，Task 3 会替换为生产级 UI
-->
<template>
  <Teleport to="body">
    <div v-if="props.open" class="pqm-overlay" @click.self="handleClose">
      <div class="pqm-dialog" role="dialog" aria-modal="true" aria-labelledby="pqm-title">
        <header class="pqm-header">
          <div id="pqm-title" class="pqm-title">购买加量包</div>
          <button type="button" class="pqm-close" aria-label="关闭" @click="handleClose">×</button>
        </header>

        <div class="pqm-state-debug" data-testid="pqm-state">状态：{{ state }}</div>

        <div class="pqm-tabs">
          <button
            type="button"
            class="pqm-tab"
            :class="{ 'pqm-tab--active': activeTab === 'wechat' }"
            @click="activeTab = 'wechat'"
          >
            微信
          </button>
          <button
            type="button"
            class="pqm-tab"
            :class="{ 'pqm-tab--active': activeTab === 'alipay' }"
            @click="activeTab = 'alipay'"
          >
            支付宝
          </button>
        </div>

        <div class="pqm-body">
          <div v-if="state === 'idle'">等待启动…</div>
          <div v-else-if="state === 'creating'">正在生成订单…</div>
          <div v-else-if="state === 'pending'">
            <div>订单 ID：{{ order?.id ?? '-' }}</div>
            <div>code_url：{{ order?.code_url ?? '-' }}</div>
            <div>剩余 {{ formattedCountdown }}</div>
          </div>
          <div v-else-if="state === 'paid'">支付成功！</div>
          <div v-else-if="state === 'expired'">订单已过期，请重新下单</div>
          <div v-else-if="state === 'error'">出错了：{{ errorMsg || '未知错误' }}</div>
          <div v-else-if="state === 'closed'">已关闭</div>
        </div>

        <footer class="pqm-footer">
          <span class="pqm-hint">支付完成后页面会自动刷新</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

/** 状态机（spec §3）。 */
type State = 'idle' | 'creating' | 'pending' | 'paid' | 'expired' | 'error' | 'closed'

/** 支付通道。 */
type PayChannel = 'wechat' | 'alipay'

// TODO(T2): replace with `import type { Order } from '@/api/orders'` and remove this local definition.
/** 订单响应对象形状（与后端契约对齐，Task 2 会替换为真实 API 类型）。 */
interface Order {
  id: number
  order_no: string
  pay_status: 'pending' | 'paid' | 'closed' | 'refunded'
  code_url: string
  amount: number
  expired_at: string
  pay_channel: PayChannel
}

interface Props {
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  paid: []
}>()

// --- Constants (spec §3) ---
const POLL_INTERVAL_MS = 2000
const PAYMENT_TIMEOUT_SECS = 300 // 前端 5 分钟上限，短于后端 30 分钟过期，提前兜底

// --- State refs ---
const state = ref<State>('idle')
const order = ref<Order | null>(null)
const countdown = ref<number>(0)
const activeTab = ref<PayChannel>('wechat')
const pollFailureCount = ref<number>(0)
const errorMsg = ref<string>('')

// --- Timer / 去重 flag ---
let pollTimer: number | null = null
let countdownTimer: number | null = null
let isPolling = false

// --- Countdown formatter（Task 3 会复用） ---
const formattedCountdown = computed<string>(() => {
  const total = Math.max(0, countdown.value)
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, '0')
  const ss = (total % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
})

// --- Timer helpers ---
function clearPollTimer(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
  isPolling = false
}

function clearCountdownTimer(): void {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function clearAllTimers(): void {
  clearPollTimer()
  clearCountdownTimer()
}

/**
 * 状态机 transition（唯一入口，禁止直接 `state.value = 'xxx'`）。
 *
 * 每次 transition 都先清理旧 state 的资源（timer），再根据新 state 启动资源。
 * Task 2 会在这里接入真实 API 调用。
 */
function transitionTo(next: State): void {
  const prev = state.value
  if (prev === next) return

  // 清理旧 state 资源
  if (prev === 'pending') {
    clearAllTimers()
  }

  state.value = next

  // 设置新 state 资源
  switch (next) {
    case 'creating':
      createOrder().catch((err: unknown) => {
        // T2 真实 API 接入后，下单网络失败会走到这里
        errorMsg.value = err instanceof Error ? err.message : '下单失败'
        transitionTo('error')
      })
      break
    case 'pending':
      countdown.value = PAYMENT_TIMEOUT_SECS
      startCountdown()
      startPolling()
      break
    case 'paid':
      // Task 2 会加 250ms 成功动画后再 emit，此处仅发 emit 骨架
      emit('paid')
      window.setTimeout(() => {
        emit('update:open', false)
      }, 250)
      break
    case 'expired':
    case 'error':
    case 'closed':
      clearAllTimers()
      break
    default:
      break
  }
}

// --- Mock API（Task 2 会替换为真实 @/api/orders.ts） ---

/**
 * Mock：模拟下单，500ms 延迟返回假订单。
 * Task 2 将替换为 `createOrder({ user_id, product_type: 'booster', ... })`。
 */
function createOrder(): Promise<void> {
  return new Promise<void>((resolve) => {
    window.setTimeout(() => {
      // unmount/关闭时可能已经 transition 走了，丢弃响应
      if (state.value !== 'creating') {
        resolve()
        return
      }
      order.value = {
        id: 999,
        order_no: 'MOCK-ORDER-999',
        pay_status: 'pending',
        code_url: 'weixin://mock',
        amount: 2990,
        expired_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        pay_channel: activeTab.value
      }
      pollFailureCount.value = 0
      transitionTo('pending')
      resolve()
    }, 500)
  })
}

/**
 * Mock：轮询订单状态。Task 1 仅返回 pending 占位。
 * Task 2 将替换为 `getOrder(order.id)` + paid/closed/refunded 分支。
 */
async function pollOrderStatus(): Promise<void> {
  // Task 2 会把真实请求替换进来；Task 1 保留去重 + 丢弃逻辑的结构
  if (!order.value) return
  if (state.value !== 'pending') return
  // 模拟成功响应为 pending，无 state 变化
  await Promise.resolve()
}

function startPolling(): void {
  clearPollTimer()
  pollTimer = window.setInterval(() => {
    // 去重：上一次请求未完成时跳过
    if (isPolling) return
    if (state.value !== 'pending') return
    isPolling = true
    pollOrderStatus()
      .catch((err: unknown) => {
        // 轮询错误处理：连续 3 次失败 → error state
        pollFailureCount.value += 1
        if (pollFailureCount.value >= 3) {
          errorMsg.value = err instanceof Error ? err.message : '网络异常'
          transitionTo('error')
        }
      })
      .finally(() => {
        isPolling = false
      })
  }, POLL_INTERVAL_MS)
}

function startCountdown(): void {
  clearCountdownTimer()
  countdownTimer = window.setInterval(() => {
    if (state.value !== 'pending') return
    countdown.value -= 1
    if (countdown.value <= 0) {
      transitionTo('expired')
    }
  }, 1000)
}

// --- Flow entry / cleanup ---

/** 打开弹窗：重置状态 + 开始下单流程。 */
function startFlow(): void {
  // 连续快速 open 的极端场景下，显式兜底清理旧 timer 再改 state
  clearAllTimers()
  order.value = null
  countdown.value = 0
  pollFailureCount.value = 0
  errorMsg.value = ''
  activeTab.value = 'wechat'
  state.value = 'idle' // 初始化复位（无旧资源需清理，非 transition）
  transitionTo('creating')
}

/** 关闭弹窗：切到 closed（transitionTo 内部统一 clearAllTimers）。 */
function cleanup(): void {
  if (state.value !== 'closed' && state.value !== 'idle') {
    transitionTo('closed')
  } else {
    // 已处于终态，仅兜底确保 timer 干净
    clearAllTimers()
  }
}

/** 关闭按钮 / overlay 点击：立即 cleanup（不依赖 watch 异步生效，防 timer 泄漏）+ 通知父组件。 */
function handleClose(): void {
  cleanup()
  emit('update:open', false)
}

// --- Lifecycle ---

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      startFlow()
    } else {
      cleanup()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped>
.pqm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.pqm-dialog {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e8e9ee);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-2xl, 32px);
  width: 420px;
  max-width: calc(100vw - 48px);
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
  box-shadow: var(--shadow-lg, 0 25px 50px -12px rgba(0, 0, 0, 0.15));
}

.pqm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pqm-title {
  font-size: var(--text-lg, 16px);
  font-weight: 600;
  color: var(--color-text, #1a1d26);
}

.pqm-close {
  background: transparent;
  border: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-secondary, #6b7085);
  padding: 4px 8px;
}

.pqm-close:hover {
  color: var(--color-text, #1a1d26);
}

.pqm-state-debug {
  font-size: 12px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
  color: var(--color-text-secondary, #6b7085);
  padding: 6px 8px;
  background: var(--color-surface-hover, #f6f7fb);
  border-radius: var(--radius-sm, 6px);
}

.pqm-tabs {
  display: flex;
  gap: var(--space-2, 8px);
}

.pqm-tab {
  flex: 1;
  padding: 10px 16px;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e8e9ee);
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 14px);
  font-weight: 500;
  color: var(--color-text, #1a1d26);
  cursor: pointer;
  font-family: inherit;
}

.pqm-tab--active {
  border-color: var(--color-brand, #10b981);
  color: var(--color-brand, #10b981);
  font-weight: 600;
}

.pqm-body {
  min-height: 120px;
  font-size: var(--text-sm, 14px);
  color: var(--color-text, #1a1d26);
  line-height: 1.6;
}

.pqm-footer {
  border-top: 1px solid var(--color-border, #e8e9ee);
  padding-top: var(--space-3, 12px);
}

.pqm-hint {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7085);
}
</style>
