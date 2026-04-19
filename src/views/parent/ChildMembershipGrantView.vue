<template>
  <MainLayout>
    <div class="grant-page">
      <!-- Hero -->
      <header class="hero">
        <div>
          <h1 class="hero-title">子账户会员管理</h1>
          <p class="hero-subtitle">为团队子账户开通体验 / 月度会员（记录原因供审计）</p>
        </div>
      </header>

      <!-- Loading / Empty / Error / Success states -->
      <div v-if="loading" class="state-card">
        <div class="spinner" />
        <p class="state-text">加载子账户...</p>
      </div>

      <div v-else-if="error" class="state-card error">
        <p class="state-text">{{ error }}</p>
        <button class="retry-btn" @click="loadChildren">重试</button>
      </div>

      <div v-else-if="children.length === 0" class="state-card empty">
        <p class="state-text">暂无子账户</p>
        <p class="state-hint">在"客户管理"中先创建子账户，再回到此页为他们开通会员。</p>
      </div>

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>子账户</th>
              <th>用户名</th>
              <th>当前会员</th>
              <th>到期时间</th>
              <th class="col-action">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="child in children" :key="child.id">
              <td>
                <div class="child-name">{{ child.nickname || '未命名' }}</div>
                <div class="child-meta">ID: {{ child.id }}</div>
              </td>
              <td>{{ child.username }}</td>
              <td>
                <span class="tier-badge" :class="`tier-${child.user_tier || 'free'}`">
                  {{ tierLabel(child.user_tier) }}
                </span>
              </td>
              <td>{{ formatExpiry(child.tier_expires) }}</td>
              <td class="col-action">
                <button class="grant-btn" @click="openGrantModal(child)">开通会员</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Grant Modal -->
      <Teleport to="body">
        <div v-if="showModal" class="modal-overlay" @mousedown.self="closeModal">
          <div class="modal-dialog" role="dialog" aria-labelledby="grant-modal-title">
            <header class="modal-header">
              <h2 id="grant-modal-title" class="modal-title">为 {{ targetName }} 开通会员</h2>
              <button class="modal-close" aria-label="关闭" @click="closeModal">×</button>
            </header>

            <form id="grant-form" class="modal-body" @submit.prevent="submit">
              <!-- Product Type -->
              <div class="form-group">
                <label class="form-label">产品类型 <span class="required">*</span></label>
                <div class="radio-row">
                  <label class="radio-option" :class="{ active: form.product_type === 'trial' }">
                    <input
                      v-model="form.product_type"
                      type="radio"
                      name="product-type"
                      value="trial"
                    />
                    <span class="radio-title">体验会员</span>
                    <span class="radio-desc">固定 3 天，共 10 次运行</span>
                  </label>
                  <label class="radio-option" :class="{ active: form.product_type === 'monthly' }">
                    <input
                      v-model="form.product_type"
                      type="radio"
                      name="product-type"
                      value="monthly"
                    />
                    <span class="radio-title">普通会员</span>
                    <span class="radio-desc">20 次/月，按月购买</span>
                  </label>
                </div>
              </div>

              <!-- Months (monthly only) -->
              <div v-if="form.product_type === 'monthly'" class="form-group">
                <label class="form-label" for="grant-months"
                  >月数 <span class="required">*</span></label
                >
                <select id="grant-months" v-model.number="form.months" class="form-input">
                  <option v-for="n in 12" :key="n" :value="n">{{ n }} 个月</option>
                </select>
              </div>

              <!-- Reason -->
              <div class="form-group">
                <label class="form-label" for="grant-reason"
                  >开通原因 <span class="required">*</span></label
                >
                <textarea
                  id="grant-reason"
                  v-model="form.reason"
                  class="form-input"
                  rows="3"
                  maxlength="200"
                  placeholder="如：新员工入职 / 季度采购等（供审计）"
                  required
                />
                <div class="field-hint">{{ form.reason.length }} / 200</div>
              </div>

              <div v-if="submitError" class="form-error">{{ submitError }}</div>
            </form>

            <footer class="modal-footer">
              <button type="button" class="btn-cancel" :disabled="submitting" @click="closeModal">
                取消
              </button>
              <button
                type="submit"
                form="grant-form"
                class="btn-primary"
                :disabled="!isFormValid || submitting"
              >
                {{ submitting ? '提交中...' : '确认开通' }}
              </button>
            </footer>
          </div>
        </div>
      </Teleport>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
