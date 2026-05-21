<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="open" class="modal-overlay" @mousedown.self="handleClose">
        <div class="modal-dialog grant-dialog" role="dialog" aria-modal="true">
          <!-- Header -->
          <div class="modal-header">
            <h2 class="modal-title">开通会员</h2>
            <button class="modal-close" aria-label="关闭" @click="handleClose">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- User info -->
            <div class="grant-user">
              <div class="grant-avatar">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div class="grant-user-info">
                <div class="grant-user-name">{{ childName }}</div>
                <div class="grant-user-id">ID: {{ childId }}</div>
              </div>
            </div>

            <!-- Tabs -->
            <div class="grant-tabs" role="tablist">
              <button
                role="tab"
                :aria-selected="activeTab === 'monthly'"
                class="grant-tab"
                :class="{ active: activeTab === 'monthly' }"
                @click="activeTab = 'monthly'"
              >
                Pro 会员
              </button>
              <button
                role="tab"
                :aria-selected="activeTab === 'trial'"
                class="grant-tab"
                :class="{ active: activeTab === 'trial' }"
                @click="activeTab = 'trial'"
              >
                体验会员
              </button>
            </div>

            <!-- Trial Tab Content -->
            <div
              v-if="activeTab === 'trial'"
              class="grant-tab-content"
              :class="{ disabled: hasUsedTrial }"
              role="tabpanel"
            >
              <div class="grant-product-card trial-card">
                <div class="grant-product-icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div class="grant-product-info">
                  <div class="grant-product-name">体验会员</div>
                  <div class="grant-product-desc">200 积分 · 有效期 3 天</div>
                </div>
              </div>

              <div v-if="hasUsedTrial" class="grant-used-warning" data-testid="trial-used-warning">
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                该账户已使用过体验会员，不可重复赠送
              </div>
            </div>

            <!-- Pro Monthly Tab Content -->
            <div v-if="activeTab === 'monthly'" class="grant-tab-content" role="tabpanel">
              <!-- Hero Card: 1 年 (默认选中) -->
              <button
                type="button"
                class="hero-card"
                :class="{ selected: months === 12 }"
                data-testid="hero-yearly"
                @click="selectYear"
              >
                <span class="deal-flag">-20%↓</span>

                <div class="hero-eyebrow">
                  <span class="hero-radio" :class="{ filled: months === 12 }">
                    <svg
                      v-if="months === 12"
                      viewBox="0 0 24 24"
                      width="10"
                      height="10"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span class="hero-tag">1 年</span>
                </div>

                <div class="hero-price">
                  <span class="hero-cny">¥</span><span class="hero-num">949</span>
                </div>

                <div class="hero-meta">
                  <span class="hero-strike">¥1188</span>
                  <span class="hero-dot" aria-hidden="true">·</span>
                  <span class="hero-permonth">折合 ¥79/月</span>
                </div>

                <div class="hero-divider"></div>

                <div class="hero-savings">
                  <span class="save-pill">省 ¥239</span>
                </div>
              </button>

              <!-- Toggle for custom durations -->
              <button
                type="button"
                class="more-toggle"
                :class="{ open: expanded }"
                data-testid="toggle-custom"
                @click="expanded = !expanded"
              >
                <span>自定义时长（1-11 个月）</span>
                <svg
                  class="chevron"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              <!-- Expanded panel: 1/3/6 quick picks + custom input -->
              <div v-if="expanded" class="more-panel">
                <div class="quick-row">
                  <button
                    v-for="m in [1, 3, 6]"
                    :key="m"
                    type="button"
                    class="tier-small"
                    :class="{ selected: months === m }"
                    :data-testid="`month-btn-${m}`"
                    @click="months = m"
                  >
                    <span class="tier-small-title">{{ m }} 个月</span>
                    <span class="tier-small-price">¥{{ m * 99 }}</span>
                    <span class="tier-small-monthly">¥99/月</span>
                  </button>
                </div>

                <div class="custom-row">
                  <span class="custom-label">或输入</span>
                  <input
                    v-model.number="months"
                    type="number"
                    class="custom-input"
                    min="1"
                    max="11"
                    data-testid="month-input"
                    @blur="clampCustom"
                  />
                  <span class="custom-unit">个月</span>
                  <div class="custom-result">
                    <div class="price">¥{{ customTotal }}</div>
                    <div class="month">¥99/月</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Error message -->
            <p v-if="errorMsg" class="form-error" data-testid="grant-error">{{ errorMsg }}</p>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <div v-if="activeTab === 'monthly'" class="total-line">
              <span class="total-label">合计</span>
              <span class="total-amount">¥{{ total }}</span>
            </div>
            <div v-else class="total-line-placeholder"></div>
            <div class="footer-btns">
              <button type="button" class="btn-cancel" :disabled="loading" @click="handleClose">
                取消
              </button>
              <button
                type="button"
                class="btn-primary"
                :disabled="isSubmitDisabled"
                data-testid="grant-submit-btn"
                @click="handleSubmit"
              >
                {{ loading ? '提交中...' : '确认' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { grantMembership, type GrantResponse } from '@/api/parent'
import { generateIdempotencyKey } from '@/utils/idempotency'
import { formatDate } from '@/utils/datetime'

// ── Props ───────────────────────────────────────────────────────────
const props = defineProps<{
  open: boolean
  childId: number
  childName: string
  hasUsedTrial: boolean
}>()

// ── Emits ───────────────────────────────────────────────────────────
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'success', resp: GrantResponse): void
}>()

