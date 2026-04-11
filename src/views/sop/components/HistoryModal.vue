<!--
  HistoryModal — SOP 运行历史记录弹窗

  职责：
    - Teleport 到 body 的模态对话框
    - 加载用户的 SOP 运行历史（GET /v1/sop/templates/executed）
    - 过滤 pending / failed 的记录
    - 按创建时间倒序排列
    - 点击某条记录 → emit switch-run (父组件跳转)
    - 删除按钮 → ConfirmModal 二次确认 → DELETE API → 重新加载

  ## Props

  - modelValue: boolean — v-model 绑定显示状态

  ## Emits

  - update:modelValue — 关闭时
  - switch-run(runId, templateId) — 用户点击某条记录，父组件跳转路由

  ## 键盘交互

  - Esc 键关闭（document-level listener，与 ConfirmModal 一致）

  ## 状态

  - loading / empty / error / success 四态
  - 删除时：showDeleteConfirm + pendingDeleteRunId

  ## 复用的 API

  使用 src/api/sop.ts 已有的：
    - fetchExecutedRuns() → SopRunRecord[]
    - deleteRun(runId)

  详见 spec §7.1
-->
<template>
  <Teleport to="body">
    <Transition name="history-fade">
      <div
        v-if="modelValue"
        class="history-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        @click.self="handleClose"
      >
        <div class="history-dialog">
          <!-- 头部 -->
          <header class="history-header">
            <h2 id="history-title" class="history-title">历史记录</h2>
            <button
              type="button"
              class="history-close"
              aria-label="关闭历史记录"
              @click="handleClose"
            >
              ×
            </button>
          </header>

          <!-- 内容区 -->
          <div class="history-body">
            <!-- Loading -->
            <div v-if="loading" class="history-loading">
              <span class="history-spinner" aria-hidden="true" />
              <span>加载中…</span>
            </div>

            <!-- Error -->
            <EmptyStateCard
              v-else-if="error"
              variant="error"
              title="加载失败"
              :message="error"
              action-label="重试"
              @action="loadHistory"
            />

            <!-- Empty -->
            <EmptyStateCard
              v-else-if="runs.length === 0"
              title="暂无运行记录"
              message="开始你的第一次 SOP 运行吧"
            />

            <!-- Success: 列表 -->
            <ul v-else class="history-list">
              <li
                v-for="record in runs"
                :key="record.runId"
                class="history-item"
                :class="{ 'is-current': record.runId === currentRunId }"
                @click="handleSwitchRun(record)"
              >
                <div class="history-item-main">
                  <div class="history-item-title">
                    {{ record.templateName }}
                    <span class="history-item-runid">#{{ record.runId }}</span>
                  </div>
                  <div class="history-item-meta">
                    <span class="history-item-date">{{ formatDate(record.executedAt) }}</span>
                    <span class="history-item-progress">
                      {{ record.completedCount }}/{{ record.totalNodes }}
                    </span>
                  </div>
                  <div class="history-item-progress-bar" aria-hidden="true">
                    <div
                      class="history-item-progress-fill"
                      :style="{ width: progressPercent(record) }"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  class="history-item-delete"
                  :aria-label="`删除运行记录 ${record.runId}`"
                  @click.stop="handleDeleteClick(record.runId)"
                >
                  ×
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 删除确认弹窗 -->
    <ConfirmModal
      v-model="showDeleteConfirm"
      title="确认删除"
      message="此操作无法撤销，确定删除此运行记录？"
      variant="danger"
      confirm-text="删除"
      @confirm="confirmDelete"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import EmptyStateCard from './EmptyStateCard.vue'
import { fetchExecutedRuns, deleteRun, type SopRunRecord } from '@/api/sop'
import { useNotificationsStore } from '@/stores/notifications'

const notifications = useNotificationsStore()

interface Props {
  modelValue: boolean
  /** 当前正在查看的 run ID，用于高亮"是你在看的这个" */
  currentRunId?: string
}

