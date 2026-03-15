<template>
  <MainLayout>
    <div class="history-page">
      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <div class="loading-text">正在获取任务记录...</div>
      </div>

      <template v-else>
        <!-- Hero 区域 -->
        <div class="hero-section">
          <div class="hero-content">
            <h1 class="hero-title">运行记录</h1>
            <p class="hero-subtitle">查看和管理所有 SOP 任务的执行状态</p>
          </div>
          <button
            v-if="records.length > 0"
            class="manage-btn"
            :class="{ active: manageMode }"
            @click="toggleManageMode"
          >
            <svg v-if="!manageMode" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            {{ manageMode ? '完成' : '管理' }}
          </button>
        </div>

        <!-- 筛选栏 -->
        <div v-if="records.length > 0" class="filter-bar">
          <button
            class="filter-btn"
            :class="{ active: activeFilter === 'all' }"
            @click="activeFilter = 'all'"
          >
            全部
            <span class="filter-count">{{ records.length }}</span>
          </button>
          <button
            class="filter-btn"
            :class="{ active: activeFilter === 'running' }"
            @click="activeFilter = 'running'"
          >
            <span class="filter-dot running"></span>
            进行中
            <span class="filter-count">{{ runningCount }}</span>
          </button>
          <button
            class="filter-btn"
            :class="{ active: activeFilter === 'completed' }"
            @click="activeFilter = 'completed'"
          >
            <span class="filter-dot completed"></span>
            已完成
            <span class="filter-count">{{ completedCount }}</span>
          </button>
          <button
            class="filter-btn"
            :class="{ active: activeFilter === 'failed' }"
            @click="activeFilter = 'failed'"
          >
            <span class="filter-dot failed"></span>
            已失败
            <span class="filter-count">{{ failedCount }}</span>
          </button>
        </div>

        <!-- 空状态 -->
        <div v-if="records.length === 0" class="empty-state">
          <div class="empty-icon-wrapper">
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="empty-icon">
              <rect x="8" y="6" width="32" height="36" rx="4" stroke="currentColor" stroke-width="2" fill="none" />
              <path d="M16 18H32" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <path d="M16 26H28" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <path d="M16 34H24" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </div>
          <div class="empty-title">暂无运行记录</div>
          <div class="empty-desc">开始执行 SOP 后，记录将显示在此处</div>
          <button class="empty-action" @click="$router.push('/')">前往工作台</button>
        </div>

        <!-- 筛选后无结果 -->
        <div v-else-if="filteredRecords.length === 0" class="empty-state">
          <div class="empty-title">没有{{ filterLabel }}的记录</div>
          <div class="empty-desc">切换筛选条件查看其他状态的任务</div>
        </div>

        <!-- 卡片网格 -->
        <div v-else class="card-grid">
          <div
            v-for="record in filteredRecords"
            :key="record.runId"
            class="run-card"
            :class="{ selected: selectedIds.has(record.runId) }"
            @click="handleCardClick(record)"
          >
            <!-- 管理模式复选框 -->
            <label v-if="manageMode" class="checkbox-wrapper" @click.stop>
              <input
                type="checkbox"
                :checked="selectedIds.has(record.runId)"
                @change="toggleSelect(record.runId)"
              />
              <span class="checkbox-mark">
                <svg viewBox="0 0 12 12" fill="none" width="12" height="12">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </label>

            <!-- 卡片主体 -->
            <div class="card-body">
              <div class="card-top">
                <span
                  class="status-indicator"
                  :class="statusClass(record)"
                >
                  <span class="status-dot-inner"></span>
                  {{ statusLabel(record) }}
                </span>
                <!-- 管理模式删除 -->
                <button
                  v-if="manageMode"
                  class="card-delete-btn"
                  title="删除此记录"
                  @click.stop="handleSingleDelete(record.runId)"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>

              <div class="card-title">{{ record.templateName }}</div>

              <div class="card-meta">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                {{ formatTime(record.executedAt) }}
              </div>

              <!-- 进度 -->
              <div class="card-progress">
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    :class="statusClass(record)"
                    :style="{ width: progressPercent(record) + '%' }"
                  ></div>
                </div>
                <span class="progress-label">{{ record.completedCount }}/{{ record.totalNodes }} 步</span>
              </div>
            </div>

          </div>
        </div>
      </template>

      <!-- 管理模式浮动栏 -->
      <Transition name="bar-slide">
        <div v-if="manageMode && records.length > 0" class="manage-bar">
          <span class="manage-count">已选 {{ selectedIds.size }} 项</span>
          <button class="manage-select-all" @click="toggleSelectAll">
            {{ isAllSelected ? '取消全选' : '全选' }}
          </button>
          <button
            class="manage-batch-delete"
            :disabled="selectedIds.size === 0"
            @click="handleBatchDelete"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            批量删除
          </button>
        </div>
      </Transition>
    </div>

    <!-- 确认对话框 -->
    <Teleport to="body">
      <Transition name="overlay-fade">
        <div
          v-if="confirmVisible"
          class="confirm-overlay"
          @click.self="confirmVisible = false"
        >
          <div class="confirm-dialog">
            <div class="confirm-icon-wrapper">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div class="confirm-title">{{ confirmTitle }}</div>
            <div class="confirm-message">{{ confirmMessage }}</div>
            <div class="confirm-buttons">
              <button class="confirm-btn-cancel" @click="confirmVisible = false">取消</button>
              <button class="confirm-btn-ok" @click="onConfirm">确定删除</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Toast -->
    <Teleport to="body">
      <Transition name="toast-fade">
        <div v-if="toastVisible" class="toast" :class="toastType">
          <svg v-if="toastType === 'success'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          {{ toastMessage }}
        </div>
      </Transition>
    </Teleport>
  </MainLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'
