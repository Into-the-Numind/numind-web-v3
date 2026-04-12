<template>
  <div class="kb-detail">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <div v-for="i in 3" :key="i" class="skeleton-row"></div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="loadError" class="error-state">
      <p class="error-text">{{ loadError }}</p>
      <AppButton variant="secondary" size="sm" @click="loadDetail">重试</AppButton>
    </div>

    <template v-else-if="detail">
      <!-- 头部 -->
      <div class="page-header">
        <button class="back-link" @click="router.push('/config/knowledge-bases')">
          &larr; 返回列表
        </button>
        <div class="header-row">
          <div class="header-info">
            <h2 v-if="!editingMeta" class="page-title">
              {{ detail.name }}
              <button class="edit-meta-btn" title="编辑" @click="startEditMeta">&hellip;</button>
            </h2>
            <div v-else class="meta-edit-row">
              <AppInput
                v-model="metaForm.name"
                placeholder="知识库名称"
                :error="metaErrors.name"
                @blur="validateMetaName"
              />
              <AppButton
                size="sm"
                :loading="savingMeta"
                :disabled="!metaForm.name.trim()"
                @click="saveMetaEdit"
              >
                保存
              </AppButton>
              <AppButton variant="secondary" size="sm" @click="editingMeta = false">
                取消
              </AppButton>
            </div>
            <p v-if="!editingMeta" class="page-desc">{{ detail.description || '暂无描述' }}</p>
            <div v-if="editingMeta" class="meta-desc-row">
              <textarea
                v-model="metaForm.description"
                class="form-textarea"
                placeholder="描述（可选）"
                rows="2"
              ></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- 上传区域 -->
      <div class="upload-section">
        <label class="upload-area" :class="{ disabled: docLimitReached }">
          <input
            ref="fileInput"
            type="file"
            class="file-input"
            accept=".txt,.pdf,.md,.doc,.docx"
            multiple
            :disabled="uploading || docLimitReached"
            @change="handleFileSelect"
          />
          <span v-if="uploading" class="upload-text">上传中（{{ uploadingCount }} 个文件）...</span>
          <span v-else-if="docLimitReached" class="upload-text upload-text--disabled">
            已达文档上限（10 份）
          </span>
          <span v-else class="upload-text">
            点击选择文件上传（支持 txt、pdf、md、doc、docx，单次最多 5 个，单文件不超过 50MB）
          </span>
        </label>
        <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
      </div>

      <!-- 文档列表 -->
      <div class="doc-section">
        <h3 class="section-title">文档列表（{{ detail.documents?.length ?? 0 }}）</h3>

        <!-- 轮询超时提示：后端仍在处理，引导用户手动刷新 -->
        <div v-if="pollTimedOut" class="poll-timeout-banner">
          <span>后端仍在处理部分文档，刷新可获取最新状态</span>
          <AppButton variant="secondary" size="sm" @click="handleManualRefresh">
            手动刷新
          </AppButton>
        </div>

        <div v-if="!detail.documents || detail.documents.length === 0" class="doc-empty">
          暂无文档，请上传文件
        </div>

        <div v-else class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>大小</th>
                <th>状态</th>
                <th>上传时间</th>
                <th class="col-action">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="doc in detail.documents" :key="doc.id">
                <td class="cell-name">{{ doc.name }}</td>
                <td class="cell-secondary">{{ formatSize(doc.file_size) }}</td>
                <td>
                  <span class="status-badge" :class="'status--' + doc.status.toLowerCase()">
                    {{ docStatusLabel(doc.status) }}
                  </span>
                </td>
                <td class="cell-secondary">{{ formatDate(doc.created_at) }}</td>
                <td class="col-action">
                  <button class="action-link action--danger" @click="handleRemoveDoc(doc.id)">
                    移除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import type { KBDetail } from '@/types/config'

const route = useRoute()
const router = useRouter()
const store = useConfigStore()
const notifications = useNotificationsStore()

const kbId = Number(route.params.id)

const MAX_FILES_PER_BATCH = 5
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_DOCS_PER_KB = 10

const loading = ref(false)
const loadError = ref('')
const detail = ref<KBDetail | null>(null)
const uploading = ref(false)
const uploadingCount = ref(0)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const docLimitReached = computed(() => {
  return (detail.value?.documents?.length ?? 0) >= MAX_DOCS_PER_KB
})

