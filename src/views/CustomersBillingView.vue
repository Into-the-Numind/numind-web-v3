<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'
import {
  getParentBillingReport,
  type ParentBillingReport,
  type ParentBillingDetail
} from '@/api/parent'
import { buildCsv, downloadCsv } from '@/utils/csv'

const router = useRouter()

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const maxMonth = currentMonth()
const curYear = parseInt(maxMonth.split('-')[0], 10)
const curMonthNum = parseInt(maxMonth.split('-')[1], 10)

const month = ref(currentMonth())
const report = ref<ParentBillingReport | null>(null)
const loading = ref(false)
const error = ref('')

// ── filter (#1) + search (#2) + sort (#3) ─────────────────────────────
type TypeFilter = 'all' | 'monthly' | 'weekly' | 'trial'
const typeFilter = ref<TypeFilter>('all')
const searchQuery = ref('')

type SortKey = 'child' | 'type' | 'months' | 'amount' | 'granted'
const sortKey = ref<SortKey | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}
function durationLabel(d: ParentBillingDetail): string {
  if (d.product_type === 'weekly') return '7 天'
  return d.product_type === 'trial' ? '3 天' : `${d.months} 个月`
}
function productLabel(t: string): string {
  return t === 'trial' ? '体验包' : t === 'weekly' ? '周度会员' : t === 'monthly' ? '月订阅' : t
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

function sortValueFor(d: ParentBillingDetail, key: SortKey): number | string {
  switch (key) {
    case 'child':
      return (d.child_username || '').toLowerCase()
    case 'type':
      return d.product_type === 'trial' ? 0 : d.product_type === 'weekly' ? 1 : 2
    case 'months':
      return d.months
    case 'amount':
      return d.amount_cents
    case 'granted': {
      const t = Date.parse(d.granted_at)
      return Number.isFinite(t) ? t : 0
    }
  }
}

// filter → search → sort，作用在已取回的 details 上（纯客户端）
const displayDetails = computed<ParentBillingDetail[]>(() => {
  if (!report.value) return []
  let list = report.value.details
  if (typeFilter.value !== 'all') {
    list = list.filter((d) => d.product_type === typeFilter.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (d) =>
        String(d.child_user_id).toLowerCase().includes(q) ||
        (d.child_username || '').toLowerCase().includes(q) ||
        (d.child_nickname || '').toLowerCase().includes(q)
    )
  }
  if (sortKey.value) {
    const key = sortKey.value
    const dir = sortDir.value
    list = [...list].sort((a, b) => {
      const av = sortValueFor(a, key)
      const bv = sortValueFor(b, key)
      if (av === bv) return 0
      const cmp = av < bv ? -1 : 1
      return dir === 'asc' ? cmp : -cmp
    })
  }
  return list
})
const displayTotalCents = computed(() =>
  displayDetails.value.reduce((s, d) => s + d.amount_cents, 0)
)
const isFiltered = computed(() => typeFilter.value !== 'all' || searchQuery.value.trim() !== '')

// ── CSV 导出（#7）─────────────────────────────────────────────────────
// WYSIWYG：导出 displayDetails（已应用类型筛选 / 搜索 / 排序的可见行集，与
// 页脚「当前显示 N 笔」一致），而非整月 report.details。价格导出为「元」数值
// （非 ¥ 文案）便于在 Excel 中直接求和；中文经 utils/csv 的 UTF-8 BOM 保证不乱码。
function exportCsv() {
  if (!report.value || displayDetails.value.length === 0) return
  const headers = ['账号', '账号ID', '昵称', '会员类型', '时长', '价格(元)', '开通时间']
  const rows = displayDetails.value.map((d) => [
    d.child_username,
    d.child_user_id,
    d.child_nickname,
    productLabel(d.product_type),
    durationLabel(d),
    (d.amount_cents / 100).toFixed(2),
    formatDate(d.granted_at)
  ])
  downloadCsv(`费用对账_${report.value.month}.csv`, buildCsv(headers, rows))
}

function toggleSort(key: SortKey) {
  if (sortKey.value !== key) {
    sortKey.value = key
    sortDir.value = 'asc'
  } else if (sortDir.value === 'asc') {
    sortDir.value = 'desc'
  } else {
    sortKey.value = null
  }
}
function sortClassFor(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? 'sort-asc' : 'sort-desc'
}

// ── custom month picker (#6) ──────────────────────────────────────────
const showMonthPanel = ref(false)
const panelYear = ref(curYear)
const monthPickerRef = ref<HTMLElement | null>(null)

const monthLabel = computed(() => {
  const [y, m] = month.value.split('-')
  return `${y} 年 ${parseInt(m, 10)} 月`
})
const selectedYear = computed(() => parseInt(month.value.split('-')[0], 10))
const selectedMonthNum = computed(() => parseInt(month.value.split('-')[1], 10))

function toggleMonthPanel() {
  if (!showMonthPanel.value) panelYear.value = selectedYear.value
  showMonthPanel.value = !showMonthPanel.value
}
function isMonthDisabled(m: number): boolean {
  return panelYear.value > curYear || (panelYear.value === curYear && m > curMonthNum)
}
function selectMonth(m: number) {
  if (isMonthDisabled(m)) return
  month.value = `${panelYear.value}-${String(m).padStart(2, '0')}`
  showMonthPanel.value = false
  load()
}
function prevYear() {
  panelYear.value -= 1
}
function nextYear() {
  if (panelYear.value < curYear) panelYear.value += 1
}
function onDocMouseDown(e: MouseEvent) {
  if (
    showMonthPanel.value &&
    monthPickerRef.value &&
    !monthPickerRef.value.contains(e.target as Node)
  ) {
    showMonthPanel.value = false
  }
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

onMounted(() => {
  load()
  document.addEventListener('mousedown', onDocMouseDown)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))
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
            返回
          </button>
          <h1 class="page-title">费用对账</h1>
        </div>

        <!-- 自研月份选择器（#6）：替代原生 input[type=month]，套用页面设计 token -->
        <div ref="monthPickerRef" class="month-picker">
          <span class="month-label">月份</span>
          <button class="month-trigger" :class="{ open: showMonthPanel }" @click="toggleMonthPanel">
            <span>{{ monthLabel }}</span>
            <svg
              class="month-caret"
              viewBox="0 0 12 12"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m3 4.5 3 3 3-3" />
            </svg>
          </button>
          <Transition name="month-pop">
            <div v-if="showMonthPanel" class="month-panel">
              <div class="month-panel-head">
                <button class="year-nav" type="button" @click="prevYear" aria-label="上一年">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <span class="year-label">{{ panelYear }} 年</span>
                <button
                  class="year-nav"
                  type="button"
                  :disabled="panelYear >= curYear"
                  @click="nextYear"
                  aria-label="下一年"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
              <div class="month-grid">
                <button
                  v-for="m in 12"
                  :key="m"
                  type="button"
                  class="month-cell"
                  :class="{ active: panelYear === selectedYear && m === selectedMonthNum }"
                  :disabled="isMonthDisabled(m)"
                  @click="selectMonth(m)"
                >
                  {{ m }} 月
                </button>
              </div>
            </div>
          </Transition>
        </div>
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

      <!-- Empty: 该月完全无开通 -->
      <div v-else-if="report && report.details.length === 0" class="state-empty">
        <svg viewBox="0 0 48 48" fill="none" width="48" height="48" class="state-icon">
          <rect x="8" y="6" width="32" height="36" rx="4" stroke="currentColor" stroke-width="2" />
          <path
            d="M16 16h16M16 22h12M16 28h8"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <p class="state-title">本月（{{ report.month }}）暂无开通记录</p>
        <p class="state-sub">本月合计 <strong>¥0.00</strong></p>
      </div>

      <!-- Success -->
      <template v-else-if="report">
        <!-- Summary bar：全月权威合计（不随筛选变化）-->
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

        <!-- Toolbar：类型筛选(#1) + 搜索(#2) -->
        <div class="billing-toolbar">
          <div class="type-filter" role="group" aria-label="会员类型筛选">
            <button :class="{ active: typeFilter === 'all' }" @click="typeFilter = 'all'">
              全部
            </button>
            <button :class="{ active: typeFilter === 'monthly' }" @click="typeFilter = 'monthly'">
              月订阅
            </button>
            <button :class="{ active: typeFilter === 'weekly' }" @click="typeFilter = 'weekly'">
              周度会员
            </button>
            <button :class="{ active: typeFilter === 'trial' }" @click="typeFilter = 'trial'">
              体验包
            </button>
          </div>
          <div class="toolbar-right">
            <div class="search-box">
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="search-icon"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                v-model="searchQuery"
                class="search-input"
                type="text"
                placeholder="搜索 ID / 昵称"
              />
            </div>
            <!-- 导出 CSV(#7)：导出当前可见行集（displayDetails），无可导行时禁用 -->
            <button
              class="export-btn"
              type="button"
              :disabled="displayDetails.length === 0"
              :title="
                displayDetails.length === 0
                  ? '当前没有可导出的记录'
                  : `导出当前 ${displayDetails.length} 条记录`
              "
              @click="exportCsv"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>导出</span>
            </button>
          </div>
        </div>

        <!-- Table -->
        <div class="table-container">
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th
                    class="th-sortable col-user-th"
                    :class="sortClassFor('child')"
                    @click="toggleSort('child')"
                  >
                    <span class="th-label">账号</span>
                    <span class="sort-indicator" aria-hidden="true">
                      <svg viewBox="0 0 8 12" width="8" height="12">
                        <path class="sort-arrow-up" d="M4 0 L8 5 L0 5 Z" fill="currentColor" />
                        <path class="sort-arrow-down" d="M0 7 L8 7 L4 12 Z" fill="currentColor" />
                      </svg>
                    </span>
                  </th>
                  <th>
                    <span class="th-label">昵称</span>
                  </th>
                  <th class="th-sortable" :class="sortClassFor('type')" @click="toggleSort('type')">
                    <span class="th-label">会员类型</span>
                    <span class="sort-indicator" aria-hidden="true">
                      <svg viewBox="0 0 8 12" width="8" height="12">
                        <path class="sort-arrow-up" d="M4 0 L8 5 L0 5 Z" fill="currentColor" />
                        <path class="sort-arrow-down" d="M0 7 L8 7 L4 12 Z" fill="currentColor" />
                      </svg>
                    </span>
                  </th>
                  <th
                    class="th-sortable"
                    :class="sortClassFor('months')"
                    @click="toggleSort('months')"
                  >
                    <span class="th-label">时长</span>
                    <span class="sort-indicator" aria-hidden="true">
                      <svg viewBox="0 0 8 12" width="8" height="12">
                        <path class="sort-arrow-up" d="M4 0 L8 5 L0 5 Z" fill="currentColor" />
                        <path class="sort-arrow-down" d="M0 7 L8 7 L4 12 Z" fill="currentColor" />
                      </svg>
                    </span>
                  </th>
                  <th
                    class="th-sortable"
                    :class="sortClassFor('amount')"
                    @click="toggleSort('amount')"
                  >
                    <span class="th-label">价格</span>
                    <span class="sort-indicator" aria-hidden="true">
                      <svg viewBox="0 0 8 12" width="8" height="12">
                        <path class="sort-arrow-up" d="M4 0 L8 5 L0 5 Z" fill="currentColor" />
                        <path class="sort-arrow-down" d="M0 7 L8 7 L4 12 Z" fill="currentColor" />
                      </svg>
                    </span>
                  </th>
                  <th
                    class="th-sortable"
                    :class="sortClassFor('granted')"
                    @click="toggleSort('granted')"
                  >
                    <span class="th-label">开通时间</span>
                    <span class="sort-indicator" aria-hidden="true">
                      <svg viewBox="0 0 8 12" width="8" height="12">
                        <path class="sort-arrow-up" d="M4 0 L8 5 L0 5 Z" fill="currentColor" />
                        <path class="sort-arrow-down" d="M0 7 L8 7 L4 12 Z" fill="currentColor" />
                      </svg>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(d, idx) in displayDetails"
                  :key="`${d.child_user_id}-${d.granted_at}-${idx}`"
                >
                  <td class="col-user">
                    <div class="user-name">{{ d.child_username }}</div>
                    <div class="user-meta">ID: {{ d.child_user_id }}</div>
                  </td>
                  <td>
                    <span class="cell-secondary">{{ d.child_nickname || '—' }}</span>
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
                <tr v-if="displayDetails.length === 0">
                  <td colspan="6" class="no-match">没有符合筛选 / 搜索条件的记录</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="4">
                    <span class="total-label"
                      >{{ isFiltered ? '当前显示' : '本月合计' }}（{{
                        displayDetails.length
                      }}
                      笔）</span
                    >
                  </td>
                  <td colspan="2">
                    <span class="total-amount">{{ yuan(displayTotalCents) }}</span>
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
  margin: 0;
}

/* ===== Month Picker (#6 自研) ===== */
.month-picker {
  position: relative;
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

.month-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  min-width: 132px;
  height: 36px;
  padding: 0 var(--space-md);
  border-radius: var(--radius-sm);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  font-size: 13px;
  font-weight: 500;
  color: hsl(155, 25%, 18%);
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3);
}

.month-trigger:hover,
.month-trigger.open {
  border-color: hsl(158, 40%, 82%);
}

.month-caret {
  color: hsl(155, 15%, 55%);
  transition: transform var(--transition-base);
}

.month-trigger.open .month-caret {
  transform: rotate(180deg);
}

.month-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  width: 240px;
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  border: 1px solid hsla(155, 30%, 90%, 0.9);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.98), hsla(150, 12%, 98%, 0.96));
  box-shadow:
    0 12px 32px hsl(150 15% 0% / 0.12),
    0 0 0 1px hsl(155 20% 92% / 0.4);
}

