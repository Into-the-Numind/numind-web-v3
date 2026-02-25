<template>
  <MainLayout>
    <div class="history-page">
      <!-- 页头 -->
      <div class="page-header">
        <div class="header-left">
          <h1 class="page-title">我的任务记录</h1>
          <p class="page-subtitle">查看和管理所有 SOP 运行记录</p>
        </div>
        <button
          v-if="records.length > 0"
          class="manage-btn"
          :class="{ active: manageMode }"
          @click="toggleManageMode"
        >
          {{ manageMode ? '完成' : '管理' }}
        </button>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
        <div class="loading-text">正在获取任务记录...</div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="records.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="empty-icon">
          <path
            d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div class="empty-title">暂无运行记录</div>
        <div class="empty-desc">开始执行 SOP 后，记录将显示在此处</div>
      </div>

      <!-- 卡片列表 -->
      <div v-else class="card-list">
        <div
          v-for="record in sortedRecords"
          :key="record.runId"
          class="run-card"
          @click="handleCardClick(record)"
        >
          <!-- 管理模式复选框 -->
          <label v-if="manageMode" class="checkbox-wrapper" @click.stop>
            <input
              type="checkbox"
              :checked="selectedIds.has(record.runId)"
              @change="toggleSelect(record.runId)"
            />
            <span class="checkbox-mark"></span>
          </label>

          <div class="card-info">
            <div class="card-title-row">
              <span class="card-name">{{ record.templateName }}</span>
              <span
                class="status-badge"
                :class="statusClass(record)"
              >
                {{ statusLabel(record) }}
              </span>
            </div>
            <div class="card-meta">
              <span>执行时间: {{ formatTime(record.executedAt) }}</span>
            </div>
            <div class="card-progress">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  :style="{ width: progressPercent(record) + '%' }"
                ></div>
              </div>
              <span class="progress-text">{{ record.completedCount }}/{{ record.totalNodes }}</span>
            </div>
          </div>

          <!-- 操作按钮 -->
          <button
            v-if="!manageMode"
            class="card-action-btn"
            @click.stop="handleCardClick(record)"
          >
            {{ isCompleted(record) ? '查看内容' : '继续任务' }}
          </button>

          <!-- 管理模式删除按钮 -->
          <button
            v-if="manageMode"
            class="card-delete-btn"
            title="删除此记录"
            @click.stop="handleSingleDelete(record.runId)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- 管理模式浮动栏 -->
      <div v-if="manageMode && records.length > 0" class="manage-bar">
        <span class="manage-count">已选 {{ selectedIds.size }} 项</span>
        <button class="manage-select-all" @click="toggleSelectAll">
          {{ selectedIds.size === records.length ? '取消全选' : '全选' }}
        </button>
        <button
          class="manage-batch-delete"
          :disabled="selectedIds.size === 0"
          @click="handleBatchDelete"
        >
          批量删除
        </button>
      </div>
    </div>

    <!-- 确认对话框 -->
    <Teleport to="body">
      <div
        v-if="confirmVisible"
        class="confirm-overlay"
        @click.self="confirmVisible = false"
      >
        <div class="confirm-dialog">
          <div class="confirm-title">{{ confirmTitle }}</div>
          <div class="confirm-message">{{ confirmMessage }}</div>
          <div class="confirm-buttons">
            <button class="confirm-btn-cancel" @click="confirmVisible = false">取消</button>
            <button class="confirm-btn-ok" @click="onConfirm">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast -->
    <Teleport to="body">
      <Transition name="toast-fade">
        <div v-if="toastVisible" class="toast" :class="toastType">
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
    const Y = d.getFullYear()
    const M = String(d.getMonth() + 1).padStart(2, '0')
    const D = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${Y}-${M}-${D} ${h}:${m}:${s}`
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
  if (selectedIds.value.size === records.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(records.value.map((r) => r.runId))
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
    // 过滤掉 pending（无有效 runId），保留 failed 让用户可见
    records.value = runs.filter((r) => r.status !== 'pending')

    // 异步更新未完成记录的进度
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
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 80px;
}

/* 页头 */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 32px;
}

.page-title {
  font-family: var(--font-sans);
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 4px;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.manage-btn {
  padding: 8px 20px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.manage-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.manage-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

/* 加载状态 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.loading-dots {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: dot-bounce 1.4s ease-in-out infinite both;
}

.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 80px 20px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  color: var(--text-muted, #9ca3af);
  margin-bottom: 16px;
}

.empty-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
  margin-bottom: 4px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-muted, #9ca3af);
}

/* 卡片列表 */
.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.run-card {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 16px;
}

.run-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1);
  transform: translateY(-2px);
}

/* 复选框 */
.checkbox-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-wrapper input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox-mark {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-light);
  border-radius: 4px;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-wrapper input:checked + .checkbox-mark {
  background: var(--accent);
  border-color: var(--accent);
}

.checkbox-wrapper input:checked + .checkbox-mark::after {
  content: '';
  width: 6px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: -2px;
}

/* 卡片信息 */
.card-info {
  flex: 1;
  min-width: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  padding: 3px 10px;
  border-radius: var(--radius-pill, 9999px);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-badge.completed {
  background: hsl(158, 50%, 92%);
  color: hsl(158, 64%, 35%);
}

.status-badge.running {
  background: hsl(45, 90%, 95%);
  color: hsl(45, 90%, 35%);
}

.status-badge.failed {
  background: hsl(0, 80%, 95%);
  color: hsl(0, 70%, 45%);
}

.card-meta {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  margin-bottom: 12px;
}

.card-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--border-light);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  min-width: 40px;
  text-align: right;
  white-space: nowrap;
}

/* 操作按钮 */
.card-action-btn {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.card-action-btn:hover {
  background: var(--accent);
  color: #fff;
}

/* 删除按钮 */
.card-delete-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  color: var(--text-muted, #9ca3af);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.card-delete-btn:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #f87171;
}

/* 浮动管理栏 */
.manage-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  z-index: 100;
}

.manage-count {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.manage-select-all {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.manage-select-all:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.manage-batch-delete {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.manage-batch-delete:hover {
  background: #dc2626;
}

.manage-batch-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 确认弹窗 */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog {
  background: var(--surface);
  border-radius: var(--radius-xl, 16px);
  padding: 28px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-pop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.confirm-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
  line-height: 1.5;
}

.confirm-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.confirm-btn-cancel {
  padding: 8px 20px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn-cancel:hover {
  background: var(--bg);
}

.confirm-btn-ok {
  padding: 8px 20px;
  border-radius: var(--radius-md);
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn-ok:hover {
  background: #dc2626;
}

/* Toast */
.toast {
  position: fixed;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 10001;
  pointer-events: none;
}

.toast.success {
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
}

.toast.error {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
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

/* 响应式 */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 12px;
  }

  .run-card {
    padding: 12px 16px;
    flex-wrap: wrap;
  }

  .card-action-btn {
    width: 100%;
    text-align: center;
    margin-top: 8px;
  }

  .manage-bar {
    left: 16px;
    right: 16px;
    transform: none;
    width: auto;
  }
}
</style>
