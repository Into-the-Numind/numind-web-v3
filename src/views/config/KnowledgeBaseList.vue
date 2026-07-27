<template>
  <div class="kb-list">
    <!-- 加载状态 -->
    <div v-if="store.loading" class="loading-state">
      <div class="tool-card-grid">
        <div v-for="i in 4" :key="i" class="tool-card tool-card--loading">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line skeleton-line--short"></div>
        </div>
      </div>
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
          <h2 class="page-title">知识库</h2>
          <p class="page-desc">管理知识库文档，为 AI 智能体提供专业知识</p>
        </div>
        <AppButton variant="hero" @click="showCreateModal = true">+ 新建知识库</AppButton>
      </div>

      <div class="list-toolbar">
        <AppInput v-model="searchTerm" placeholder="搜索知识库" class="search-input" />
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
        <div class="empty-desc">创建知识库并上传文档，为 AI 智能体提供专业知识</div>
      </div>

      <!-- 知识库卡片 -->
      <template v-else>
        <div v-if="filteredKnowledgeBases.length > 0" class="tool-card-grid">
          <article
            v-for="kb in filteredKnowledgeBases"
            :key="kb.id"
            class="tool-card"
            role="button"
            tabindex="0"
            @click="goDetail(kb.id)"
            @keydown.enter.prevent="goDetail(kb.id)"
            @keydown.space.prevent="goDetail(kb.id)"
          >
            <div class="tool-card__top">
              <h3 class="tool-card__title">{{ kb.name }}</h3>
              <span class="status-badge">{{ kb.doc_count ?? 0 }} 文档</span>
            </div>
            <p class="tool-card__desc">{{ kb.description || '知识库文档资产' }}</p>
            <div class="tool-card__footer">
              <span class="tool-card__date">{{ formatDate(kb.created_at) }}</span>
              <button
                class="delete-action"
                type="button"
                :aria-label="`删除 ${kb.name}`"
                title="删除"
                @click.stop="handleDelete(kb)"
                @keydown.stop
              >
                <Trash2 :size="15" stroke-width="2" />
              </button>
            </div>
          </article>
        </div>
        <div v-else class="card-empty">没有匹配的知识库</div>
      </template>
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
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { Trash2 } from 'lucide-vue-next'
import type { KnowledgeBase } from '@/types/config'

const router = useRouter()
const store = useConfigStore()
const notifications = useNotificationsStore()
const error = ref('')
const searchTerm = ref('')
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

const filteredKnowledgeBases = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) return store.knowledgeBases
  return store.knowledgeBases.filter((kb) =>
    [kb.name, kb.description].some((value) => (value || '').toLowerCase().includes(term))
  )
})

function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function goDetail(id: number) {
  router.push(`/config/knowledge-bases/${id}`)
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

function handleDelete(kb: KnowledgeBase) {
  confirmAction.value = {
    title: '确认删除',
    message: `确认删除「${kb.name}」？关联的 AI 智能体将自动解除绑定。此操作不可恢复。`,
    variant: 'danger',
    confirmText: '删除',
    successMsg: '已删除',
    action: () => store.removeKnowledgeBase(kb.id)
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
  padding: 24px 0;
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
  align-items: center;
  gap: var(--space-xl);
  margin: 0;
  padding: 0 0 var(--space-lg);
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
  letter-spacing: 0;
}

.page-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: var(--line-height-normal);
}

/* ── Toolbar ── */

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 0 var(--space-lg);
  margin: 0;
}

.search-input {
  width: 100%;
  max-width: 320px;
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

/* ── Cards ── */

.tool-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 288px);
  gap: var(--space-md);
  justify-content: start;
  padding: 0;
}

.tool-card {
  width: 288px;
  min-height: 146px;
  appearance: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-lg);
  background: var(--surface);
  border: 1px solid hsl(158, 50%, 78%);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--transition-base),
    border-color var(--transition-base),
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

.tool-card:hover {
  border-color: hsl(158, 50%, 78%);
  background: var(--surface);
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.08),
    0 0 0 1px hsl(158 40% 80% / 0.5);
  transform: translateY(-3px);
}

.tool-card:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.tool-card--loading {
  justify-content: center;
}

.tool-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.tool-card__title {
  min-width: 0;
  flex: 1;
  margin: 0;
  color: hsl(155, 25%, 18%);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: var(--line-height-tight);
}

.tool-card__desc {
  min-height: 34px;
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.tool-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: auto;
  padding-top: var(--space-sm);
  border-top: 1px solid var(--divider);
}

.tool-card__date {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.status-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.delete-action {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--text);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

.delete-action:hover {
  color: #dc2626; /* TODO(admin-rebrand): replace with --danger token */
  background: #fef2f2; /* TODO(admin-rebrand): replace with --danger-soft token */
}

.card-empty {
  padding: var(--space-3xl) var(--space-xl);
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.skeleton-line {
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--surface-tint);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line--title {
  width: 50%;
  height: 16px;
}

.skeleton-line--short {
  width: 70%;
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

@media (max-width: 720px) {
  .page-header,
  .list-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .search-input {
    max-width: none;
  }

  .tool-card-grid {
    grid-template-columns: 1fr;
  }

  .tool-card {
    width: 100%;
  }
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
