<!--
  BoosterPurchaseDialog — 加量包批量购买弹窗

  功能：
    - 横向 1 / 5 / 10 快捷按钮
    - 自定义 number input（min=1，blur 验证）
    - 实时总价（Intl.NumberFormat，千分位）
    - 提交：placeOrder + 幂等 key（每次点击新 key）
    - 轮询 getOrderStatus（每 2s，最多 15 次 = 30s 超时）
    - paid → fetchBalance + emit 'success' + emit 'update:open'(false)
    - failed → 行内错误 + 重试 CTA
    - 超时 → "订单处理中"提示

  Props：
    - open: boolean（v-if 控制渲染）
    - userId: number（受益人，自购=当前用户，代购=子账户 id）

  Emits：
    - update:open(false)：关闭弹窗
    - success：支付成功后通知父组件刷新

  Plan §Task 19 / Spec §8.2
-->
<template>
  <Teleport to="body">
    <Transition name="bpd-overlay-fade">
      <div v-if="open" class="bpd-overlay" @click.self="handleCancel">
        <div class="bpd-dialog" role="dialog" aria-modal="true" aria-labelledby="bpd-title">
          <!-- Header -->
          <header class="bpd-header">
            <div id="bpd-title" class="bpd-title">购买加量包</div>
            <button type="button" class="bpd-close" aria-label="关闭" @click="handleCancel">
              &times;
            </button>
          </header>

          <!-- Product info chip -->
          <div class="bpd-info-chip">
            <span class="bpd-info-highlight">¥29.9 / 份</span>
            <span class="bpd-info-sep" aria-hidden="true">·</span>
            <span>600 积分 / 份</span>
            <span class="bpd-info-sep" aria-hidden="true">·</span>
            <span>90 天有效</span>
          </div>

          <!-- Body -->
          <div class="bpd-body">
            <!-- Quick-select buttons -->
            <div class="bpd-quick-label">快速选择数量</div>
            <div class="bpd-quick-row">
              <button
                v-for="q in QUICK_QUANTITIES"
                :key="q"
                type="button"
                class="bpd-quick-btn"
                :class="{ active: quantity === q && !customMode }"
                :data-testid="`quick-btn-${q}`"
                :disabled="quantityLocked"
                @click="selectQuick(q)"
              >
                {{ q }}
              </button>
            </div>

            <!-- Custom input -->
            <div class="bpd-input-row">
              <label class="bpd-input-label" for="bpd-qty-input">自定义数量</label>
              <input
                id="bpd-qty-input"
                v-model.number="rawInput"
                type="number"
                min="1"
                class="bpd-input"
                :class="{ error: quantityError }"
                placeholder="输入数量"
                :disabled="quantityLocked"
                @input="onInput"
                @blur="validateQuantity"
              />
            </div>

            <!-- Inline error -->
            <div v-if="quantityError" class="bpd-error" data-testid="quantity-error">
              {{ quantityError }}
            </div>

            <!-- Total price -->
            <div class="bpd-price-row">
              <span class="bpd-price-label">合计</span>
              <span class="bpd-price-total" data-testid="total-price">{{ formattedTotal }}</span>
            </div>

            <!-- Status messages after submit -->
            <div
              v-if="submitStatus === 'processing' && !qrDataUrl"
              class="bpd-status bpd-status--info"
            >
              <svg
                class="bpd-spinner"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-dasharray="31.4 31.4"
                />
              </svg>
              正在创建订单...
            </div>

            <!-- 二维码区（订单创建成功且拿到 wechat code_url 后渲染） -->
            <div v-else-if="submitStatus === 'processing' && qrDataUrl" class="bpd-qr-area">
              <img
                :src="qrDataUrl"
                alt="付款二维码"
                width="232"
                height="232"
                class="bpd-qr-image"
              />
              <p class="bpd-qr-hint">打开微信扫一扫完成支付</p>
              <p class="bpd-qr-sub-hint">支付成功后页面会自动刷新积分</p>
            </div>

            <div v-else-if="submitStatus === 'timeout'" class="bpd-status bpd-status--warning">
              订单处理中，请稍候查看积分余额
            </div>
            <div v-else-if="submitStatus === 'failed'" class="bpd-status bpd-status--error">
              {{ failureMessage || '支付失败，请重试' }}
              <button type="button" class="bpd-retry-btn" @click="resetStatus">重试</button>
            </div>
          </div>

          <!-- Footer actions -->
          <div class="bpd-footer">
            <button type="button" class="bpd-btn bpd-btn--cancel" @click="handleCancel">
              取消
            </button>
            <button
              type="button"
              class="bpd-btn bpd-btn--primary"
              :disabled="!canSubmit"
              data-testid="submit-btn"
              @click="handleSubmit"
            >
              {{ submitStatus === 'processing' ? '处理中...' : '立即购买' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import QRCode from 'qrcode'
import { placeOrder, getOrderStatus } from '@/api/credits'
import { generateIdempotencyKey } from '@/utils/idempotency'
import { useCreditsStore } from '@/stores/credits'

// ── Props & Emits ─────────────────────────────────────────────────────────

const props = defineProps<{
  open: boolean
  userId: number // 受益人 user_id（自购时 = current user，代购时 = child id）
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'success'): void
}>()

// ── Constants ─────────────────────────────────────────────────────────────

const QUICK_QUANTITIES = [1, 5, 10] as const
const UNIT_PRICE = 29.9
const MAX_QUANTITY = 10000
const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 15 // 30 秒（每 2 秒一次）

// ── State ─────────────────────────────────────────────────────────────────

const creditsStore = useCreditsStore()

/** 当前数量（computed from rawInput） */
const quantity = ref<number>(1)

/** input 的原始 v-model 值（可能是非整数字符串） */
const rawInput = ref<number>(1)

/** 是否处于自定义输入模式（不是快捷按钮选择） */
const customMode = ref(false)

/** 数量校验错误文案 */
const quantityError = ref<string | null>(null)

/** 提交状态机：idle | processing | timeout | failed */
const submitStatus = ref<'idle' | 'processing' | 'timeout' | 'failed'>('idle')

/** 失败时的错误信息 */
const failureMessage = ref<string>('')

/** 微信扫码 URL（来自 placeOrder 响应的 code_url 字段）。 */
const codeUrl = ref<string>('')

/** 渲染后的二维码 data URL（QRCode.toDataURL 结果）。 */
const qrDataUrl = ref<string>('')

/** 轮询 timer handle */
let pollTimer: number | null = null

/** 已轮询次数 */
let pollCount = 0

// ── Computed ──────────────────────────────────────────────────────────────

/** 总价（量 × 单价，千分位格式化） */
const formattedTotal = computed<string>(() => {
  const total = quantity.value * UNIT_PRICE
  // Intl.NumberFormat 千分位，2 位小数
  const formatted = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(total)
  return `¥${formatted}`
})

/** 是否可提交 */
const canSubmit = computed<boolean>(() => {
  return (
    !quantityError.value &&
    quantity.value >= 1 &&
    Number.isInteger(quantity.value) &&
    submitStatus.value !== 'processing'
  )
})

/**
 * 数量是否被锁定（不允许改）。
 *
 * 一旦用户点击"立即购买"，订单与 QR 已经创建在后端，对应的支付金额已经固定。
 * 此时如果允许改数量，前端总价会动但二维码金额不会变，用户扫码付的是老金额却
 * 看到新数字——明显不一致。锁定数量直到用户取消或成功/失败重置。
 *
 * processing/timeout/failed 三态都锁（timeout/failed 时也不能改：用户应该用"重试"
 * 按钮触发 resetStatus → idle 才能再选数量）。
 */
const quantityLocked = computed<boolean>(() => {
  return submitStatus.value !== 'idle'
})

// ── Methods ───────────────────────────────────────────────────────────────

/** 点击快捷按钮 */
function selectQuick(q: number) {
  rawInput.value = q
  quantity.value = q
  customMode.value = false
  quantityError.value = null
}

/** 自定义 input 的 input 事件 */
function onInput() {
  customMode.value = true
  const val = Number(rawInput.value)
  if (Number.isInteger(val) && val > 0) {
    quantity.value = val
  }
}

/** blur 时验证数量 */
function validateQuantity() {
  const val = rawInput.value
  if (!Number.isInteger(val) || val < 1) {
    quantityError.value = '请输入大于 0 的整数'
    return
  }
  if (val > MAX_QUANTITY) {
    quantityError.value = `单次最多购买 ${MAX_QUANTITY.toLocaleString()} 份`
    return
  }
  quantity.value = val
  quantityError.value = null
}

/** 清理轮询 timer + QR 状态。 */
function clearPoll() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
  pollCount = 0
  codeUrl.value = ''
  qrDataUrl.value = ''
}

