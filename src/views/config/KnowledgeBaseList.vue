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
        <h2 class="page-title">知识库管理</h2>
        <AppButton size="sm" @click="showCreateModal = true">+ 新建知识库</AppButton>
      </div>

      <!-- 空状态 -->
      <div v-if="store.knowledgeBases.length === 0" class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-title">暂无知识库</div>
        <div class="empty-desc">创建知识库并上传文档，为智能体提供专业知识</div>
        <AppButton size="sm" @click="showCreateModal = true">新建知识库</AppButton>
      </div>

      <!-- 数据表格 -->
      <div v-else class="table-container">
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
              <td>{{ kb.doc_count ?? '-' }}</td>
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

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 0;
}

.skeleton-row {
  height: 48px;
  background: var(--color-surface-tint, #f3f4f6);
  border-radius: 8px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.error-state {
  text-align: center;
  padding: 48px 0;
}

.error-text {
  color: #ef4444;
  margin-bottom: 16px;
  font-size: 0.875rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text, #111827);
}

.empty-state {
  text-align: center;
  padding: 64px 0;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text, #111827);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 0.875rem;
  color: var(--color-text-muted, #6b7280);
  margin-bottom: 24px;
}

.table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th {
  text-align: left;
  padding: 12px 16px;
  font-weight: 500;
  color: var(--color-text-muted, #6b7280);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  white-space: nowrap;
}

.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  color: var(--color-text, #111827);
}

.cell-name {
  font-weight: 500;
}

.cell-secondary {
  color: var(--color-text-muted, #6b7280);
}

.col-action {
  text-align: right;
}

.action-group {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.action-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--color-accent-link, #3b82f6);
  padding: 4px 0;
  transition: color 0.15s;
}

.action-link:hover {
  color: var(--color-accent-hover, #2563eb);
}

.action--danger {
  color: #ef4444;
}

.action--danger:hover {
  color: #dc2626;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-dialog {
  background: var(--color-surface, #fff);
  border-radius: 12px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.modal-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, #111827);
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: var(--color-text-muted, #6b7280);
  padding: 4px;
  line-height: 1;
}

.modal-close:hover {
  color: var(--color-text, #111827);
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text, #111827);
}

.form-textarea {
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.875rem;
  background: var(--color-surface, #fff);
  color: var(--color-text, #111827);
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.15s;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent, #3b82f6);
  box-shadow: var(--shadow-focus, 0 0 0 2px rgba(59, 130, 246, 0.15));
}

/* Transitions */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
