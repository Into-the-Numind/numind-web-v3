<!--
  PaymentQRModal — 加量包支付二维码弹窗

  Task 1（done）：状态机骨架 + 生命周期 + Mock API
  Task 2（done）：接入真实 /v1/orders API
  Task 3（this commit）：QR 渲染 + 支付宝跳转 + tab 切换重下单 + DESIGN.md 对齐
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
    - 支付宝 tab 走新标签页（spec §4：禁止 iframe 内嵌，支付宝 frame-break）
    - tab 切换立即重新下单（旧订单自然过期，后端 cron 30min 关闭，不调 cancel API）
-->
<template>
  <Teleport to="body">
    <Transition name="pqm-overlay-fade">
      <div v-if="props.open" class="pqm-overlay" @click.self="handleClose">
        <div class="pqm-dialog" role="dialog" aria-modal="true" aria-labelledby="pqm-title">
          <header class="pqm-header">
            <div id="pqm-title" class="pqm-title">购买加量包</div>
            <button type="button" class="pqm-close" aria-label="关闭" @click="handleClose">
              &times;
            </button>
          </header>

          <!-- 价格 chip：始终可见，让用户明确本次购买内容 -->
          <div class="pqm-price-chip" role="status">
            <span class="pqm-price-amount">&yen;29.90</span>
            <span class="pqm-price-divider" aria-hidden="true">&middot;</span>
            <span>600 积分</span>
            <span class="pqm-price-divider" aria-hidden="true">&middot;</span>
            <span>90 天有效</span>
          </div>

          <!-- dev 调试用；IS_DEV guard 确保生产不显示 -->
          <div v-if="IS_DEV" class="pqm-state-debug" data-testid="pqm-state">状态：{{ state }}</div>

          <!-- Tab 切换：creating 期间禁用，避免并发下单（spec §6 #13） -->
          <div class="pqm-tabs" role="tablist" aria-label="支付方式">
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'wechat'"
              class="pqm-tab"
              :class="{ 'pqm-tab--active': activeTab === 'wechat' }"
              :disabled="state === 'creating'"
              @click="handleTabSwitch('wechat')"
            >
              微信
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'alipay'"
              class="pqm-tab"
              :class="{ 'pqm-tab--active': activeTab === 'alipay' }"
              :disabled="state === 'creating'"
              @click="handleTabSwitch('alipay')"
            >
              支付宝
            </button>
          </div>

          <!-- 主内容区：按 state 分叉展示 -->
          <div class="pqm-body">
            <!-- idle / creating：加载态 -->
            <div
              v-if="state === 'idle' || state === 'creating'"
              class="pqm-status pqm-status--loading"
            >
              <Loader2 class="pqm-spinner" :size="32" aria-hidden="true" />
              <p class="pqm-status-text">
                {{ state === 'creating' ? '正在生成订单...' : '准备中...' }}
              </p>
            </div>

            <!-- pending：付款区（QR / 跳转按钮） -->
            <div v-else-if="state === 'pending'" class="pqm-pending">
              <!-- 微信：QR 码 -->
              <div v-if="activeTab === 'wechat'" class="pqm-qr-area">
                <div class="pqm-qr-frame" aria-live="polite">
                  <img
                    v-if="qrDataUrl"
                    :src="qrDataUrl"
                    alt="付款二维码"
                    width="256"
                    height="256"
                    class="pqm-qr-image"
                  />
                  <div v-else class="pqm-qr-placeholder" aria-label="二维码渲染中">
                    <Loader2 class="pqm-spinner" :size="28" aria-hidden="true" />
                  </div>
                </div>
                <p class="pqm-qr-hint">打开微信扫一扫完成支付</p>
              </div>

              <!-- 支付宝：跳转按钮 -->
              <div v-else class="pqm-alipay-area">
                <button
                  type="button"
                  class="pqm-alipay-btn"
                  :disabled="!order?.code_url"
                  @click="handleOpenAlipay"
                >
                  前往支付宝付款
                </button>
                <p class="pqm-alipay-hint">
                  点击后将在新标签页打开收银台，支付完成后原弹窗会自动更新
                </p>
              </div>

              <!-- 倒计时 -->
              <div class="pqm-countdown" aria-live="polite">
                剩余 <time class="pqm-countdown-time">{{ formattedCountdown }}</time>
              </div>
            </div>

            <!-- paid：成功态 -->
            <div v-else-if="state === 'paid'" class="pqm-status pqm-status--success">
              <CheckCircle2
                class="pqm-status-icon pqm-status-icon--success"
                :size="48"
                aria-hidden="true"
              />
              <p class="pqm-status-text pqm-status-text--emphasis">支付成功！</p>
            </div>

            <!-- expired：过期/关闭 -->
            <div v-else-if="state === 'expired'" class="pqm-status pqm-status--warning">
              <AlertTriangle
                class="pqm-status-icon pqm-status-icon--warning"
                :size="48"
                aria-hidden="true"
              />
              <p class="pqm-status-text">订单已过期或已关闭</p>
              <button type="button" class="pqm-action" @click="handleReorder">重新下单</button>
            </div>

            <!-- error：错误 -->
            <div v-else-if="state === 'error'" class="pqm-status pqm-status--error">
              <AlertCircle
                class="pqm-status-icon pqm-status-icon--error"
                :size="48"
                aria-hidden="true"
              />
              <p class="pqm-status-text">{{ errorMsg || '出错了，请稍后重试' }}</p>
              <button type="button" class="pqm-action" @click="handleRetry">重试</button>
            </div>

            <!-- closed：内部终态，不渲染任何内容（外层 v-if="props.open" 通常也已关） -->
          </div>

          <!-- Footer：仅在 pending 时展示提示（spec §5.2：paid/expired/error 隐藏） -->
          <footer v-if="state === 'pending'" class="pqm-footer">
            <span class="pqm-hint">支付完成后页面会自动刷新，无需手动操作</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import QRCode from 'qrcode'
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-vue-next'
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
const BOOSTER_MONTHS = 0 // 加量包无月份概念，显式传 0 避免裸魔数
const PAID_CLOSE_DELAY_MS = 250 // paid → 弹窗关闭的动画时间
const IS_DEV = import.meta.env.DEV