/** 重置提交状态 */
function resetStatus() {
  submitStatus.value = 'idle'
  failureMessage.value = ''
}

/**
 * 渲染微信扫码二维码：codeUrl 一旦写入就用 QRCode.toDataURL 转成 data URL。
 * Race guard：快速重试时旧的 toDataURL 可能在新的之后 resolve；用 qrGenId 递增
 * 版本号，只有最新一次的结果才回写到 qrDataUrl。
 */
let qrGenId = 0
watch(codeUrl, async (url) => {
  if (!url) {
    qrDataUrl.value = ''
    return
  }
  qrGenId += 1
  const myId = qrGenId
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
    if (myId === qrGenId) {
      qrDataUrl.value = dataUrl
    }
  } catch {
    if (myId === qrGenId) {
      qrDataUrl.value = ''
    }
  }
})

/** 关闭弹窗（取消 / overlay 点击 / ESC） */
function handleCancel() {
  clearPoll()
  resetStatus()
  emit('update:open', false)
}

/** 显示超时提示 */
function showTimeoutMessage() {
  submitStatus.value = 'timeout'
}

/** 显示失败提示 */
function showFailureMessage(msg?: string) {
  submitStatus.value = 'failed'
  failureMessage.value = msg || '支付失败，请重试'
}

/** 提交购买 */
async function handleSubmit() {
  if (!canSubmit.value) return

  // 每次点击生成新的幂等 key
  const idempotencyKey = generateIdempotencyKey()

  submitStatus.value = 'processing'
  clearPoll()

  try {
    const orderRes = await placeOrder(
      {
        user_id: props.userId,
        product_type: 'booster',
        quantity: quantity.value,
        pay_channel: 'wechat'
      },
      idempotencyKey
    )

    // 拦截器保证 code===0 才到这里。后端返 model.Order JSON，字段名按 GORM tag
    // 走（`id` 而不是 spec 旧定义的 `order_id`；`code_url` 是 wechat 扫码链接）。
    const order = (orderRes as unknown as { data: { id: number; code_url?: string } }).data
    const orderId = order.id

    // 渲染微信扫码二维码（watch codeUrl → QRCode.toDataURL → qrDataUrl）。
    // 若后端未返 code_url（异常情况），仍然继续轮询，模板会显示 spinner。
    codeUrl.value = order.code_url ?? ''

    // 启动轮询
    pollCount = 0
    pollTimer = window.setInterval(async () => {
      if (pollCount >= MAX_POLLS) {
        clearPoll()
        showTimeoutMessage()
        return
      }
      pollCount++

      try {
        const statusRes = await getOrderStatus(orderId)
        const status = (statusRes as unknown as { data: { status: string } }).data.status

        if (status === 'paid') {
          clearPoll()
          await creditsStore.fetchBalance()
          emit('success')
          emit('update:open', false)
        } else if (status === 'failed') {
          clearPoll()
          showFailureMessage()
        }
        // 'pending' → 继续等待
      } catch {
        // 轮询网络异常，继续重试（不立即报错）
      }
    }, POLL_INTERVAL_MS)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '下单失败，请重试'
    showFailureMessage(msg)
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

// 关闭弹窗时清理 timer 和状态
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      clearPoll()
      resetStatus()
      // 重置数量到默认值
      quantity.value = 1
      rawInput.value = 1
      customMode.value = false
      quantityError.value = null
    }
  }
)

