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
              <div class="grant-product-card pro-card">
                <div class="grant-product-icon pro-icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                    <path d="M12 18V6" />
                  </svg>
                </div>
                <div class="grant-product-info">
                  <div class="grant-product-name">Pro 会员</div>
                  <div class="grant-product-desc">每月 2000 积分 · 按月续期</div>
                  <div class="grant-product-price">{{ monthlyPrice }}</div>
                </div>
              </div>

              <!-- Month selector -->
              <div class="form-group">
                <label class="form-label">开通时长</label>
                <div class="month-selector">
                  <button
                    v-for="m in [1, 3, 6, 12]"
                    :key="m"
                    type="button"
                    class="month-btn"
                    :class="{ active: months === m }"
                    :data-testid="`month-btn-${m}`"
                    @click="months = m"
                  >
                    {{ m === 12 ? '1 年' : `${m} 个月` }}
                  </button>
                </div>
                <div class="month-input-row">
                  <label class="form-label-sm">或手动输入（1-12 个月）</label>
                  <input
                    v-model.number="months"
                    type="number"
                    class="form-input month-input"
                    min="1"
                    max="12"
                    data-testid="month-input"
                  />
                </div>
              </div>
            </div>

            <!-- Error message -->
            <p v-if="errorMsg" class="form-error" data-testid="grant-error">{{ errorMsg }}</p>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
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
              {{ loading ? '提交中...' : '确认开通' }}
            </button>
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
const months = ref(1)
const loading = ref(false)
const errorMsg = ref('')

// ── Computed ────────────────────────────────────────────────────────
const monthlyPrice = computed(() => {
  if (months.value === 12) {
    return '1 年 = ¥949'
  }
  const total = months.value * 99
  return `${months.value} 个月 × ¥99 = ¥${total}`
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
      // Reset state when modal opens
      activeTab.value = 'monthly'
      months.value = 1
      errorMsg.value = ''
      loading.value = false
    }
  }
)

// ── Methods ─────────────────────────────────────────────────────────
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

    // Event-type-driven success toast messages
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

/* Product card */
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

.grant-product-icon.pro-icon {
  background: hsl(45, 90%, 90%);
  color: hsl(35, 80%, 40%);
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

.grant-product-price {
  font-size: 13px;
  font-weight: 600;
  color: hsl(158, 60%, 35%);
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

/* Month selector */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: hsl(155, 20%, 30%);
}

.form-label-sm {
  font-size: 12px;
  color: hsl(155, 10%, 55%);
}

.month-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.month-btn {
  padding: 7px 14px;
  border: 1.5px solid hsl(155, 30%, 88%);
  border-radius: 8px;
  background: transparent;
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.month-btn.active {
  border-color: hsl(158, 60%, 40%);
  background: hsl(158, 60%, 95%);
  color: hsl(158, 60%, 30%);
  font-weight: 600;
}

.month-btn:hover:not(.active) {
  border-color: hsl(155, 30%, 70%);
}

.month-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-input.month-input {
  width: 80px;
  padding: 7px 10px;
  border: 1.5px solid hsl(155, 30%, 88%);
  border-radius: 8px;
  font-size: 13px;
  color: hsl(155, 20%, 20%);
  outline: none;
}

.form-input.month-input:focus {
  border-color: hsl(158, 60%, 45%);
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
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid hsl(155, 30%, 93%);
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
  background: var(--accent, hsl(158, 64%, 45%));
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
  background: var(--accent-hover, hsl(158, 64%, 38%));
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