// --- User store ---
const userStore = useUserStore()

// --- State refs ---
const state = ref<State>('idle')
const order = ref<Order | null>(null)
const countdown = ref<number>(0)
const activeTab = ref<PayChannel>('wechat')
const pollFailureCount = ref<number>(0)
const errorMsg = ref<string>('')
const qrDataUrl = ref<string>('')

// --- Timer / 去重 flag ---
let pollTimer: number | null = null
let countdownTimer: number | null = null
let paidCloseTimer: number | null = null // paid → close 的延迟 timer，cleanup 必须清理避免 unmounted emit
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

function clearPaidCloseTimer(): void {
  if (paidCloseTimer !== null) {
    window.clearTimeout(paidCloseTimer)
    paidCloseTimer = null
  }
}

function clearAllTimers(): void {
  clearPollTimer()
  clearCountdownTimer()
  clearPaidCloseTimer()
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
      // 成功态：emit 事件 + 延迟关闭动画
      // timer handle 登记以便 cleanup 时清理（unmount 期间不得 emit）
      emit('paid')
      clearPaidCloseTimer()
      paidCloseTimer = window.setTimeout(() => {
        paidCloseTimer = null
        emit('update:open', false)
      }, PAID_CLOSE_DELAY_MS)
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
  const rawUserId = userStore.userInfo?.id
  if (rawUserId === undefined || rawUserId === null || rawUserId === '') {
    errorMsg.value = '未登录，请重新登录后重试'
    transitionTo('error')
    return
  }

  // localStorage 反序列化可能把数字变字符串；后端强 int 校验，这里归一化
  const userId = typeof rawUserId === 'string' ? Number(rawUserId) : rawUserId
  if (!Number.isFinite(userId) || userId <= 0) {
    errorMsg.value = '账号信息异常，请重新登录'
    transitionTo('error')
    return
  }

  try {
    const res = await createOrder({
      user_id: userId,
      product_type: 'booster',
      months: BOOSTER_MONTHS,
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
 * 由 startFlow / handleRetry / handleReorder / handleTabSwitch 复用。
 */
function resetForReorder(): void {
  clearAllTimers()
  order.value = null
  countdown.value = 0
  pollFailureCount.value = 0
  errorMsg.value = ''
  qrDataUrl.value = ''
  // 直接写 state.value 是 transitionTo 规约的唯一审计豁免点：
  // 此函数总是紧接 transitionTo('creating') 被调用，
  // 且 clearAllTimers() 已经把旧 state 的资源清干净。不走 transitionTo 是为了避免
  // "idle→idle (no-op)" 或 "error→idle" 这种无意义 transition 在未来新增 state hook 时被误触发。
  state.value = 'idle'
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

/** 关闭按钮 / overlay 点击 / ESC：立即 cleanup（不依赖 watch 异步生效，防 timer 泄漏）+ 通知父组件。 */
function handleClose(): void {
  cleanup()
  emit('update:open', false)
}

/**
 * error 态点击重试：重置 + 重新下单。
 * 幂等：若当前已在 creating，no-op（spec §6 #13 防重复）。
 */
function handleRetry(): void {
  if (state.value === 'creating') return
  resetForReorder()
  transitionTo('creating')
}

/**
 * expired 态点击重新下单：重置 + 重新下单。
 * 幂等：若当前已在 creating，no-op（spec §6 #13 防重复）。
 */
function handleReorder(): void {
  if (state.value === 'creating') return
  resetForReorder()
  transitionTo('creating')
}

/**
 * Tab 切换：直接更新 activeTab；watcher 处理重下单副作用。
 * creating 期间禁用（模板已做 disabled 防御；这里二次保险避免 edge case）。
 */
function handleTabSwitch(channel: PayChannel): void {
  if (state.value === 'creating') return
  if (activeTab.value === channel) return
  activeTab.value = channel
}

/**
 * 支付宝：新标签页打开收银台。
 * 支付宝页面会 frame-break，不能 iframe 嵌入（spec §4.4 决策已写明）。
 * 'noopener' 安全特性：新页面无法通过 window.opener 访问本页。
 */
function handleOpenAlipay(): void {
  const url = order.value?.code_url
  if (!url) return
  if (activeTab.value !== 'alipay') return
  if (state.value !== 'pending') return
  window.open(url, '_blank', 'noopener')
}

// --- Watchers ---

/**
 * QR 渲染：code_url 或 activeTab 变化时刷新 qrDataUrl。
 * 仅在微信 tab + 有 code_url 时渲染；支付宝 tab 不显示 QR。
 */
watch(
  () => [order.value?.code_url, activeTab.value] as const,
  async ([url, tab]) => {
    if (url && tab === 'wechat') {
      try {
        qrDataUrl.value = await QRCode.toDataURL(url, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' }
        })
      } catch {
        // QR 渲染失败是纯本地错误（无网络），忽略即可：qrDataUrl 保持为空字符串
        // 用户会看到 placeholder spinner；真实的支付链路错误走 createOrder/poll 路径
        qrDataUrl.value = ''
      }
    } else {
      qrDataUrl.value = ''
    }
  }
)

/**
 * Tab 切换重下单：
 *   - 仅在 pending 状态下切换才重新下单（idle/creating/paid 等状态不触发）
 *   - 旧订单自然过期，后端 cron 30min 关闭，不调 cancel API（spec §4.4 决策）
 *   - 前端停止轮询即可（transitionTo('creating') 会清理旧 pending 的 timer）
 */
watch(activeTab, (newTab, oldTab) => {
  if (newTab === oldTab) return
  if (state.value !== 'pending') return
  resetForReorder()
  transitionTo('creating')
})

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

// ESC 键关闭：document-level listener（div 无 tabindex，模板绑定不会触发）
onKeyStroke('Escape', () => {
  if (props.open) {
    handleClose()
  }
})

onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped>
/* ============================================================
 * Overlay + Dialog 骨架
 * ============================================================ */
.pqm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 9999);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.pqm-dialog {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-xl, 24px);
  width: 440px;
  max-width: calc(100vw - 48px);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg, 16px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03));
  animation: pqm-dialog-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pqm-dialog-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* ============================================================
 * Header
 * ============================================================ */
.pqm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pqm-title {
  font-size: var(--text-lg, 18px);
  font-weight: 700;
  color: var(--color-text, #1a1d26);
  letter-spacing: -0.01em;
}

.pqm-close {
  background: transparent;
  border: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-secondary, #5f6577);
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 150ms ease);
  font-family: inherit;
}

.pqm-close:hover {
  background: var(--color-surface-hover, #f3f4f8);
  color: var(--color-text, #1a1d26);
}

/* ============================================================
 * Price chip
 * ============================================================ */
.pqm-price-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-sm, 8px) var(--space-md, 12px);
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  color: var(--color-text, #1a1d26);
  border-radius: var(--radius-md, 12px);
  font-size: var(--text-sm, 14px);
  font-weight: 500;
}

.pqm-price-amount {
  color: var(--color-primary, hsl(160, 72%, 40%));
  font-weight: 700;
  font-size: var(--text-base, 16px);
}

.pqm-price-divider {
  color: var(--color-text-muted, #8b90a0);
  font-weight: 400;
}

/* ============================================================
 * Dev-only state debug (hidden in production via v-if IS_DEV)
 * ============================================================ */
.pqm-state-debug {
  font-size: var(--text-xs, 12px);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
  color: var(--color-text-secondary, #5f6577);
  padding: 6px 8px;
  background: var(--color-surface-hover, #f3f4f8);
  border-radius: var(--radius-sm, 6px);
}

/* ============================================================
 * Tabs
 * ============================================================ */
.pqm-tabs {
  display: flex;
  gap: var(--space-sm, 8px);
}

.pqm-tab {
  flex: 1;
  padding: 10px 16px;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-md, 12px);
  font-size: var(--text-sm, 14px);
  font-weight: 500;
  color: var(--color-text, #1a1d26);
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast, 150ms ease);
}

.pqm-tab:hover:not(:disabled):not(.pqm-tab--active) {
  background: var(--color-surface-hover, #f3f4f8);
  border-color: var(--color-text-muted, #8b90a0);
}

.pqm-tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pqm-tab--active {
  border-color: var(--color-primary, hsl(160, 72%, 40%));
  color: var(--color-primary, hsl(160, 72%, 40%));
  font-weight: 600;
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
}

/* ============================================================
 * Body (state-dependent content)
 * ============================================================ */
.pqm-body {
  min-height: 280px;
  font-size: var(--text-sm, 14px);
  color: var(--color-text, #1a1d26);
  line-height: var(--line-height-normal, 1.5);
  display: flex;
  flex-direction: column;
}

/* --- Loading / status blocks (idle, creating, paid, expired, error) --- */
.pqm-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md, 12px);
  padding: var(--space-lg, 16px);
  text-align: center;
}

.pqm-status-text {
  margin: 0;
  font-size: var(--text-sm, 14px);
  color: var(--color-text-secondary, #5f6577);
}

.pqm-status-text--emphasis {
  font-size: var(--text-base, 16px);
  font-weight: 600;
  color: var(--color-text, #1a1d26);
}

.pqm-status-icon {
  flex-shrink: 0;
}

.pqm-status-icon--success {
  color: var(--color-primary, hsl(160, 72%, 40%));
  animation: pqm-pop-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pqm-status-icon--warning {
  color: hsl(40, 90%, 50%);
}

.pqm-status-icon--error {
  color: hsl(0, 72%, 51%);
}

@keyframes pqm-pop-in {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  60% {
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.pqm-spinner {
  color: var(--color-primary, hsl(160, 72%, 40%));
  animation: pqm-spin 0.8s linear infinite;
}

@keyframes pqm-spin {
  to {
    transform: rotate(360deg);
  }
}

/* --- Pending: QR / alipay area --- */
.pqm-pending {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md, 12px);
  padding: var(--space-sm, 8px) 0;
}

.pqm-qr-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md, 12px);
}

.pqm-qr-frame {
  width: 256px;
  height: 256px;
  padding: var(--space-md, 12px);
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border-light, #eeeff3);
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.pqm-qr-image {
  width: 232px;
  height: 232px;
  display: block;
}

.pqm-qr-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 232px;
  height: 232px;
}

.pqm-qr-hint {
  margin: 0;
  font-size: var(--text-sm, 14px);
  color: var(--color-text-secondary, #5f6577);
}

/* --- Alipay area --- */
.pqm-alipay-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md, 12px);
  padding: var(--space-xl, 24px) 0;
}

.pqm-alipay-btn {
  padding: 14px 32px;
  background: var(--color-primary, hsl(160, 72%, 40%));
  color: var(--color-primary-foreground, #ffffff);
  border: none;
  border-radius: var(--radius-md, 12px);
  font-size: var(--text-base, 16px);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast, 150ms ease);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.04));
}

.pqm-alipay-btn:hover:not(:disabled) {
  background: var(--color-primary-hover, hsl(160, 72%, 34%));
  transform: translateY(-1px);
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.06));
}

.pqm-alipay-btn:active:not(:disabled) {
  transform: translateY(0);
}

.pqm-alipay-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pqm-alipay-hint {
  margin: 0;
  font-size: var(--text-xs, 12px);
  color: var(--color-text-muted, #8b90a0);
  text-align: center;
  max-width: 280px;
  line-height: var(--line-height-relaxed, 1.7);
}

/* --- Countdown --- */
.pqm-countdown {
  margin-top: var(--space-sm, 8px);
  font-size: var(--text-sm, 14px);
  color: var(--color-text-secondary, #5f6577);
}

.pqm-countdown-time {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: var(--text-xl, 20px);
  font-weight: 600;
  color: var(--color-text, #1a1d26);
  margin-left: var(--space-xs, 4px);
  font-variant-numeric: tabular-nums;
}

/* ============================================================
 * Action buttons (retry / reorder)
 * ============================================================ */
.pqm-action {
  padding: 10px 24px;
  background: var(--color-primary, hsl(160, 72%, 40%));
  color: var(--color-primary-foreground, #ffffff);
  border: none;
  border-radius: var(--radius-md, 12px);
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast, 150ms ease);
  margin-top: var(--space-sm, 8px);
}

.pqm-action:hover {
  background: var(--color-primary-hover, hsl(160, 72%, 34%));
  transform: translateY(-1px);
}

.pqm-action:active {
  transform: translateY(0);
}

/* ============================================================
 * Footer hint
 * ============================================================ */
.pqm-footer {
  border-top: 1px solid var(--color-border-light, #eeeff3);
  padding-top: var(--space-md, 12px);
  text-align: center;
}

.pqm-hint {
  font-size: var(--text-xs, 12px);
  color: var(--color-text-muted, #8b90a0);
}

/* ============================================================
 * Overlay fade transition
 * ============================================================ */
.pqm-overlay-fade-enter-active,
.pqm-overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.pqm-overlay-fade-enter-from,
.pqm-overlay-fade-leave-to {
  opacity: 0;
}
</style>