.month-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.year-label {
  font-size: 14px;
  font-weight: 700;
  color: hsl(155, 25%, 18%);
}

.year-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: hsl(155, 20%, 40%);
  cursor: pointer;
  transition: all var(--transition-base);
}

.year-nav:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
}

.year-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-xs);
}

.month-cell {
  padding: 8px 0;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  font-size: 13px;
  color: hsl(155, 20%, 30%);
  cursor: pointer;
  transition: all var(--transition-base);
}

.month-cell:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
}

.month-cell.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.month-cell:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.month-pop-enter-active,
.month-pop-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}

.month-pop-enter-from,
.month-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ===== Summary Bar ===== */
.summary-bar {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 16px;
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

/* ===== Toolbar (#1 filter + #2 search) ===== */
.billing-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.type-filter {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-md);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: hsla(150, 15%, 98%, 0.7);
  gap: 2px;
}

.type-filter button {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: hsl(155, 15%, 45%);
  cursor: pointer;
  transition: all var(--transition-base);
}

.type-filter button:hover {
  color: var(--accent);
}

.type-filter button.active {
  background: #fff;
  /* 选中态白色框圆角对齐外层容器（--radius-md），而非按钮基类的 --radius-sm */
  border-radius: var(--radius-md);
  color: hsl(155, 30%, 20%);
  font-weight: 600;
  box-shadow: 0 1px 4px hsl(150 15% 0% / 0.08);
}