// 文档状态轮询：上传后后端 pipeline 异步处理，需持续刷新直到所有文档进入终态
//
// 所有可能状态枚举（与 docStatusLabel 保持同步）：
//   pending / parsing / embedding — 非终态
//   completed / failed            — 终态
const DOC_STATUSES = {
  pending: '待处理',
  parsing: '解析中',
  embedding: '向量化中',
  completed: '已完成',
  failed: '失败'
} as const
type DocStatus = keyof typeof DOC_STATUSES
const TERMINAL_STATUSES: readonly DocStatus[] = ['completed', 'failed']

const POLL_INTERVAL_MS = 1000
const POLL_MAX_TICKS = 90

// 非响应式（模板不消费）
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollTicks = 0
// 组件卸载标志 —— 防止 handleFileSelect 的 in-flight promise resolve
// 后再 schedulePoll，导致 timer 在已卸载组件上运行（P1 race fix）
let cancelled = false

// 轮询超时后展示的"仍在处理，手动刷新"banner 状态（响应式，模板消费）
const pollTimedOut = ref(false)

function hasPendingDocs(): boolean {
  const docs = detail.value?.documents ?? []
  return docs.some((d) => !TERMINAL_STATUSES.includes(d.status.toLowerCase() as DocStatus))
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  pollTicks = 0
}

function schedulePoll() {
  stopPolling()
  if (cancelled) return
  if (!hasPendingDocs()) return
  pollTimedOut.value = false
  const tick = async () => {
    if (cancelled) return
    pollTicks += 1
    // store.fetchKBDetail 内部吞错返回 null，无需 try/catch
    const res = await store.fetchKBDetail(kbId)
    if (cancelled) return
    if (res) detail.value = res
    if (!hasPendingDocs()) {
      stopPolling()
      return
    }
    if (pollTicks < POLL_MAX_TICKS) {
      pollTimer = setTimeout(tick, POLL_INTERVAL_MS)
    } else {
      // 超时但后端仍可能在处理；展示手动刷新 banner，停止轮询
      pollTimedOut.value = true
      stopPolling()
    }
  }
  pollTimer = setTimeout(tick, POLL_INTERVAL_MS)
}

/** banner 手动刷新 —— 重新加载并若仍有非终态文档继续轮询 */
async function handleManualRefresh() {
  pollTimedOut.value = false
  await loadDetail()
  schedulePoll()
}

// Meta editing
const editingMeta = ref(false)
const savingMeta = ref(false)
const metaForm = reactive({ name: '', description: '' })
const metaErrors = reactive({ name: '' })

function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function docStatusLabel(status: string): string {
  return DOC_STATUSES[status.toLowerCase() as DocStatus] ?? status
}

function validateMetaName() {
  metaErrors.name = metaForm.name.trim() ? '' : '名称不能为空'
}

function startEditMeta() {
  if (!detail.value) return
  metaForm.name = detail.value.name
  metaForm.description = detail.value.description ?? ''
  metaErrors.name = ''
  editingMeta.value = true
}

async function saveMetaEdit() {
  validateMetaName()
  if (metaErrors.name) return
  savingMeta.value = true
  try {
    const ok = await store.editKnowledgeBase(kbId, {
      name: metaForm.name.trim(),
      description: metaForm.description.trim() || undefined
    })
    if (ok) {
      editingMeta.value = false
      await loadDetail()
      notifications.success('已保存')
    }
  } finally {
    savingMeta.value = false
  }
}

