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
        <AppButton size="sm" @click="showCreateModal = true">+ 新建知识库</AppButton>
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
        <AppButton size="sm" @click="showCreateModal = true">新建知识库</AppButton>
      </div>

      <!-- 数据表格 -->
      <div v-else class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>文档数</th>
              <th>创建时间</th>
              <th class="col-action">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="kb in store.knowledgeBases" :key="kb.id">
              <td class="cell-name">{{ kb.name }}</td>
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
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'

const router = useRouter()
const store = useConfigStore()
const error = ref('')
const showCreateModal = ref(false)
const creating = ref(false)

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
    }
  } finally {
    creating.value = false
  }
}

async function handleDelete(id: number) {
  if (!confirm('确认删除该知识库？关联的智能体将自动解除绑定。此操作不可恢复。')) return
  await store.removeKnowledgeBase(id)
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
  background: var(--color-surface-tint, #f9fafb);
  border-radius: var(--radius-md, 12px);
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
  color: #ef4444;
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
  color: var(--color-text, #1a1d26);
  letter-spacing: -0.01em;
}

.page-desc {
  font-size: 0.8125rem;
  color: var(--color-text-muted, #8b90a0);
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
  background: var(--color-surface-tint, #f9fafb);
  color: var(--color-text-muted, #8b90a0);
  margin-bottom: 20px;
}

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, #1a1d26);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 0.875rem;
  color: var(--color-text-muted, #8b90a0);
  margin-bottom: 24px;
}

/* ── Table Card ── */

.table-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-md, 12px);
  overflow: hidden;
  box-shadow: var(--shadow-card, 0 1px 4px rgba(0, 0, 0, 0.04));
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th {
  text-align: left;
  padding: 12px 20px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted, #8b90a0);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--color-border, #e2e4ea);
  background: var(--color-surface-tint, #f9fafb);
  white-space: nowrap;
}

.data-table td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border-light, #eeeff3);
  color: var(--color-text, #1a1d26);
}

.data-table tbody tr {
  transition: background var(--transition-fast, 150ms ease);
}

.data-table tbody tr:hover {
  background: var(--color-surface-hover, #f3f4f8);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.cell-name {
  font-weight: 500;
}

.cell-secondary {
  color: var(--color-text-secondary, #5f6577);
}

.col-action {
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
  color: var(--color-accent-link, #26a86d);
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 150ms ease);
}

.action-link:hover {
  color: var(--color-accent-hover, #1e8b5a);
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
}

.action--danger {
  color: #ef4444;
}

.action--danger:hover {
  color: #dc2626;
  background: #fef2f2;
}

/* ── Modal ── */

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 500);
}

.modal-dialog {
  background: var(--color-surface, #fff);
  border-radius: var(--radius-lg, 16px);
  width: 440px;
  max-width: 90vw;
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.06));
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
  color: var(--color-text, #1a1d26);
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: var(--color-text-muted, #8b90a0);
  padding: 4px 6px;
  border-radius: var(--radius-sm, 6px);
  line-height: 1;
  transition: all var(--transition-fast, 150ms ease);
}

.modal-close:hover {
  color: var(--color-text, #1a1d26);
  background: var(--color-surface-hover, #f3f4f8);
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
  border-top: 1px solid var(--color-border-light, #eeeff3);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text, #1a1d26);
}

.form-textarea {
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-sm, 6px);
  font-size: 0.875rem;
  line-height: 1.5;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1a1d26);
  resize: vertical;
  font-family: inherit;
  transition: all var(--transition-fast, 150ms ease);
}

.form-textarea::placeholder {
  color: var(--color-text-muted, #8b90a0);
}

.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent, #26a86d);
  box-shadow: var(--shadow-focus, 0 0 0 4px hsl(158 50% 92% / 0.5));
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