// ── State ───────────────────────────────────────────────────────────
const activeTab = ref<'trial' | 'monthly'>('monthly')
const months = ref(12)
const expanded = ref(false)
const loading = ref(false)
const errorMsg = ref('')

// ── Computed ────────────────────────────────────────────────────────
const customTotal = computed(() => {
  const m = months.value
  if (!Number.isFinite(m) || m < 1) return 0
  return Math.min(m, 11) * 99
})

const total = computed(() => {
  if (months.value === 12) return 949
  return months.value * 99
})

const isSubmitDisabled = computed(() => {
  if (loading.value) return true
  if (activeTab.value === 'trial' && props.hasUsedTrial) return true
  if (activeTab.value === 'monthly' && (months.value < 1 || months.value > 12)) return true
  return false
})

// ── Watchers ────────────────────────────────────────────────────────
watch(
  () => props.open,
  (val) => {
    if (val) {
      activeTab.value = 'monthly'
      months.value = 12
      expanded.value = false
      errorMsg.value = ''
      loading.value = false
    }
  }
)

// ── Methods ─────────────────────────────────────────────────────────
function selectYear() {
  months.value = 12
  expanded.value = false
}

function clampCustom() {
  const m = months.value
  if (!Number.isFinite(m) || m < 1) {
    months.value = 1
  } else if (m > 11) {
    months.value = 11
  }
}

function handleClose() {
  if (loading.value) return
  emit('update:open', false)
}

