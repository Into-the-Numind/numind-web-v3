<template>
  <div class="briefing-list">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button
          class="generate-btn"
          :disabled="generating"
          @click="handleGenerate"
        >
          <span v-if="generating" class="btn-spinner"></span>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          手动生成
        </button>
      </div>
      <div class="toolbar-right">
        <select v-model="filterType" class="filter-select" @change="loadBriefings(1)">
          <option value="">全部类型</option>
          <option value="daily">日报</option>
          <option value="weekly">周报</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="store.loading && store.briefings.length === 0" class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">加载简报列表...</div>
    </div>

    <!-- Empty state -->
    <div v-else-if="store.briefings.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </div>
      <h3 class="empty-title">暂无简报</h3>
      <p class="empty-desc">系统将按照配置自动生成简报，或点击上方按钮手动生成</p>
    </div>

    <!-- Table -->
    <div v-else class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-type">类型</th>
            <th class="col-title">标题</th>
            <th class="col-period">时间段</th>
            <th class="col-notes">笔记数</th>
            <th class="col-feishu">飞书推送</th>
            <th class="col-created">创建时间</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="briefing in store.briefings"
            :key="briefing.id"
            class="clickable-row"
            @click="openDetail(briefing)"
          >
            <td class="col-type">
              <span class="type-badge" :class="briefing.type">
                {{ briefing.type === 'weekly' ? '周报' : '日报' }}
              </span>
            </td>
            <td class="col-title">
              <span class="briefing-title">{{ briefing.title || '无标题' }}</span>
            </td>
            <td class="col-period">
              <span class="period-text">
                {{ formatDate(briefing.period_start) }} ~ {{ formatDate(briefing.period_end) }}
              </span>
            </td>
            <td class="col-notes">{{ briefing.note_count }}</td>
            <td class="col-feishu">
              <span class="feishu-badge" :class="briefing.feishu_sent ? 'sent' : 'unsent'">
                {{ briefing.feishu_sent ? '已推送' : '未推送' }}
              </span>
            </td>
            <td class="col-created">{{ formatDateTime(briefing.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="store.briefingsTotal > pageSize" class="pagination">
      <button class="page-btn" :disabled="currentPage <= 1" @click="loadBriefings(currentPage - 1)">上一页</button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <button class="page-btn" :disabled="currentPage >= totalPages" @click="loadBriefings(currentPage + 1)">下一页</button>
    </div>

    <!-- Detail modal -->
    <BriefingDetail
      :briefing="selectedBriefing"
      :visible="showDetail"
      @close="showDetail = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import type { MonitorBriefing } from '@/api/monitor'
import { generateBriefing } from '@/api/monitor'
import BriefingDetail from './BriefingDetail.vue'

const store = useMonitorStore()

// Pagination
const currentPage = ref(1)
const pageSize = 20
const totalPages = computed(() => Math.ceil(store.briefingsTotal / pageSize))

// Filter
const filterType = ref('')

// Generate
const generating = ref(false)

// Detail
const selectedBriefing = ref<MonitorBriefing | null>(null)
const showDetail = ref(false)

async function loadBriefings(page: number) {
  currentPage.value = page
  await store.fetchBriefings({
    offset: (page - 1) * pageSize,
    limit: pageSize,
    type: filterType.value || undefined,
  })
}

function openDetail(briefing: MonitorBriefing) {
  selectedBriefing.value = briefing
  showDetail.value = true
}

async function handleGenerate() {
  if (generating.value) return
  generating.value = true
  try {
    await generateBriefing({ type: 'daily' })
    await loadBriefings(1)
    store.fetchStats()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    const msg = err?.response?.data?.message || '生成失败'
    alert(msg)
  } finally {
    generating.value = false
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  loadBriefings(1)
})
</script>

<style scoped>
.briefing-list {
  width: 100%;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-lg);
  gap: var(--space-sm);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.generate-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  cursor: pointer;
  outline: none;
}

.filter-select:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

/* Loading */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-4xl) 0;
  gap: var(--space-lg);
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-light);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* Empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
  gap: var(--space-sm);
  text-align: center;
}

.empty-icon {
  color: var(--text-muted);
  opacity: 0.4;
  margin-bottom: var(--space-sm);
}

.empty-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.empty-desc {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0;
  max-width: 360px;
}

/* Table */
.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.data-table th {
  text-align: left;
  padding: var(--space-sm) var(--space-md);
  font-weight: 500;
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.data-table td {
  padding: var(--space-md);
  border-bottom: 1px solid var(--border-light);
  color: var(--text);
  vertical-align: middle;
}

.clickable-row {
  cursor: pointer;
  transition: background var(--transition-fast);
}

.clickable-row:hover {
  background: var(--surface-hover);
}

/* Type badge */
.type-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
}

.type-badge.daily {
  background: hsl(210, 60%, 93%);
  color: hsl(210, 60%, 45%);
}

.type-badge.weekly {
  background: hsl(280, 60%, 93%);
  color: hsl(280, 60%, 45%);
}

/* Title */
.briefing-title {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 300px;
}

/* Period */
.period-text {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

/* Feishu badge */
.feishu-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
}

.feishu-badge.sent {
  background: hsl(160, 60%, 93%);
  color: hsl(160, 72%, 34%);
}

.feishu-badge.unsent {
  background: hsl(0, 0%, 93%);
  color: hsl(0, 0%, 50%);
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  margin-top: var(--space-xl);
  padding-top: var(--space-lg);
}

.page-btn {
  padding: 6px 16px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.page-btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* Spinner */
.btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Responsive */
@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .col-period,
  .col-feishu {
    display: none;
  }
}
</style>
