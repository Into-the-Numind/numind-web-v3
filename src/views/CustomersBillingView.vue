<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'
import { getParentBillingReport, type ParentBillingReport } from '@/api/parent'

const router = useRouter()

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const maxMonth = currentMonth()

const month = ref(currentMonth())
const report = ref<ParentBillingReport | null>(null)
const loading = ref(false)
const error = ref('')

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}
function durationLabel(d: ParentBillingReport['details'][number]): string {
  return d.product_type === 'trial' ? '3 天' : `${d.months} 个月`
}
function productLabel(t: string): string {
  // trial/monthly 是当前唯一两种；未知类型如实回显而非误标为「月订阅」。
  return t === 'trial' ? '体验包' : t === 'monthly' ? '月订阅' : t
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    // request.ts 拦截器在 code===0/200 时 return res as any（ApiResponse 整体）
    // 所以 getParentBillingReport 返回值即是 ApiResponse<ParentBillingReport>，取 .data 拿到 ParentBillingReport。
    const res = await getParentBillingReport(month.value)
    report.value = res.data
  } catch (e: any) {
    // 拦截器各路径均 reject(new Error(friendlyErrorMessage(...)))，e.message 已是 stack-safe 友好文案。
    error.value = e?.message || '加载失败，请重试'
    report.value = null
  } finally {
    loading.value = false
  }
}

function onMonthChange() {
  load()
}

onMounted(load)
</script>

<template>
  <MainLayout>
    <div class="billing-page">
      <!-- Header -->
      <div class="billing-header">
        <div class="header-left">
          <button class="back-btn" @click="router.push('/customers')">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            返回客户管理
          </button>
          <h1 class="page-title">费用对账</h1>
          <p class="page-subtitle">查看名下子账户的会员开通明细与月度汇总</p>
        </div>
        <label class="month-picker">
          <span class="month-label">月份</span>
          <input
            type="month"
            v-model="month"
            :max="maxMonth"
            class="month-input"
            @change="onMonthChange"
          />
        </label>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="state-loading">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载中…</div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="state-error">
        <svg
          viewBox="0 0 24 24"
          width="40"
          height="40"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="state-icon"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p class="state-msg">{{ error }}</p>
        <button class="retry-btn" @click="load">重试</button>
      </div>

      <!-- Empty -->
      <div v-else-if="report && report.details.length === 0" class="state-empty">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          width="48"
          height="48"
          class="state-icon"
        >
          <rect
            x="8"
            y="6"
            width="32"
            height="36"
            rx="4"
            stroke="currentColor"
            stroke-width="2"
          />
          <path d="M16 16h16M16 22h12M16 28h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <p class="state-title">本月（{{ report.month }}）暂无开通记录</p>
        <p class="state-sub">本月合计 <strong>¥0.00</strong></p>
      </div>

      <!-- Success -->
      <template v-else-if="report">
        <!-- Summary bar -->
        <div class="summary-bar">
          <div class="summary-item">
            <span class="summary-label">账单月份</span>
            <span class="summary-value">{{ report.month }}</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-item">
            <span class="summary-label">开通笔数</span>
            <span class="summary-value">{{ report.grants_count }}</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-item">
            <span class="summary-label">月度合计</span>
            <span class="summary-value summary-total">{{ yuan(report.total_amount_cents) }}</span>
          </div>
        </div>

        <!-- Table -->
        <div class="table-container">
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>子账号</th>
                  <th>会员类型</th>
                  <th>时长</th>
                  <th>价格</th>
                  <th>开通时间</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(d, idx) in report.details"
                  :key="`${d.child_user_id}-${d.granted_at}-${idx}`"
                >
                  <td class="col-user">
                    <div class="user-name">{{ d.child_username }}</div>
                    <div class="user-meta">ID: {{ d.child_user_id }}</div>
                  </td>
                  <td>
                    <span class="product-badge" :class="d.product_type">
                      {{ productLabel(d.product_type) }}
                    </span>
                  </td>
                  <td>
                    <span class="cell-secondary">{{ durationLabel(d) }}</span>
                  </td>
                  <td>
                    <span class="cell-amount">{{ yuan(d.amount_cents) }}</span>
                  </td>
                  <td>
                    <span class="cell-secondary">{{ formatDate(d.granted_at) }}</span>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="3">
                    <span class="total-label">本月合计（{{ report.grants_count }} 笔）</span>
                  </td>
                  <td colspan="2">
                    <span class="total-amount">{{ yuan(report.total_amount_cents) }}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </template>
    </div>
  </MainLayout>
</template>