onBeforeUnmount(() => {
  clearPoll()
})
</script>

<style scoped>
/* ============================================================
 * Overlay + Dialog 骨架
 * ============================================================ */
.bpd-overlay {
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

.bpd-dialog {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-xl, 24px);
  width: 400px;
  max-width: calc(100vw - 48px);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg, 16px);
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03));
  animation: bpd-dialog-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes bpd-dialog-pop {
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
.bpd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bpd-title {
  font-size: var(--text-lg, 18px);
  font-weight: 700;
  color: var(--color-text, #1a1d26);
  letter-spacing: -0.01em;
}

.bpd-close {
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

.bpd-close:hover {
  background: var(--color-surface-hover, #f3f4f8);
  color: var(--color-text, #1a1d26);
}

/* ============================================================
 * Info chip
 * ============================================================ */
.bpd-info-chip {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-sm, 8px) var(--space-md, 12px);
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  color: var(--color-text, #1a1d26);
  border-radius: var(--radius-md, 12px);
  font-size: var(--text-sm, 14px);
  font-weight: 500;
}

.bpd-info-highlight {
  color: var(--color-primary, hsl(160, 72%, 40%));
  font-weight: 700;
  font-size: var(--text-base, 16px);
}

.bpd-info-sep {
  color: var(--color-text-muted, #8b90a0);
  font-weight: 400;
}

/* ============================================================
 * Body
 * ============================================================ */
.bpd-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 12px);
}

.bpd-quick-label {
  font-size: var(--text-xs, 12px);
  color: var(--color-text-secondary, #5f6577);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bpd-quick-row {
  display: flex;
  gap: var(--space-sm, 8px);
}

.bpd-quick-btn {
  flex: 1;
  padding: 10px 0;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  color: var(--color-text, #1a1d26);
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition-fast, 150ms ease);
  text-align: center;
}

.bpd-quick-btn:hover {
  background: var(--color-surface-hover, #f3f4f8);
  border-color: var(--color-text-muted, #8b90a0);
}

.bpd-quick-btn.active {
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  border-color: var(--color-primary, hsl(160, 72%, 40%));
  color: var(--color-primary, hsl(160, 72%, 40%));
}

/* 数量按钮 + input 在订单生成后锁定 — 视觉灰禁防误改 */
.bpd-quick-btn:disabled,
.bpd-input:disabled {
  background: var(--color-surface-muted, #f7f7f9);
  color: var(--color-text-muted, #8b90a0);
  border-color: var(--color-border, #e2e4ea);
  cursor: not-allowed;
  opacity: 0.6;
}

.bpd-quick-btn:disabled:hover {
  background: var(--color-surface-muted, #f7f7f9);
  border-color: var(--color-border, #e2e4ea);
}

/* ============================================================
 * Input
 * ============================================================ */
.bpd-input-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs, 4px);
}

.bpd-input-label {
  font-size: var(--text-xs, 12px);
  color: var(--color-text-secondary, #5f6577);
  font-weight: 500;
}

.bpd-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-base, 16px);
  color: var(--color-text, #1a1d26);
  background: var(--color-surface, #ffffff);
  font-family: inherit;
  transition: border-color var(--transition-fast, 150ms ease);
  box-sizing: border-box;
  outline: none;
}

.bpd-input:focus {
  border-color: var(--color-primary, hsl(160, 72%, 40%));
  box-shadow: 0 0 0 3px hsl(160 60% 40% / 0.12);
}

.bpd-input.error {
  border-color: var(--color-danger, #ef4444);
}

.bpd-input.error:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
}

/* ============================================================
 * Error message
 * ============================================================ */
.bpd-error {
  font-size: var(--text-xs, 12px);
  color: var(--color-danger, #ef4444);
  font-weight: 500;
}

/* ============================================================
 * Price
 * ============================================================ */
.bpd-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md, 12px) 0;
  border-top: 1px solid var(--color-border-light, #eeeff3);
}

.bpd-price-label {
  font-size: var(--text-sm, 14px);
  color: var(--color-text-secondary, #5f6577);
}

.bpd-price-total {
  font-size: var(--text-xl, 20px);
  font-weight: 700;
  color: var(--color-primary, hsl(160, 72%, 40%));
  font-variant-numeric: tabular-nums;
}

/* ============================================================
 * Status messages
 * ============================================================ */
.bpd-status {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-sm, 8px) var(--space-md, 12px);
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 14px);
}

.bpd-status--info {
  background: hsl(210 60% 95%);
  color: hsl(210 72% 40%);
}

.bpd-status--warning {
  background: hsl(38 60% 95%);
  color: hsl(38 72% 40%);
}

.bpd-status--error {
  background: hsl(0 60% 95%);
  color: var(--color-danger, #ef4444);
  flex-wrap: wrap;
}

/* QR 扫码区（wechat code_url 渲染后显示） */
.bpd-qr-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-md, 12px) 0;
}

.bpd-qr-image {
  display: block;
  width: 232px;
  height: 232px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 10px);
  background: #ffffff;
}

.bpd-qr-hint {
  margin: 0;
  font-size: var(--text-sm, 14px);
  color: var(--color-text, #1f2937);
  font-weight: 500;
}

.bpd-qr-sub-hint {
  margin: 0;
  font-size: var(--text-xs, 12px);
  color: var(--color-text-muted, #6b7280);
}

.bpd-retry-btn {
  background: transparent;
  border: 1px solid var(--color-danger, #ef4444);
  border-radius: var(--radius-sm, 6px);
  color: var(--color-danger, #ef4444);
  font-size: var(--text-xs, 12px);
  font-weight: 600;
  padding: 3px 10px;
  cursor: pointer;
  font-family: inherit;
  margin-left: auto;
  transition: all var(--transition-fast, 150ms ease);
}

.bpd-retry-btn:hover {
  background: var(--color-danger, #ef4444);
  color: #ffffff;
}

/* ============================================================
 * Spinner
 * ============================================================ */
.bpd-spinner {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  animation: bpd-spin 0.8s linear infinite;
}

@keyframes bpd-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ============================================================
 * Footer actions
 * ============================================================ */
.bpd-footer {
  display: flex;
  gap: var(--space-sm, 8px);
  justify-content: flex-end;
}

.bpd-btn {
  padding: 10px 20px;
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-fast, 150ms ease);
  font-family: inherit;
  min-width: 88px;
}

.bpd-btn--cancel {
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1a1d26);
  border-color: var(--color-border, #e2e4ea);
}

.bpd-btn--cancel:hover {
  background: var(--color-surface-hover, #f3f4f8);
}

.bpd-btn--primary {
  background: var(--color-primary, hsl(160, 72%, 40%));
  color: var(--color-primary-foreground, #ffffff);
}

.bpd-btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover, hsl(160, 72%, 34%));
  transform: translateY(-1px);
}

.bpd-btn--primary:active:not(:disabled) {
  transform: translateY(0);
}

.bpd-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ============================================================
 * Overlay fade transition
 * ============================================================ */
.bpd-overlay-fade-enter-active,
.bpd-overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.bpd-overlay-fade-enter-from,
.bpd-overlay-fade-leave-to {
  opacity: 0;
}
</style>
