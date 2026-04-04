<template>
  <div class="blogger-list">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="add-btn" @click="showAddModal = true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          添加博主
        </button>
        <button
          class="batch-btn"
          :disabled="selectedIds.length < 1 || selectedIds.length > 50 || batchChecking"
          @click="handleBatchCheck"
        >
          <span v-if="batchChecking" class="btn-spinner"></span>
          批量检查
          <span v-if="selectedIds.length > 0" class="badge">{{ selectedIds.length }}</span>
        </button>
      </div>
      <div class="toolbar-right">
        <select v-model="filterCategory" class="filter-select" @change="loadBloggers(1)">
          <option value="">全部赛道</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="store.loading && store.bloggers.length === 0" class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">加载博主列表...</div>
    </div>

    <!-- Empty state -->
    <div v-else-if="store.bloggers.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      </div>
      <h3 class="empty-title">还没有监控博主</h3>
      <p class="empty-desc">添加小红书博主 ID，开始自动追踪内容动态</p>
      <button class="action-btn" @click="showAddModal = true">添加第一个博主</button>
    </div>

    <!-- Table -->
    <div v-else class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-checkbox">
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected"
                @change="toggleSelectAll"
              />
            </th>
            <th class="col-blogger">博主</th>
            <th class="col-category">赛道分类</th>
            <th class="col-status">状态</th>
            <th class="col-followers">粉丝数</th>
            <th class="col-check">最近检查</th>
            <th class="col-failures">连续失败</th>
            <th class="col-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="blogger in store.bloggers" :key="blogger.id">
            <td class="col-checkbox">
              <input
                type="checkbox"
                :checked="selectedIds.includes(blogger.id)"
                @change="toggleSelect(blogger.id)"
              />
            </td>
            <td class="col-blogger">
              <div class="blogger-cell">
                <img
                  v-if="blogger.avatar_url"
                  :src="blogger.avatar_url"
                  :alt="blogger.nickname"
                  class="blogger-avatar"
                />
                <div v-else class="blogger-avatar-placeholder">
                  {{ (blogger.nickname || '?').charAt(0) }}
                </div>
                <div class="blogger-info">
                  <span class="blogger-name">{{ blogger.nickname || blogger.xhs_user_id }}</span>
                  <span class="blogger-id">{{ blogger.xhs_user_id }}</span>
                </div>
              </div>
            </td>
            <td class="col-category">
              <span v-if="blogger.category" class="category-tag">{{ blogger.category }}</span>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="col-status">
              <span class="status-badge" :class="blogger.is_active ? 'active' : 'inactive'">
                {{ blogger.is_active ? '监控中' : '已暂停' }}
              </span>
            </td>
            <td class="col-followers">{{ formatNumber(blogger.followers) }}</td>
            <td class="col-check">
              <span v-if="blogger.last_check_at" :title="blogger.last_check_at">
                {{ formatRelativeTime(blogger.last_check_at) }}
              </span>
              <span v-else class="text-muted">从未</span>
            </td>
            <td class="col-failures">
              <span v-if="blogger.consecutive_failures > 0" class="failure-count" :title="blogger.check_error">
                {{ blogger.consecutive_failures }}
              </span>
              <span v-else class="text-muted">0</span>
            </td>
            <td class="col-actions">
              <div class="action-group">
                <button
                  class="icon-btn"
                  :title="blogger.is_active ? '暂停监控' : '恢复监控'"
                  @click="handleToggleActive(blogger)"
                >
                  <svg v-if="blogger.is_active" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
                <button
                  class="icon-btn"
                  title="立即检查"
                  :disabled="checkingIds.has(blogger.id)"
                  @click="handleCheckNow(blogger.id)"
                >
                  <span v-if="checkingIds.has(blogger.id)" class="btn-spinner-sm"></span>
                  <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
                <button class="icon-btn danger" title="删除" @click="handleDelete(blogger)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="store.bloggersTotal > pageSize" class="pagination">
      <button class="page-btn" :disabled="currentPage <= 1" @click="loadBloggers(currentPage - 1)">上一页</button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <button class="page-btn" :disabled="currentPage >= totalPages" @click="loadBloggers(currentPage + 1)">下一页</button>
    </div>

    <!-- Add blogger modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal-card">
          <h3 class="modal-title">添加监控博主</h3>
          <div class="form-group">
            <label class="form-label">小红书用户 ID</label>
            <input
              v-model="addForm.xhs_user_id"
              type="text"
              class="form-input"
              placeholder="输入用户主页链接中的 ID"
              @keydown.enter="handleAdd"
            />
          </div>
          <div class="form-group">
            <label class="form-label">赛道分类（可选）</label>
            <input
              v-model="addForm.category"
              type="text"
              class="form-input"
              placeholder="如：美妆、穿搭、家居"
            />
          </div>
          <div v-if="addError" class="form-error">{{ addError }}</div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="showAddModal = false">取消</button>
            <button class="confirm-btn" :disabled="!addForm.xhs_user_id.trim() || adding" @click="handleAdd">
              <span v-if="adding" class="btn-spinner"></span>
              确认添加
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete confirm modal -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="modal-overlay" @click.self="deleteTarget = null">
        <div class="modal-card">
          <h3 class="modal-title">确认删除</h3>
          <p class="modal-desc">
            确定要删除博主 <strong>{{ deleteTarget.nickname || deleteTarget.xhs_user_id }}</strong> 吗？
            该博主的所有笔记记录也将被删除，此操作无法撤销。
          </p>
          <div class="modal-actions">
            <button class="cancel-btn" @click="deleteTarget = null">取消</button>
            <button class="confirm-btn danger" :disabled="deleting" @click="confirmDelete">
              <span v-if="deleting" class="btn-spinner"></span>
              确认删除
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import type { MonitorBlogger } from '@/api/monitor'
import {
  addBlogger,
  updateBlogger,
  deleteBlogger,
  checkBlogger,
  checkBatch
} from '@/api/monitor'