import {
  fetchExecutedRuns,
  fetchRunStatus,
  deleteRun,
  batchDeleteRuns,
  type SopRunRecord
} from '@/api/sop'

const router = useRouter()

// --- 数据状态 ---
const loading = ref(true)
const records = ref<SopRunRecord[]>([])
const manageMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const activeFilter = ref<'all' | 'running' | 'completed' | 'failed'>('all')

// --- 确认弹窗 ---
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
let confirmCallback: (() => void) | null = null

const showConfirm = (title: string, message: string, cb: () => void) => {
  confirmTitle.value = title
  confirmMessage.value = message
  confirmCallback = cb
  confirmVisible.value = true
}

const onConfirm = () => {
  confirmVisible.value = false
  confirmCallback?.()
  confirmCallback = null
}

// --- Toast ---
const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<'success' | 'error'>('success')
let toastTimer: ReturnType<typeof setTimeout> | null = null

const showToast = (message: string, type: 'success' | 'error' = 'success') => {
  toastMessage.value = message
  toastType.value = type
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 2000)
}

// --- 计算属性 ---
const sortedRecords = computed(() => {
  return [...records.value].sort((a, b) => {
    const timeA = new Date(a.executedAt || 0).getTime()
    const timeB = new Date(b.executedAt || 0).getTime()
    return timeB - timeA
  })
})

const filteredRecords = computed(() => {
  if (activeFilter.value === 'all') return sortedRecords.value
  return sortedRecords.value.filter((r) => statusClass(r) === activeFilter.value)
})

const filterLabel = computed(() => {
  const labels = { all: '', running: '进行中', completed: '已完成', failed: '已失败' }
  return labels[activeFilter.value]
})

const completedCount = computed(() => records.value.filter((r) => r.status === 'succeeded').length)
const runningCount = computed(() => records.value.filter((r) => r.status !== 'succeeded' && r.status !== 'failed').length)
const failedCount = computed(() => records.value.filter((r) => r.status === 'failed').length)

const isAllSelected = computed(() => {
  const currentIds = filteredRecords.value.map((r) => r.runId)
  return currentIds.length > 0 && currentIds.every((id) => selectedIds.value.has(id))
})

// --- 辅助方法 ---
const isCompleted = (r: SopRunRecord) => r.status === 'succeeded'