.search-box {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 11px;
  color: hsl(155, 15%, 55%);
  pointer-events: none;
}

.search-input {
  height: 36px;
  width: 220px;
  padding: 0 12px 0 32px;
  border-radius: var(--radius-sm);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  font-size: 13px;
  color: hsl(155, 25%, 18%);
  outline: none;
  transition: all var(--transition-base);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3);
}

.search-input:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158 50% 50% / 0.12);
}

/* ===== Export button (#7) ===== */
.toolbar-right {
  display: inline-flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.export-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  font-size: 13px;
  font-weight: 500;
  color: hsl(155, 20%, 35%);
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--transition-base);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3);
}

.export-btn svg {
  color: hsl(155, 15%, 50%);
  transition: color var(--transition-base);
}

.export-btn:hover:not(:disabled) {
  border-color: hsl(158, 40%, 82%);
  color: hsl(155, 25%, 25%);
  transform: translateY(-1px);
}

.export-btn:hover:not(:disabled) svg {
  color: var(--accent);
}

.export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* Sortable header (照搬客户管理页) */
.th-sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s;
}
.th-sortable .th-label {
  margin-right: 4px;
}
.th-sortable:hover {
  color: var(--accent);
}
.sort-indicator {
  display: inline-flex;
  vertical-align: middle;
  color: hsl(155, 15%, 70%);
  transition: color 0.15s;
}
.sort-indicator svg {
  display: block;
}
.sort-arrow-up,
.sort-arrow-down {
  opacity: 0.35;
  transition: opacity 0.15s;
}
.th-sortable.sort-asc,
.th-sortable.sort-desc {
  color: var(--accent);
}
.th-sortable.sort-asc .sort-indicator,
.th-sortable.sort-desc .sort-indicator {
  color: var(--accent);
}
.th-sortable.sort-asc .sort-arrow-up {
  opacity: 1;
}
.th-sortable.sort-desc .sort-arrow-down {
  opacity: 1;
}

/* Account cell — centered to match the sibling columns */
.data-table td.col-user {
  text-align: center;
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

.no-match {
  padding: 36px 16px !important;
  color: hsl(155, 12%, 55%);
  font-size: 14px;
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

.product-badge.weekly {
  background: hsl(188, 44%, 93%);
  color: hsl(188, 58%, 32%);
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