/**
 * ChildMembershipGrantView — 父账户帮子账户开通会员（credits-system Q2）
 *
 * 访问权限：仅父账户可访问（路由 meta.requiresParent）。
 *
 * ## 页面流程
 *
 * 1. 挂载时拉取 `GET /v1/users/children`
 * 2. 列出所有子账户（表格展示 nickname / username / 当前 tier / 到期时间）
 * 3. 点击"开通会员"打开 modal
 * 4. 表单：产品类型（trial / monthly）+ 月数（monthly 可选 1-12）+ 原因
 * 5. 提交 → `POST /v1/users/children/:child_id/grant-membership`
 * 6. 成功后关闭 modal + toast + 刷新列表
 *
 * 与 CustomersView.vue 的区别：
 *   - CustomersView 走 `/v1/orders` 支付流程（wechat/alipay QR）
 *   - 此视图走 `/v1/users/children/:id/grant-membership`（免费开通 + 审计）
 *
 * Refs: Q2 gap-fill spec, src/api/parent.ts
 */
import { computed, onMounted, reactive, ref } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import {
  listChildren,
  grantChildMembership,
  type ChildUser,
  type GrantMembershipReq
} from '@/api/parent'
import { useNotificationsStore } from '@/stores/notifications'

const notifications = useNotificationsStore()

const children = ref<ChildUser[]>([])
const loading = ref(false)
const error = ref('')

const showModal = ref(false)
const target = ref<ChildUser | null>(null)
const submitting = ref(false)
const submitError = ref('')

const form = reactive<GrantMembershipReq>({
  product_type: 'trial',
  months: 1,
  reason: ''
})

const targetName = computed(() => target.value?.nickname || target.value?.username || '子账户')

const isFormValid = computed(() => {
  if (!form.reason.trim()) return false
  if (form.product_type === 'monthly') {
    const m = form.months ?? 0
    if (m < 1 || m > 12) return false
  }
  return true
})

async function loadChildren(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await listChildren()
    children.value = Array.isArray(res.data) ? res.data : []
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载子账户失败'
  } finally {
    loading.value = false
  }
}

function openGrantModal(child: ChildUser): void {
  target.value = child
  form.product_type = 'trial'
  form.months = 1
  form.reason = ''
  submitError.value = ''
  showModal.value = true
}

function closeModal(): void {
  if (submitting.value) return
  showModal.value = false
  target.value = null
}

async function submit(): Promise<void> {
  if (!target.value || !isFormValid.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const payload: GrantMembershipReq = {
      product_type: form.product_type,
      reason: form.reason.trim()
    }
    if (form.product_type === 'monthly') {
      payload.months = form.months
    }
    await grantChildMembership(target.value.id, payload)
    notifications.success(`已为 ${targetName.value} 开通${productLabel.value}`)
    showModal.value = false
    target.value = null
    await loadChildren()
  } catch (e: unknown) {
    submitError.value = e instanceof Error ? e.message : '开通失败'
  } finally {
    submitting.value = false
  }
}

const productLabel = computed(() => {
  if (form.product_type === 'trial') return '体验会员（3 天）'
  return `${form.months ?? 1} 个月会员`
})

function tierLabel(tier: string | undefined): string {
  switch (tier) {
    case 'trial':
      return '体验会员'
    case 'standard':
      return '普通会员'
    case 'premium':
      return '高级会员'
    default:
      return 'Free'
  }
}

function formatExpiry(iso: string | undefined): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return iso
  }
}

onMounted(() => {
  loadChildren()
})
</script>

<style scoped>
.grant-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 20px 80px;
}

/* ===== Hero ===== */
.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.hero-title {
  font-size: 30px;
  font-weight: 700;
  color: hsl(155, 30%, 15%);
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}

.hero-subtitle {
  font-size: 14px;
  color: hsl(158, 20%, 45%);
  margin: 0;
}