const statusClass = (r: SopRunRecord) => {
  if (r.status === 'succeeded') return 'completed'
  if (r.status === 'failed') return 'failed'
  return 'running'
}

const statusLabel = (r: SopRunRecord) => {
  if (r.status === 'succeeded') return '已完成'
  if (r.status === 'failed') return '已失败'
  return '进行中'
}

const progressPercent = (r: SopRunRecord) => {
  if (r.totalNodes <= 0) return 0
  return Math.min(100, Math.round((r.completedCount / r.totalNodes) * 100))
}

const formatTime = (dateStr: string): string => {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const M = String(d.getMonth() + 1).padStart(2, '0')
    const D = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${M}-${D} ${h}:${m}`
  } catch {
    return dateStr
  }
}

// --- 管理模式 ---
const toggleManageMode = () => {
  manageMode.value = !manageMode.value
  if (!manageMode.value) {
    selectedIds.value = new Set()
  }
}

const toggleSelect = (id: string) => {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
}

const toggleSelectAll = () => {
  const currentIds = filteredRecords.value.map((r) => r.runId)
  if (isAllSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(currentIds)
  }
}

// --- 导航 ---
const handleCardClick = (record: SopRunRecord) => {
  if (manageMode.value) return
  router.push({
    path: '/sop/run',
    query: { runId: record.runId, templateId: record.templateId }
  })
}

// --- 删除 ---
const handleSingleDelete = (runId: string) => {
  showConfirm('确认删除', '确定要删除该运行记录吗？此操作不可恢复。', async () => {
    try {
      await deleteRun(runId)
      records.value = records.value.filter((r) => r.runId !== runId)
      selectedIds.value.delete(runId)
      showToast('删除成功')
    } catch (e: any) {
      showToast(e.message || '删除失败', 'error')
    }
  })
}

const handleBatchDelete = () => {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  showConfirm(
    '批量删除',
    `确定要删除选中的 ${ids.length} 条记录吗？此操作不可恢复。`,
    async () => {
      try {
        await batchDeleteRuns(ids)
        const idSet = new Set(ids)
        records.value = records.value.filter((r) => !idSet.has(r.runId))
        selectedIds.value = new Set()
        showToast(`已删除 ${ids.length} 条记录`)
      } catch (e: any) {
        showToast(e.message || '批量删除失败', 'error')
      }
    }
  )
}

// --- 加载数据 ---
const loadRecords = async () => {
  loading.value = true
  try {
    const runs = await fetchExecutedRuns()
    records.value = runs.filter((r) => r.status !== 'pending')

    for (const r of records.value) {
      if (!isCompleted(r)) {
        fetchRunStatus(r.runId).then((status) => {
          if (!status) return
          const target = records.value.find((rec) => rec.runId === r.runId)
          if (target) {
            target.completedCount = status.completedCount
            target.totalNodes = status.totalNodes
          }
        })
      }
    }
  } catch (e: any) {
    showToast(e.message || '加载运行记录失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadRecords()
})
</script>

<style scoped>
.history-page {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 100px;
}

/* ===== Hero Section ===== */
.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
  padding: 20px 0 0;
}

.hero-content {
  flex: 1;
}

.hero-title {
  font-family: var(--font-sans);
  font-size: 36px;
  font-weight: 700;
  color: hsl(155, 30%, 15%);
  line-height: 1.3;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}

.hero-subtitle {
  font-size: 15px;
  color: hsl(158, 20%, 45%);
  margin: 0;
}

.manage-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: var(--radius-md);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  color: hsl(155, 12%, 45%);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3);
}

.manage-btn:hover {
  transform: translateY(-2px);
  border-color: hsl(158, 40%, 82%);
  color: var(--accent);
  box-shadow:
    0 8px 30px hsl(155 20% 0% / 0.10),
    0 0 0 1px hsl(158 40% 80% / 0.5);
}

.manage-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 4px 16px hsl(158 64% 50% / 0.3);
}

/* ===== Filter Bar ===== */
.filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  border-radius: var(--radius-md);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  user-select: none;
}

.filter-btn:hover {
  transform: translateY(-2px);
  border-color: hsl(158, 40%, 82%);
  color: hsl(155, 25%, 30%);
  box-shadow:
    0 8px 30px hsl(155 20% 0% / 0.10),
    0 0 0 1px hsl(158 40% 80% / 0.5);
}

.filter-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 4px 16px hsl(158 64% 50% / 0.3);
}

.filter-btn.active .filter-count {
  background: hsla(0, 0%, 100%, 0.25);
  color: #fff;
}

.filter-btn.active .filter-dot {
  background: #fff;
  box-shadow: none;
}

.filter-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-dot.running {
  background: hsl(45, 90%, 50%);
  box-shadow: 0 0 5px hsl(45 90% 50% / 0.4);
  animation: dot-pulse 2s ease-in-out infinite;
}

.filter-dot.completed {
  background: hsl(158, 64%, 45%);
}

.filter-dot.failed {
  background: hsl(0, 70%, 55%);
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.filter-count {
  padding: 1px 8px;
  border-radius: 6px;
  background: hsl(150, 15%, 93%);
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 15%, 45%);
  min-width: 20px;
  text-align: center;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
}

/* ===== Card Grid ===== */
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.run-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  padding: 22px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
}

.run-card:hover {
  transform: translateY(-3px);
  background: hsla(0, 0%, 100%, 0.88);
  box-shadow:
    0 8px 30px hsl(155 20% 0% / 0.10),
    0 0 0 1px hsl(158 40% 80% / 0.5);
  border-color: hsl(158, 40%, 82%);
}

.run-card.selected {
  border-color: hsl(158, 50%, 70%);
  background: hsla(158, 50%, 97%, 0.95);
  box-shadow:
    0 4px 20px hsl(158 50% 50% / 0.12),
    0 0 0 2px hsl(158 50% 70% / 0.4);
}

/* Checkbox */
.checkbox-wrapper {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  cursor: pointer;
}

.checkbox-wrapper input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox-mark {
  width: 22px;
  height: 22px;
  border: 2px solid hsl(155, 20%, 82%);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  background: hsla(0, 0%, 100%, 0.8);
  color: transparent;
}

.checkbox-wrapper input:checked + .checkbox-mark {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* Card Body */
.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
}

.status-indicator.completed {
  background: hsl(158, 50%, 93%);
  color: hsl(158, 64%, 32%);
}

.status-indicator.running {
  background: hsl(45, 90%, 94%);
  color: hsl(35, 80%, 35%);
}

.status-indicator.failed {
  background: hsl(0, 80%, 95%);
  color: hsl(0, 70%, 45%);
}

.status-dot-inner {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-indicator.running .status-dot-inner {
  animation: dot-pulse 2s ease-in-out infinite;
}

.card-title {
  font-size: 17px;
  font-weight: 650;
  color: hsl(155, 25%, 18%);
  line-height: 1.3;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: hsl(155, 12%, 55%);
  margin-bottom: 16px;
}

/* Progress */
.card-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-track {
  flex: 1;
  height: 5px;
  background: hsl(150, 15%, 92%);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  transition: width 0.5s cubic-bezier(0.2, 0, 0, 1);
}

.progress-fill.completed {
  background: hsl(158, 64%, 45%);
}

.progress-fill.running {
  background: linear-gradient(90deg, hsl(45, 90%, 55%), hsl(35, 85%, 50%));
}

.progress-fill.failed {
  background: hsl(0, 70%, 55%);
}

.progress-label {
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 12%, 50%);
  white-space: nowrap;
  min-width: 50px;
  text-align: right;
}

/* Delete Button */
.card-delete-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: hsl(150, 10%, 65%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-delete-btn:hover {
  background: hsl(0, 80%, 95%);
  color: hsl(0, 70%, 50%);
}

/* ===== Loading ===== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 20px;
  color: var(--text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid hsl(155, 30%, 90%);
  border-top-color: hsl(158, 64%, 45%);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
}

/* ===== Empty State ===== */
.empty-state {
  text-align: center;
  padding: 80px 20px;
}

.empty-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 24px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  margin-bottom: 20px;
  box-shadow: 0 4px 16px hsl(150 15% 0% / 0.06);
}

.empty-icon {
  width: 36px;
  height: 36px;
  color: hsl(158, 30%, 65%);
}

.empty-title {
  font-weight: 650;
  font-size: 18px;
  color: hsl(155, 25%, 18%);
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 14px;
  color: hsl(155, 12%, 50%);
  margin-bottom: 24px;
}

.empty-action {
  display: inline-flex;
  align-items: center;
  padding: 10px 28px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 4px 12px hsl(158 64% 50% / 0.25);
}

.empty-action:hover {
  background: var(--accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px hsl(158 64% 50% / 0.3);
}

/* ===== Manage Bar ===== */
.manage-bar {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 28px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.92));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  box-shadow:
    0 12px 40px hsl(150 15% 0% / 0.12),
    0 0 0 1px hsl(155 20% 92% / 0.3);
  z-index: 100;
}

.manage-count {
  font-size: 14px;
  font-weight: 600;
  color: hsl(155, 25%, 18%);
}

.manage-select-all {
  padding: 7px 16px;
  border-radius: var(--radius-md);
  border: 1px solid hsl(155, 20%, 88%);
  background: hsla(0, 0%, 100%, 0.8);
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.manage-select-all:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.manage-batch-delete {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-md);
  border: none;
  background: hsl(0, 72%, 56%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px hsl(0 72% 56% / 0.25);
}

.manage-batch-delete:hover {
  background: hsl(0, 72%, 48%);
}

.manage-batch-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

/* Bar Slide Transition */
.bar-slide-enter-active,
.bar-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.bar-slide-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.bar-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* ===== Confirm Dialog ===== */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.97), hsla(150, 12%, 98%, 0.94));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  padding: 32px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.18),
              0 0 0 1px hsl(155 20% 92% / 0.3);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

@keyframes dialog-pop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.confirm-icon-wrapper {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: hsl(0, 80%, 96%);
  color: hsl(0, 70%, 55%);
  margin-bottom: 16px;
}

.confirm-title {
  font-size: 18px;
  font-weight: 700;
  color: hsl(155, 25%, 18%);
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 14px;
  color: hsl(155, 12%, 45%);
  margin-bottom: 24px;
  line-height: 1.5;
}

.confirm-buttons {
  display: flex;
  gap: 12px;
  width: 100%;
}

.confirm-btn-cancel {
  flex: 1;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  border: 1px solid hsl(155, 20%, 88%);
  background: hsla(0, 0%, 100%, 0.8);
  color: hsl(155, 12%, 45%);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn-cancel:hover {
  background: hsl(150, 15%, 95%);
}

.confirm-btn-ok {
  flex: 1;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  border: none;
  background: hsl(0, 72%, 56%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px hsl(0 72% 56% / 0.2);
}

.confirm-btn-ok:hover {
  background: hsl(0, 72%, 48%);
}

/* Overlay Transition */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

/* ===== Toast ===== */
.toast {
  position: fixed;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  z-index: 10001;
  pointer-events: none;
  box-shadow: 0 8px 24px hsl(0 0% 0% / 0.12);
}

.toast.success {
  background: hsl(155, 30%, 18%);
  color: hsl(158, 50%, 85%);
}

.toast.error {
  background: hsl(0, 80%, 96%);
  color: hsl(0, 70%, 45%);
  border: 1px solid hsl(0, 70%, 90%);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.toast-fade-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

/* ===== Responsive ===== */
@media (max-width: 1100px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .hero-section {
    flex-direction: column;
    gap: 16px;
  }

  .hero-title {
    font-size: 28px;
  }

  .filter-bar {
    gap: 8px;
  }

  .filter-btn {
    padding: 8px 14px;
    font-size: 12px;
  }

  .card-grid {
    grid-template-columns: 1fr;
  }

  .manage-bar {
    left: 16px;
    right: 16px;
    transform: none;
    width: auto;
  }

  .bar-slide-enter-from,
  .bar-slide-leave-to {
    transform: translateY(20px);
  }
}
</style>