async function handleSubmit() {
  if (isSubmitDisabled.value) return

  const idempotencyKey = generateIdempotencyKey()
  loading.value = true
  errorMsg.value = ''

  try {
    const body: { product_type: 'trial' | 'monthly'; months?: number } = {
      product_type: activeTab.value
    }
    if (activeTab.value === 'monthly') {
      body.months = months.value
    }

    const res = await grantMembership(props.childId, body, idempotencyKey)
    const data = res.data

    const toastMessages: Record<string, string> = {
      trial_granted: `已为 ${props.childName} 开通体验包，3 天有效期`,
      sub_granted: `已为 ${props.childName} 开通 Pro ${data.months ?? months.value} 个月，${formatDate(data.expires_at)} 到期`,
      sub_renewed: `已为 ${props.childName} 续费 Pro ${data.months ?? months.value} 个月，新到期日 ${formatDate(data.expires_at)}`
    }

    emit('update:open', false)
    emit('success', {
      ...data,
      _toastMsg: toastMessages[data.event_type] ?? '操作成功'
    } as GrantResponse & { _toastMsg: string })
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '开通失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

/* Dialog */
.modal-dialog.grant-dialog {
  background: #fff;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid hsl(155, 30%, 93%);
}

.modal-title {
  font-size: 17px;
  font-weight: 700;
  color: hsl(155, 30%, 15%);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: hsl(155, 10%, 55%);
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.modal-close:hover {
  color: hsl(155, 20%, 20%);
}

/* Body */
.modal-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

/* User info */
.grant-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: hsl(155, 25%, 97%);
  border-radius: 10px;
}

.grant-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: hsl(155, 30%, 90%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(158, 60%, 35%);
  flex-shrink: 0;
}

.grant-user-name {
  font-size: 14px;
  font-weight: 600;
  color: hsl(155, 30%, 15%);
}

.grant-user-id {
  font-size: 12px;
  color: hsl(155, 10%, 55%);
  margin-top: 2px;
}

/* Tabs */
.grant-tabs {
  display: flex;
  gap: 4px;
  background: hsl(155, 20%, 95%);
  border-radius: 10px;
  padding: 3px;
}

.grant-tab {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.grant-tab.active {
  background: #fff;
  color: hsl(155, 30%, 15%);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* Tab content */
.grant-tab-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grant-tab-content.disabled {
  opacity: 0.55;
  pointer-events: none;
}

/* Trial product card (used by trial tab only) */
.grant-product-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border: 1.5px solid hsl(155, 30%, 90%);
  border-radius: 12px;
  background: hsl(155, 25%, 98%);
}

.grant-product-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: hsl(158, 50%, 90%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(158, 60%, 35%);
  flex-shrink: 0;
}

.grant-product-name {
  font-size: 14px;
  font-weight: 600;
  color: hsl(155, 30%, 15%);
  margin-bottom: 3px;
}

.grant-product-desc {
  font-size: 12px;
  color: hsl(155, 12%, 50%);
  margin-bottom: 4px;
}

/* Trial used warning */
.grant-used-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: hsl(30, 90%, 96%);
  border: 1px solid hsl(30, 80%, 88%);
  border-radius: 8px;
  color: hsl(25, 70%, 45%);
  font-size: 12px;
}

/* ─── Hero Card (1 year, editorial) ─── */
.hero-card {
  position: relative;
  border: 1.5px solid hsl(160, 72%, 40%);
  border-radius: 12px;
  background: linear-gradient(180deg, hsl(160, 40%, 98%) 0%, #fff 70%);
  padding: 22px 22px 18px;
  cursor: pointer;
  width: 100%;
  font: inherit;
  text-align: left;
  color: inherit;
  transition: all 0.2s ease;
  overflow: visible;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.04),
    0 8px 24px hsl(160 72% 40% / 0.06);
}

.hero-card.selected::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px hsl(160 72% 40% / 0.15);
  pointer-events: none;
}

.hero-card:not(.selected) {
  border-color: hsl(155, 12%, 82%);
  background: #fff;
  opacity: 0.88;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.hero-card:not(.selected):hover {
  opacity: 1;
  border-color: hsl(160, 50%, 60%);
}

/* Ribbon flag attached to top edge */
.deal-flag {
  position: absolute;
  top: -1.5px;
  right: 20px;
  background: hsl(160, 72%, 40%);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  padding: 5px 10px 6px;
  border-radius: 0 0 4px 4px;
  letter-spacing: 0.06em;
  box-shadow: 0 4px 8px hsl(160 72% 40% / 0.22);
  font-variant-numeric: tabular-nums;
  z-index: 2;
}

/* Eyebrow row: radio + small label */
.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.hero-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid hsl(155, 12%, 72%);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.hero-radio.filled {
  background: hsl(160, 72%, 40%);
  border-color: hsl(160, 72%, 40%);
  color: #fff;
}

.hero-tag {
  font-size: 11px;
  font-weight: 700;
  color: hsl(160, 35%, 32%);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero-card:not(.selected) .hero-tag {
  color: hsl(155, 12%, 42%);
}

/* Hero price — Georgia serif, editorial */
.hero-price {
  font-family: Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif;
  color: hsl(160, 72%, 38%);
  line-height: 1;
  letter-spacing: -0.02em;
  margin-bottom: 10px;
  display: flex;
  align-items: baseline;
  gap: 2px;
  font-feature-settings: 'tnum';
}

.hero-card:not(.selected) .hero-price {
  color: hsl(155, 25%, 25%);
}

.hero-cny {
  font-size: 22px;
  font-weight: 600;
  position: relative;
  top: -0.32em;
}

.hero-num {
  font-size: 46px;
  font-weight: 700;
}

/* Meta line */
.hero-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 18px;
  font-size: 13px;
  line-height: 1;
}

.hero-strike {
  color: hsl(155, 10%, 50%);
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}

.hero-dot {
  color: hsl(155, 10%, 70%);
  font-weight: 700;
}

.hero-permonth {
  color: hsl(160, 65%, 30%);
  font-weight: 600;
}

.hero-card:not(.selected) .hero-permonth {
  color: hsl(155, 20%, 35%);
}

/* Full-bleed thin rule */
.hero-divider {
  height: 1px;
  background: hsl(160, 25%, 86%);
  margin: 0 -22px 14px;
}

.hero-card:not(.selected) .hero-divider {
  background: hsl(155, 10%, 90%);
}

/* Savings pill */
.hero-savings {
  display: flex;
  align-items: center;
}

.save-pill {
  background: hsl(160, 72%, 40%);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 11px;
  border-radius: 999px;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}

.hero-card:not(.selected) .save-pill {
  background: hsl(155, 12%, 60%);
}

/* ─── More toggle + panel ─── */
.more-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid hsl(155, 30%, 88%);
  border-radius: 10px;
  background: transparent;
  color: hsl(155, 12%, 45%);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.more-toggle:hover,
.more-toggle.open {
  border-color: hsl(160, 72%, 40%);
  background: hsl(160, 60%, 96%);
  color: hsl(160, 72%, 40%);
}

.more-toggle .chevron {
  transition: transform 0.2s ease;
}

.more-toggle.open .chevron {
  transform: rotate(180deg);
}

.more-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid hsl(155, 30%, 92%);
  border-radius: 12px;
  background: #fff;
}

.quick-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.tier-small {
  position: relative;
  border: 1.5px solid hsl(155, 30%, 88%);
  border-radius: 10px;
  background: #fff;
  padding: 10px 8px;
  cursor: pointer;
  text-align: center;
  font: inherit;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: all 0.2s ease;
}

.tier-small:hover {
  border-color: hsl(160, 70%, 68%);
  background: hsl(160, 60%, 96%);
}

.tier-small.selected {
  border-color: hsl(160, 72%, 40%);
  background: hsl(160, 60%, 93%);
}

.tier-small.selected::after {
  content: '✓';
  position: absolute;
  top: 4px;
  right: 6px;
  color: hsl(160, 72%, 40%);
  font-size: 11px;
  font-weight: 700;
}

.tier-small-title {
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 30%, 15%);
}

