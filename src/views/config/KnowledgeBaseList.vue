<template>
  <div class="kb-list">
    <!-- 加载状态 -->
    <div v-if="store.loading" class="loading-state">
      <div v-for="i in 4" :key="i" class="skeleton-row"></div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <p class="error-text">{{ error }}</p>
      <AppButton variant="secondary" size="sm" @click="loadData">重试</AppButton>
    </div>

    <template v-else>
      <!-- 头部 -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="page-title">知识库管理</h2>
          <p class="page-desc">管理知识库文档，为智能体提供专业知识</p>
        </div>
        <AppButton variant="hero" @click="showCreateModal = true">+ 新建知识库</AppButton>
      </div>

      <!-- 空状态 -->
      <div v-if="store.knowledgeBases.length === 0" class="empty-state">
        <div class="empty-illustration">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            <path d="M8 7h6" />
            <path d="M8 11h8" />
          </svg>
        </div>
        <div class="empty-title">暂无知识库</div>
        <div class="empty-desc">创建知识库并上传文档，为智能体提供专业知识</div>
      </div>

      <!-- 数据表格 -->
      <div v-else class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-left">名称</th>
              <th>文档数</th>
              <th>创建时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="kb in store.knowledgeBases" :key="kb.id">
              <td class="cell-name" @click="router.push(`/config/knowledge-bases/${kb.id}`)">
                {{ kb.name }}
              </td>
              <td class="cell-secondary">{{ kb.doc_count ?? '-' }}</td>
              <td class="cell-secondary">{{ formatDate(kb.created_at) }}</td>
              <td class="col-action">
                <div class="action-group">
                  <button
                    class="action-link"
                    @click="router.push(`/config/knowledge-bases/${kb.id}`)"
                  >
                    查看详情
                  </button>
                  <button class="action-link action--danger" @click="handleDelete(kb.id)">
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <ConfirmModal
      v-model="confirmVisible"
      :title="confirmAction?.title ?? ''"
      :message="confirmAction?.message ?? ''"
      :variant="confirmAction?.variant ?? 'default'"
      :confirm-text="confirmAction?.confirmText ?? '确认'"
      @confirm="onConfirm"
    />

    <!-- 新建知识库弹窗 -->
    <Teleport to="body">
      <Transition name="overlay-fade">
        <div v-if="showCreateModal" class="modal-overlay" @mousedown.self="closeModal">
          <div class="modal-dialog">
            <div class="modal-header">
              <h3 class="modal-title">新建知识库</h3>
              <button class="modal-close" @click="closeModal">&times;</button>
            </div>
            <form class="modal-body" @submit.prevent="handleCreate">
              <AppInput
                v-model="createForm.name"
                label="名称"
                placeholder="请输入知识库名称"
                :error="createErrors.name"
                @blur="validateCreateName"
              />
              <div class="form-group">
                <label class="form-label">描述</label>
                <textarea
                  v-model="createForm.description"
                  class="form-textarea"
                  placeholder="请输入描述（可选）"
                  rows="3"
                ></textarea>
              </div>
            </form>
            <div class="modal-footer">
              <AppButton variant="secondary" type="button" @click="closeModal">取消</AppButton>
              <AppButton
                :loading="creating"
                :disabled="!createForm.name.trim() || creating"
                @click="handleCreate"
              >
                {{ creating ? '创建中...' : '创建' }}
              </AppButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const router = useRouter()
const store = useConfigStore()
const notifications = useNotificationsStore()
const error = ref('')
const showCreateModal = ref(false)
const creating = ref(false)

const confirmVisible = ref(false)
const confirmAction = ref<{
  title: string
  message: string
  variant: 'default' | 'danger'
  confirmText: string
  successMsg?: string
  action: () => Promise<unknown>
} | null>(null)

const createForm = reactive({
  name: '',
  description: ''
})

const createErrors = reactive({
  name: ''
})

function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function validateCreateName() {
  createErrors.name = createForm.name.trim() ? '' : '名称不能为空'
}