const store = useMonitorStore()

// Pagination
const currentPage = ref(1)
const pageSize = 20
const totalPages = computed(() => Math.ceil(store.bloggersTotal / pageSize))

// Selection
const selectedIds = ref<number[]>([])
const allSelected = computed(
  () => store.bloggers.length > 0 && selectedIds.value.length === store.bloggers.length
)
const someSelected = computed(
  () => selectedIds.value.length > 0 && selectedIds.value.length < store.bloggers.length
)

// Filter
const filterCategory = ref('')
const categories = computed(() => {
  const cats = new Set(store.bloggers.map((b) => b.category).filter(Boolean))
  return Array.from(cats).sort()
})

// Add modal
const showAddModal = ref(false)
const adding = ref(false)
const addError = ref('')
const addForm = reactive({ xhs_user_id: '', category: '' })

// Delete modal
const deleteTarget = ref<MonitorBlogger | null>(null)
const deleting = ref(false)

// Checking state
const checkingIds = ref(new Set<number>())
const batchChecking = ref(false)

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = store.bloggers.map((b) => b.id)
  }
}

function toggleSelect(id: number) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(id)
  }
}

async function loadBloggers(page: number) {
  currentPage.value = page
  selectedIds.value = []
  await store.fetchBloggers({
    page,
    page_size: pageSize,
    category: filterCategory.value || undefined
  })
}

async function handleAdd() {
  if (!addForm.xhs_user_id.trim() || adding.value) return
  adding.value = true
  addError.value = ''
  try {
    await addBlogger({
      xhs_user_id: addForm.xhs_user_id.trim(),
      category: addForm.category.trim() || undefined
    })
    showAddModal.value = false
    addForm.xhs_user_id = ''
    addForm.category = ''
    await loadBloggers(1)
    store.fetchStats()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    addError.value = err?.response?.data?.message || '添加失败，请检查用户 ID 是否正确'
  } finally {
    adding.value = false
  }
}

async function handleToggleActive(blogger: MonitorBlogger) {
  try {
    await updateBlogger(blogger.id, { is_active: !blogger.is_active })
    await loadBloggers(currentPage.value)
  } catch (e) {
    console.error('[monitor] toggleActive failed:', e)
  }
}