.tier-small-price {
  font-size: 14px;
  font-weight: 700;
  color: hsl(155, 30%, 15%);
}

.tier-small-monthly {
  font-size: 10px;
  color: hsl(155, 10%, 55%);
}

/* Custom input row */
.custom-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: hsl(155, 25%, 97%);
  border-radius: 8px;
}

.custom-label {
  font-size: 12px;
  color: hsl(155, 12%, 45%);
  flex-shrink: 0;
}

.custom-input {
  width: 60px;
  padding: 6px 10px;
  border: 1.5px solid hsl(155, 30%, 88%);
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  color: hsl(155, 30%, 15%);
  text-align: center;
  outline: none;
  background: #fff;
}

.custom-input:focus {
  border-color: hsl(160, 72%, 40%);
  box-shadow: 0 0 0 3px hsl(160 60% 90% / 0.6);
}

.custom-unit {
  font-size: 13px;
  color: hsl(155, 12%, 45%);
}

.custom-result {
  margin-left: auto;
  text-align: right;
}

.custom-result .price {
  font-size: 14px;
  font-weight: 700;
  color: hsl(155, 30%, 15%);
}

.custom-result .month {
  font-size: 11px;
  color: hsl(155, 10%, 55%);
  margin-top: 1px;
}

/* Error */
.form-error {
  font-size: 13px;
  color: hsl(0, 65%, 45%);
  margin: 0;
  padding: 8px 12px;
  background: hsl(0, 80%, 97%);
  border-radius: 8px;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid hsl(155, 30%, 93%);
}

.total-line {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.total-line-placeholder {
  flex: 1;
}

.total-label {
  font-size: 11px;
  color: hsl(155, 10%, 55%);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.total-amount {
  font-size: 18px;
  font-weight: 700;
  color: hsl(160, 72%, 40%);
  letter-spacing: -0.01em;
}

.footer-btns {
  display: flex;
  gap: 10px;
}

.btn-cancel {
  padding: 9px 20px;
  border-radius: 8px;
  border: 1.5px solid hsl(155, 30%, 88%);
  background: transparent;
  color: hsl(155, 12%, 45%);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel:not(:disabled):hover {
  border-color: hsl(155, 20%, 65%);
  color: hsl(155, 20%, 30%);
}

.btn-primary {
  padding: 9px 24px;
  border-radius: 8px;
  border: none;
  background: var(--accent, hsl(160, 72%, 40%));
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary:not(:disabled):hover {
  background: var(--accent-hover, hsl(160, 72%, 34%));
}

/* Transition */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