<style scoped>
/* ===== Page Layout ===== */
.billing-page {
  max-width: 1100px;
  margin: 0 auto;
  padding-bottom: var(--space-4xl);
}

/* ===== Header ===== */
.billing-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-xl);
  padding: 20px 0 0;
  margin-bottom: 28px;
}

.header-left {
  flex: 1;
  min-width: 0;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 5px 10px 5px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: var(--space-md);
  transition: all var(--transition-base);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3);
}

.back-btn:hover {
  border-color: hsl(158, 40%, 82%);
  color: hsl(155, 25%, 30%);
  transform: translateX(-2px);
}

.page-title {
  font-family: var(--font-sans);
  font-size: 36px;
  font-weight: 700;
  color: hsl(155, 30%, 15%);
  line-height: 1.3;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}

.page-subtitle {
  font-size: 15px;
  color: hsl(158, 20%, 45%);
  margin: 0;
}

/* ===== Month Picker ===== */
.month-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  align-self: flex-end;
  padding-bottom: 4px;
}

.month-label {
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 15%, 50%);
  letter-spacing: 0.04em;
}

.month-input {
  height: 36px;
  padding: 0 var(--space-md);
  border-radius: var(--radius-sm);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  font-size: 13px;
  color: hsl(155, 25%, 18%);
  outline: none;
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3);
}

.month-input:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158 50% 50% / 0.12);
}

/* ===== Summary Bar ===== */
.summary-bar {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 20px;
  padding: 16px 24px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: var(--radius-lg);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
}

.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.summary-divider {
  width: 1px;
  height: 32px;
  background: hsl(155, 20%, 90%);
}

.summary-label {
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 15%, 50%);
  letter-spacing: 0.04em;
}

.summary-value {
  font-size: 18px;
  font-weight: 700;
  color: hsl(155, 25%, 18%);
}

.summary-total {
  color: var(--accent);
}

/* ===== Table ===== */
.table-container {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: var(--radius-xl);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  overflow: hidden;
}

.table-scroll {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: center;
  padding: 14px 16px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 15%, 50%);
  letter-spacing: 0.04em;
  border-bottom: 1px solid hsl(155, 20%, 93%);
  white-space: nowrap;
  background: hsla(150, 15%, 98%, 0.5);
}

.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid hsl(155, 20%, 95%);
  color: hsl(155, 15%, 25%);
  vertical-align: middle;
  text-align: center;
}

.data-table tbody tr {
  transition: background var(--transition-fast);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr:hover td {
  background: hsl(155, 20%, 98%);
}

.data-table tfoot td {
  border-top: 1px solid hsl(155, 20%, 90%);
  border-bottom: none;
  background: hsla(150, 15%, 98%, 0.6);
}

/* User cell — higher specificity than `.data-table td` removes need for !important */
.data-table td.col-user {
  text-align: left;
}

.user-name {
  font-weight: 500;
  color: hsl(155, 25%, 18%);
}

.user-meta {
  font-size: 12px;
  color: hsl(155, 15%, 55%);
  margin-top: 2px;
}

/* Product badge */
.product-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.product-badge.trial {
  background: hsl(217, 71%, 94%);
  color: hsl(217, 60%, 42%);
}

.product-badge.monthly {
  background: var(--accent-soft);
  color: hsl(158, 64%, 32%);
}

/* Cell styles */
.cell-secondary {
  color: hsl(155, 15%, 45%);
  font-size: 13px;
}

.cell-amount {
  font-weight: 600;
  color: hsl(155, 25%, 18%);
  font-variant-numeric: tabular-nums;
}

/* Total row */
.total-row td {
  padding: 16px;
}

.total-label {
  font-size: 13px;
  font-weight: 600;
  color: hsl(155, 15%, 40%);
}

.total-amount {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

/* ===== State screens ===== */
.state-loading,
.state-error,
.state-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-4xl) var(--space-xl);
  text-align: center;
}

.state-icon {
  color: hsl(155, 15%, 70%);
  flex-shrink: 0;
}

.state-msg {
  font-size: 15px;
  color: hsl(155, 15%, 45%);
  margin: 0;
}

.state-title {
  font-size: 16px;
  font-weight: 600;
  color: hsl(155, 20%, 35%);
  margin: 0;
}

.state-sub {
  font-size: 14px;
  color: hsl(155, 15%, 55%);
  margin: 0;
}

/* Loading spinner */
.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid hsl(155, 20%, 90%);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

.loading-text {
  font-size: 14px;
  color: hsl(155, 15%, 55%);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.retry-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3);
}

.retry-btn:hover {
  border-color: hsl(158, 40%, 82%);
  color: hsl(155, 25%, 30%);
  transform: translateY(-1px);
}
</style>