async function loadDetail() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await store.fetchKBDetail(kbId)
    if (!res) {
      loadError.value = '知识库不存在'
      return
    }
    detail.value = res
  } catch {
    loadError.value = '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const fileList = input.files
  if (!fileList || fileList.length === 0) return

  uploadError.value = ''
  const files = Array.from(fileList)

  // 客户端校验：文件数量
  const currentDocCount = detail.value?.documents?.length ?? 0
  const remaining = MAX_DOCS_PER_KB - currentDocCount
  if (files.length > remaining) {
    uploadError.value = `知识库还可上传 ${remaining} 份文档，本次选择了 ${files.length} 份`
    if (fileInput.value) fileInput.value.value = ''
    return
  }
  if (files.length > MAX_FILES_PER_BATCH) {
    uploadError.value = `单次最多上传 ${MAX_FILES_PER_BATCH} 个文件`
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  // 客户端校验：单文件大小
  const oversized = files.filter((f) => f.size > MAX_FILE_SIZE)
  if (oversized.length > 0) {
    uploadError.value = `以下文件超过 50MB 限制：${oversized.map((f) => f.name).join('、')}`
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  uploading.value = true
  uploadingCount.value = files.length
  try {
    const { ok, results, errorMsg } = await store.uploadDocuments(kbId, files)
    if (errorMsg) {
      uploadError.value = errorMsg
    } else if (!ok && results.length > 0) {
      const failed = results.filter((r) => !r.success)
      uploadError.value = failed.map((r) => `${r.filename}: ${r.error}`).join('；')
    }
    // 无论部分成功还是全部成功都刷新列表
    await loadDetail()
    if (uploadError.value) {
      notifications.error(uploadError.value)
    } else {
      notifications.success('上传成功')
    }
    // 后端 pipeline 异步处理（pending → parsing → embedding → completed），启动轮询至终态
    schedulePoll()
  } finally {
    uploading.value = false
    uploadingCount.value = 0
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}

const confirmVisible = ref(false)
const confirmAction = ref<{
  title: string
  message: string
  variant: 'default' | 'danger'
  confirmText: string
  successMsg?: string
  action: () => Promise<unknown>
} | null>(null)

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

function handleRemoveDoc(docId: number) {
  confirmAction.value = {
    title: '确认移除',
    message: '确认移除该文档？此操作不可恢复。',
    variant: 'danger',
    confirmText: '移除',
    successMsg: '文档已移除',
    action: async () => {
      const ok = await store.removeDocument(kbId, docId)
      if (ok) {
        await loadDetail()
      }
    }
  }
  confirmVisible.value = true
}

onMounted(async () => {
  await loadDetail()
  // 若进入页面时已有进行中的文档（例如从列表返回），也启动轮询
  schedulePoll()
})

onUnmounted(() => {
  cancelled = true
  stopPolling()
})
</script>

<style scoped>
.kb-detail {
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
  margin-bottom: 24px;
}

.back-link {
  background: none;
  border: none;
  color: var(--accent-link);
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
  margin-bottom: 8px;
  display: inline-block;
  transition: color var(--transition-fast);
}

.back-link:hover {
  color: var(--accent-hover);
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-info {
  flex: 1;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 600;
  font-family: var(--font-heading);
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: -0.01em;
}

.edit-meta-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-muted);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.edit-meta-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.page-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.meta-edit-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.meta-desc-row {
  margin-top: 8px;
}

.form-textarea {
  width: 100%;
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
  box-sizing: border-box;
}

.form-textarea::placeholder {
  color: var(--text-muted);
}

.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

/* ── Upload Section ── */

.upload-section {
  margin-bottom: 24px;
}

.upload-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.upload-area:hover {
  border-color: var(--accent);
  background: var(--accent-ultra-soft);
}

.file-input {
  display: none;
}

.upload-area.disabled {
  cursor: not-allowed;
  opacity: 0.5;
  border-color: var(--border);
}

.upload-area.disabled:hover {
  border-color: var(--border);
  background: transparent;
}

.upload-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.upload-text--disabled {
  color: var(--text-muted);
}

.upload-error {
  margin-top: 8px;
  font-size: 0.8125rem;
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
}

/* ── Document Section ── */

.doc-section {
  margin-top: 8px;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  font-family: var(--font-heading);
  color: var(--text);
  margin-bottom: 16px;
}

.doc-empty {
  text-align: center;
  padding: 40px 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.poll-timeout-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: #fef3c7; /* TODO(admin-rebrand): replace with --warning tokens */
  border: 1px solid #fcd34d; /* TODO(admin-rebrand): replace with --warning tokens */
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  color: #92400e; /* TODO(admin-rebrand): replace with --warning tokens */
}

/* ── Table Card ── */

.table-container {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-card);
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
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  background: var(--surface-tint);
  white-space: nowrap;
}

.data-table td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text);
}

.data-table tbody tr {
  transition: background var(--transition-fast);
}

.data-table tbody tr:hover {
  background: var(--surface-hover);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.cell-name {
  font-weight: 500;
}

.cell-secondary {
  color: var(--text-secondary);
}

.col-action {
  text-align: right;
}

/* ── Status Badge ── */

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
}

.status--pending {
  background: #f3f4f6;
  color: #6b7280;
}

.status--parsing {
  background: #fef3c7; /* TODO(admin-rebrand): replace with --warning token */
  color: #d97706; /* TODO(admin-rebrand): replace with --warning token */
}

.status--embedding {
  background: #dbeafe; /* TODO(admin-rebrand): replace with --info token */
  color: #2563eb; /* TODO(admin-rebrand): replace with --info token */
}

.status--completed {
  background: var(--accent-soft);
  color: var(--accent);
}

.status--failed {
  background: #fee2e2; /* TODO(admin-rebrand): replace with --danger token */
  color: #dc2626; /* TODO(admin-rebrand): replace with --danger token */
}

/* ── Action Links ── */

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
</style>