function handleDelete(blogger: MonitorBlogger) {
  deleteTarget.value = blogger
}

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    await deleteBlogger(deleteTarget.value.id)
    deleteTarget.value = null
    await loadBloggers(currentPage.value)
    store.fetchStats()
  } catch (e) {
    console.error('[monitor] delete failed:', e)
  } finally {
    deleting.value = false
  }
}

async function handleCheckNow(id: number) {
  if (checkingIds.value.has(id)) return
  checkingIds.value.add(id)
  try {
    await checkBlogger(id)
    await loadBloggers(currentPage.value)
  } catch (e) {
    console.error('[monitor] check failed:', e)
  } finally {
    checkingIds.value.delete(id)
  }
}

async function handleBatchCheck() {
  if (selectedIds.value.length < 1 || selectedIds.value.length > 50 || batchChecking.value) return
  batchChecking.value = true
  try {
    await checkBatch({ blogger_ids: selectedIds.value })
    selectedIds.value = []
    await loadBloggers(currentPage.value)
  } catch (e) {
    console.error('[monitor] batchCheck failed:', e)
  } finally {
    batchChecking.value = false
  }
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}小时前`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}天前`
  return date.toLocaleDateString('zh-CN')
}

onMounted(() => {
  loadBloggers(1)
})
</script>

<style scoped>
.blogger-list {
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

.add-btn {
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

.add-btn:hover {
  background: var(--primary-hover);
}

.batch-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.batch-btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.batch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.badge {
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  min-width: 18px;
  text-align: center;
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
}

.action-btn {
  margin-top: var(--space-sm);
  padding: 10px 24px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.action-btn:hover {
  background: var(--primary-hover);
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

.data-table tbody tr:hover {
  background: var(--surface-hover);
}

.col-checkbox {
  width: 40px;
}

.col-actions {
  width: 120px;
}

/* Blogger cell */
.blogger-cell {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.blogger-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.blogger-avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: var(--text-sm);
  flex-shrink: 0;
}

.blogger-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.blogger-name {
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blogger-id {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

/* Tags & badges */
.category-tag {
  display: inline-block;
  padding: 2px 8px;
  background: var(--accent-ultra-soft);
  color: var(--accent);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
}

.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
}

.status-badge.active {
  background: hsl(160, 60%, 93%);
  color: hsl(160, 72%, 34%);
}

.status-badge.inactive {
  background: hsl(0, 0%, 93%);
  color: hsl(0, 0%, 50%);
}

.failure-count {
  color: hsl(0, 70%, 50%);
  font-weight: 600;
  cursor: help;
}

.text-muted {
  color: var(--text-muted);
}

/* Action buttons */
.action-group {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.icon-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-btn.danger:hover:not(:disabled) {
  background: hsl(0, 80%, 95%);
  color: hsl(0, 70%, 50%);
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

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--space-lg);
}

.modal-card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  width: 100%;
  max-width: 440px;
  box-shadow: var(--shadow-lg);
}

.modal-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text);
  margin: 0 0 var(--space-lg) 0;
}

.modal-desc {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--space-xl) 0;
}

.form-group {
  margin-bottom: var(--space-lg);
}

.form-label {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text);
  margin-bottom: var(--space-xs);
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  outline: none;
  transition: border-color var(--transition-fast);
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-error {
  color: hsl(0, 70%, 50%);
  font-size: var(--text-xs);
  margin-bottom: var(--space-lg);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.cancel-btn {
  padding: 8px 20px;
  background: var(--surface);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: var(--surface-hover);
}

.confirm-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.confirm-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.confirm-btn.danger {
  background: hsl(0, 70%, 55%);
}

.confirm-btn.danger:hover:not(:disabled) {
  background: hsl(0, 70%, 48%);
}

/* Spinners */
.btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.btn-spinner-sm {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-light);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Responsive */
@media (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-left,
  .toolbar-right {
    justify-content: stretch;
  }

  .col-followers,
  .col-check,
  .col-failures {
    display: none;
  }
}
</style>