/* ===== State cards ===== */
.state-card {
  background: #fff;
  border: 1px solid hsl(160, 20%, 88%);
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
}

.state-card.error .state-text {
  color: hsl(0, 60%, 45%);
}

.state-text {
  font-size: 15px;
  color: hsl(158, 20%, 45%);
  margin: 0;
}

.state-hint {
  font-size: 13px;
  color: hsl(160, 12%, 55%);
  margin: 8px 0 0;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2.5px solid hsl(160, 20%, 88%);
  border-top-color: hsl(160, 60%, 40%);
  border-radius: 50%;
  margin: 0 auto 12px;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.retry-btn {
  margin-top: 12px;
  padding: 8px 16px;
  background: hsl(160, 60%, 40%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

/* ===== Table ===== */
.table-wrap {
  background: #fff;
  border: 1px solid hsl(160, 20%, 88%);
  border-radius: 12px;
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table thead {
  background: hsl(160, 25%, 96%);
}

.data-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(160, 18%, 40%);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.data-table td {
  padding: 14px 16px;
  font-size: 14px;
  color: hsl(160, 18%, 24%);
  border-top: 1px solid hsl(160, 20%, 94%);
}

.col-action {
  width: 120px;
  text-align: right;
}

.child-name {
  font-weight: 600;
  color: hsl(155, 30%, 15%);
}

.child-meta {
  font-size: 12px;
  color: hsl(160, 12%, 55%);
  margin-top: 2px;
}

/* tier badges */
.tier-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 500;
}

.tier-free {
  background: hsl(220, 15%, 93%);
  color: hsl(220, 10%, 40%);
}

.tier-trial {
  background: hsl(45, 85%, 92%);
  color: hsl(40, 70%, 35%);
}

.tier-standard {
  background: hsl(160, 40%, 92%);
  color: hsl(160, 50%, 30%);
}

.tier-premium {
  background: hsl(270, 45%, 93%);
  color: hsl(270, 40%, 40%);
}

.grant-btn {
  padding: 7px 14px;
  background: hsl(160, 60%, 40%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.grant-btn:hover {
  background: hsl(160, 60%, 34%);
}

/* ===== Modal ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(24, 32, 36, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-dialog {
  width: 480px;
  max-width: calc(100vw - 32px);
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid hsl(160, 20%, 94%);
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
  color: hsl(155, 30%, 15%);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: hsl(160, 12%, 55%);
  cursor: pointer;
  padding: 4px 8px;
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: hsl(160, 18%, 30%);
}

.required {
  color: hsl(0, 70%, 50%);
}

.radio-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.radio-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border: 1px solid hsl(160, 20%, 88%);
  border-radius: 10px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.radio-option.active {
  border-color: hsl(160, 60%, 40%);
  background: hsl(160, 45%, 97%);
}

.radio-option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.radio-title {
  font-weight: 600;
  font-size: 14px;
  color: hsl(155, 30%, 15%);
}

.radio-desc {
  font-size: 12px;
  color: hsl(160, 12%, 50%);
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid hsl(160, 20%, 85%);
  border-radius: 8px;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: hsl(160, 60%, 40%);
  box-shadow: 0 0 0 3px hsla(160, 60%, 40%, 0.12);
}

textarea.form-input {
  resize: vertical;
  min-height: 76px;
}

.field-hint {
  align-self: flex-end;
  font-size: 11px;
  color: hsl(160, 12%, 55%);
}

.form-error {
  padding: 10px 12px;
  background: hsl(0, 80%, 97%);
  border: 1px solid hsl(0, 70%, 88%);
  border-radius: 8px;
  font-size: 13px;
  color: hsl(0, 60%, 42%);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid hsl(160, 20%, 94%);
  background: hsl(160, 25%, 98%);
}

.btn-cancel {
  padding: 8px 16px;
  background: #fff;
  color: hsl(160, 18%, 35%);
  border: 1px solid hsl(160, 20%, 85%);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  padding: 8px 18px;
  background: hsl(160, 60%, 40%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  background: hsl(160, 60%, 34%);
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