function closeModal() {
  showCreateModal.value = false
  createForm.name = ''
  createForm.description = ''
  createErrors.name = ''
}

async function loadData() {
  error.value = ''
  try {
    await store.fetchKnowledgeBases()
  } catch {
    error.value = '加载失败，请重试'
  }
}

async function handleCreate() {
  validateCreateName()
  if (createErrors.name) return

  creating.value = true
  try {
    const ok = await store.addKnowledgeBase({
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined
    })
    if (ok) {
      closeModal()
      notifications.success('知识库已创建')
    }
  } finally {
    creating.value = false
  }
}

function handleDelete(id: number) {
  confirmAction.value = {
    title: '确认删除',
    message: '确认删除该知识库？关联的智能体将自动解除绑定。此操作不可恢复。',
    variant: 'danger',
    confirmText: '删除',
    successMsg: '已删除',
    action: () => store.removeKnowledgeBase(id)
  }
  confirmVisible.value = true
}

async function onConfirm() {
  if (confirmAction.value) {
    try {
      await confirmAction.value.action()
      notifications.success(confirmAction.value.successMsg ?? '操作成功')
    } catch {
      notifications.error('操作失败，请重试')
    }
  }
}

onMounted(loadData)
</script>

<style scoped>
.kb-list {
  width: 100%;
}

/* ── Loading & Error ── */

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 0;
}

.skeleton-row {
  height: 48px;
  background: var(--surface-tint);
  border-radius: var(--radius-md);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.error-state {
  text-align: center;
  padding: 64px 0;
}

.error-text {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
  margin-bottom: 16px;
  font-size: 0.875rem;
}

/* ── Page Header ── */

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.page-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

/* ── Empty State ── */

.empty-state {
  text-align: center;
  padding: 80px 0;
}

.empty-illustration {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--surface-tint);
  color: var(--text-muted);
  margin-bottom: 20px;
}

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 24px;
}

/* ── Table Card ── */

.table-card {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  overflow: hidden;
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
  transition: background 0.15s;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr:hover td {
  background: hsl(155, 20%, 98%);
}

.data-table td.cell-name {
  font-weight: 600;
  color: hsl(155, 25%, 18%);
  text-align: left;
  cursor: pointer;
}

.cell-name:hover {
  color: var(--accent);
}

.data-table th.col-left {
  text-align: left;
}

.cell-secondary {
  font-size: 13px;
  font-weight: 500;
  color: hsl(155, 15%, 35%);
}

.data-table th.col-action,
.data-table td.col-action {
  text-align: right;
}

/* ── Action Links ── */

.action-group {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.action-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--accent-link);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.action-link:hover {
  color: var(--accent-hover);
  background: var(--accent-ultra-soft);
}

.action--danger {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
}

.action--danger:hover {
  color: #dc2626; /* TODO(admin-rebrand): replace with --danger token */
  background: #fef2f2; /* TODO(admin-rebrand): replace with --danger token */
}

/* ── Modal ── */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.modal-dialog {
  background: var(--surface);
  border-radius: var(--radius-lg);
  width: 440px;
  max-width: 90vw;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 16px;
}

.modal-title {
  font-size: 1.0625rem;
  font-weight: 600;
  font-family: var(--font-heading);
  color: var(--text);
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: var(--text-muted);
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  line-height: 1;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.modal-body {
  padding: 0 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-light);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
}

.form-textarea {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  line-height: 1.5;
  background: var(--surface);
  color: var(--text);
  resize: vertical;
  font-family: inherit;
  transition: all var(--transition-fast);
}

.form-textarea::placeholder {
  color: var(--text-muted);
}

.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

/* ── Transitions ── */

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-fade-enter-active .modal-dialog,
.overlay-fade-leave-active .modal-dialog {
  transition: transform 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

.overlay-fade-enter-from .modal-dialog {
  transform: translateY(8px) scale(0.98);
}

.overlay-fade-leave-to .modal-dialog {
  transform: translateY(4px) scale(0.99);
}
</style>
