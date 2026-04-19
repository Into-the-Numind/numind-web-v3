<!--
  PaymentQRModal — 加量包支付二维码弹窗

  Task 1（done）：状态机骨架 + 生命周期 + Mock API
  Task 2（this commit）：接入真实 /v1/orders API
  Task 3（todo）：tab 切换重下单、QR 渲染、支付宝跳转、UI 精致化
  Task 4（todo）：SettingsView 接入 + 成功回调

  状态机（spec §3）：
    idle → creating → pending → paid
                                ↘ expired
                                ↘ error
                                ↘ closed
    所有 state transition 都走 `transitionTo(next)`，不允许直接改 state.value。

  生命周期：
    - watch props.open：true → startFlow()；false → cleanup()
    - onBeforeUnmount(cleanup) 兜底清理 timer

  API 约定（src/api/request.ts 拦截器）：
    - 成功（code === 0）：返回 ApiResponse，`res.data` 是 Order
    - 业务失败（code !== 0）：拦截器 throw Error(message)
    - 网络失败 / 401：拦截器 throw AxiosError / Error
    - 因此业务代码只需 try/catch，不需要手动检查 res.code

  设计决策：
    - Teleport to body 避免父级 z-index/overflow 裁剪
    - 固定定位遮罩 fallback，不引入外部 UI 框架（CLAUDE.md §5）
    - refunded 状态按 expired 处理（spec §6 #5）
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
          <div v-else-if="state === 'expired'">
            <div>订单已过期或已关闭，请重新下单</div>
            <button type="button" class="pqm-action" @click="handleReorder">重新下单</button>
          </div>
          <div v-else-if="state === 'error'">
            <div>出错了：{{ errorMsg || '未知错误' }}</div>
            <button type="button" class="pqm-action" @click="handleRetry">重试</button>
          </div>
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
import { createOrder, getOrder, type Order } from '@/api/orders'
import { useUserStore } from '@/stores/user'

/** 状态机（spec §3）。 */
type State = 'idle' | 'creating' | 'pending' | 'paid' | 'expired' | 'error' | 'closed'

/** 支付通道。 */
type PayChannel = 'wechat' | 'alipay'

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
const MAX_POLL_FAILURES = 3

// --- User store ---
const userStore = useUserStore()

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

// --- Countdown formatter ---
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
      createBoosterOrder(activeTab.value).catch((err: unknown) => {
        // 兜底：createBoosterOrder 内部已处理业务错误并 transitionTo('error')，
        // 此处仅捕获意外的 rethrow（防止 unhandled rejection）
        if (state.value === 'creating') {
          errorMsg.value = err instanceof Error ? err.message : '下单失败'
          transitionTo('error')
        }
      })
      break
    case 'pending':
      countdown.value = PAYMENT_TIMEOUT_SECS
      startCountdown()
      startPolling()
      break
    case 'paid':
      // Task 3 会加 250ms 成功动画；骨架：emit 成功事件 + 延迟关闭
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

/**
 * 下单：调用 POST /v1/orders 生成加量包订单。
 *
 * 成功 → order.value = res.data + transitionTo('pending')
 * 业务错误（拦截器 throw）→ errorMsg + transitionTo('error')
 * 网络错误 → errorMsg + transitionTo('error')
 */
async function createBoosterOrder(channel: PayChannel): Promise<void> {
  const userId = userStore.userInfo?.id
  if (userId === undefined || userId === null || userId === '') {
    errorMsg.value = '未登录，请重新登录后重试'
    transitionTo('error')
    return
  }

  try {
    const res = await createOrder({
      user_id: userId,
      product_type: 'booster',
      months: 0,
      pay_channel: channel
    })

    // 拦截器已保证 code === 0 才走到这里，res.data 即 Order
    // open 已关闭或状态被切走，丢弃响应
    if (state.value !== 'creating') return

    order.value = res.data
    pollFailureCount.value = 0
    transitionTo('pending')
  } catch (err: unknown) {
    if (state.value !== 'creating') return
    errorMsg.value = err instanceof Error ? err.message : '下单失败'
    transitionTo('error')
  }
}

/**
 * 轮询订单状态：调用 GET /v1/orders/:id。
 *
 * pay_status 分支（spec §6）：
 *   - pending  → 保持不变，继续轮询
 *   - paid     → transitionTo('paid')
 *   - closed   → transitionTo('expired')
 *   - refunded → transitionTo('expired')（按 expired 处理，§6 #5）
 *
 * 本函数可能 throw（拦截器把业务错误 / 网络错误转成 Error），
 * 由外层 startPolling 的 .catch 累加 pollFailureCount。
 */
async function pollOrderStatus(): Promise<void> {
  if (!order.value) return
  if (state.value !== 'pending') return

  const res = await getOrder(order.value.id)

  // 状态可能在 await 期间被切走（close / expired / error），丢弃响应
  if (state.value !== 'pending') return

  const payStatus = res.data.pay_status
  switch (payStatus) {
    case 'paid':
      transitionTo('paid')
      break
    case 'closed':
    case 'refunded':
      // refunded 按 expired 处理（spec §6 #5）
      transitionTo('expired')
      break
    case 'pending':
    default:
      // 保持 pending，继续轮询
      break
  }
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
        // 连续 MAX_POLL_FAILURES 次失败 → error state
        pollFailureCount.value += 1
        if (pollFailureCount.value >= MAX_POLL_FAILURES) {
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

/**
 * 重置状态，为 creating 做准备。
 * 由 startFlow / handleRetry / handleReorder 复用。
 */
function resetForReorder(): void {
  clearAllTimers()
  order.value = null
  countdown.value = 0
  pollFailureCount.value = 0
  errorMsg.value = ''
  state.value = 'idle' // 复位到 idle（非 transition，无资源清理）
}

/** 打开弹窗：重置状态 + 开始下单流程。 */
function startFlow(): void {
  resetForReorder()
  activeTab.value = 'wechat'
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

/** error 态点击重试：重置 + 重新下单。 */
function handleRetry(): void {
  resetForReorder()
  transitionTo('creating')
}

/** expired 态点击重新下单：重置 + 重新下单。 */
function handleReorder(): void {
  resetForReorder()
  transitionTo('creating')
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
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.pqm-action {
  align-self: flex-start;
  padding: 8px 16px;
  background: var(--color-brand, #10b981);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 14px);
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.pqm-action:hover {
  background: var(--color-brand-hover, #059669);
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