const props = withDefaults(defineProps<Props>(), {
  currentRunId: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'switch-run': [runId: string, templateId: string]
}>()

// ===== 状态 =====
const runs = ref<SopRunRecord[]>([])
const loading = ref(false)
const error = ref<string>('')

// 删除确认
const showDeleteConfirm = ref(false)
const pendingDeleteRunId = ref<string | null>(null)

// ===== 数据加载 =====

/**
 * 加载历史记录：调用 fetchExecutedRuns，过滤 pending/failed，按时间倒序
 */
async function loadHistory() {
  loading.value = true
  error.value = ''
  try {
    const list = await fetchExecutedRuns()
    runs.value = list
      .filter((r) => r.status !== 'pending' && r.status !== 'failed')
      .sort((a, b) => {
        // 按执行时间倒序；无时间的排后面
        const aTime = a.executedAt ? new Date(a.executedAt).getTime() : 0
        const bTime = b.executedAt ? new Date(b.executedAt).getTime() : 0
        return bTime - aTime
      })
  } catch (err) {
    error.value = (err as Error)?.message || '加载失败，请重试'
    runs.value = []
  } finally {
    loading.value = false
  }
}

// ===== 用户操作 =====

function handleClose() {
  emit('update:modelValue', false)
}

function handleSwitchRun(record: SopRunRecord) {
  emit('switch-run', record.runId, record.templateId)
  handleClose()
}

function handleDeleteClick(runId: string) {
  pendingDeleteRunId.value = runId
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  const runId = pendingDeleteRunId.value
  if (!runId) return
  try {
    await deleteRun(runId)
    // 从本地列表移除
    runs.value = runs.value.filter((r) => r.runId !== runId)
    notifications.success('删除成功')
  } catch (err) {
    // 注意：这里不写入 error.value，因为那会清空列表 UI（列表被 error state 遮蔽）。
    // 改用 toast 通知用户删除失败，列表保持不变。
    const msg = (err as Error)?.message || '删除失败'
    notifications.error(`删除失败：${msg}`)
  } finally {
    pendingDeleteRunId.value = null
  }
}

// ===== 格式化辅助 =====

function formatDate(isoString: string): string {
  if (!isoString) return '—'
  try {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return '—'
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  } catch {
    return '—'
  }
}

function progressPercent(record: SopRunRecord): string {
  if (!record.totalNodes || record.totalNodes === 0) return '0%'
  const pct = Math.min(100, Math.max(0, (record.completedCount / record.totalNodes) * 100))
  return `${pct}%`
}

// ===== 生命周期 =====

/**
 * Modal 打开时自动加载历史记录。
 *
 * immediate: true 保证以 modelValue=true 挂载时也触发（测试场景常见）。
 * 内部 `if (visible)` 守卫确保 modelValue=false 挂载时不会意外触发。
 */
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      loadHistory()
    }
  },
  { immediate: true }
)

/**
 * Esc 键关闭
 */
function onDocumentKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    handleClose()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeyDown)
})

// 测试暴露：允许外部手动触发 loadHistory
defineExpose({
  loadHistory
})
</script>

<style scoped>
.history-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: var(--space-xl);
}

.history-dialog {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  animation: history-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes history-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* ==================== 头部 ==================== */

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--color-border-light);
}

.history-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
}

.history-close {
  background: none;
  border: none;
  font-size: var(--text-2xl);
  line-height: 1;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.history-close:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

/* ==================== 内容区 ==================== */

.history-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md) var(--space-xl) var(--space-xl);
  min-height: 200px;
}

/* Loading */
.history-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-3xl);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.history-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ==================== 列表 ==================== */

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.history-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.history-item:hover {
  border-color: var(--primary);
  background: var(--color-accent-ultra-soft);
}

.history-item.is-current {
  border-color: var(--primary);
  background: var(--color-accent-ultra-soft);
}

.history-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.history-item-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item-runid {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-weight: 400;
  flex-shrink: 0;
}

.history-item-meta {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.history-item-progress-bar {
  width: 100%;
  height: 4px;
  background: var(--color-border-light);
  border-radius: var(--radius-pill);
  overflow: hidden;
  margin-top: var(--space-xs);
}

.history-item-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width var(--transition-base);
}

.history-item-delete {
  flex-shrink: 0;
  background: none;
  border: none;
  font-size: var(--text-xl);
  line-height: 1;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: var(--space-xs);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.history-item-delete:hover {
  color: var(--color-danger, #dc2626);
  background: var(--color-danger-soft, #fef2f2);
}

/* ==================== Transition ==================== */

.history-fade-enter-active,
.history-fade-leave-active {
  transition: opacity 0.2s ease;
}

.history-fade-enter-from,
.history-fade-leave-to {
  opacity: 0;
}
</style>
