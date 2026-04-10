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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import type { KBDetail } from '@/types/config'

const route = useRoute()
const router = useRouter()
const store = useConfigStore()

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
  const map: Record<string, string> = {
    pending: '待处理',
    parsing: '解析中',
    embedding: '向量化中',
    completed: '已完成',
    failed: '失败'
  }
  return map[status.toLowerCase()] ?? status
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
  } finally {
    uploading.value = false
    uploadingCount.value = 0
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
}

async function handleRemoveDoc(docId: number) {
  if (!confirm('确认移除该文档？此操作不可恢复。')) return
  const ok = await store.removeDocument(kbId, docId)
  if (ok) {
    await loadDetail()
  }
}

onMounted(loadDetail)
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
  margin-bottom: 24px;
}

.back-link {
  background: none;
  border: none;
  color: var(--color-accent-link, #26a86d);
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
  margin-bottom: 8px;
  display: inline-block;
  transition: color var(--transition-fast, 150ms ease);
}

.back-link:hover {
  color: var(--color-accent-hover, #1e8b5a);
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
  color: var(--color-text, #1a1d26);
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
  color: var(--color-text-muted, #8b90a0);
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 150ms ease);
}

.edit-meta-btn:hover {
  background: var(--color-surface-hover, #f3f4f8);
  color: var(--color-text, #1a1d26);
}

.page-desc {
  font-size: 0.875rem;
  color: var(--color-text-muted, #8b90a0);
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
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-sm, 6px);
  font-size: 0.875rem;
  line-height: 1.5;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1a1d26);
  resize: vertical;
  font-family: inherit;
  transition: all var(--transition-fast, 150ms ease);
  box-sizing: border-box;
}

.form-textarea::placeholder {
  color: var(--color-text-muted, #8b90a0);
}

.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent, #26a86d);
  box-shadow: var(--shadow-focus, 0 0 0 4px hsl(158 50% 92% / 0.5));
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
  border: 2px dashed var(--color-border, #e2e4ea);
  border-radius: var(--radius-md, 12px);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.upload-area:hover {
  border-color: var(--color-accent, #26a86d);
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
}

.file-input {
  display: none;
}

.upload-area.disabled {
  cursor: not-allowed;
  opacity: 0.5;
  border-color: var(--color-border, #e2e4ea);
}

.upload-area.disabled:hover {
  border-color: var(--color-border, #e2e4ea);
  background: transparent;
}

.upload-text {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #5f6577);
}

.upload-text--disabled {
  color: var(--color-text-muted, #8b90a0);
}

.upload-error {
  margin-top: 8px;
  font-size: 0.8125rem;
  color: #ef4444;
}

/* ── Document Section ── */

.doc-section {
  margin-top: 8px;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text, #1a1d26);
  margin-bottom: 16px;
}

.doc-empty {
  text-align: center;
  padding: 40px 0;
  font-size: 0.875rem;
  color: var(--color-text-muted, #8b90a0);
}

/* ── Table Card ── */

.table-container {
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

/* ── Status Badge ── */

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill, 999px);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
}

.status--pending {
  background: #f3f4f6;
  color: #6b7280;
}

.status--parsing {
  background: #fef3c7;
  color: #d97706;
}

.status--embedding {
  background: #dbeafe;
  color: #2563eb;
}

.status--completed {
  background: #dcfce7;
  color: #16a34a;
}

.status--failed {
  background: #fee2e2;
  color: #dc2626;
}

/* ── Action Links ── */

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
</style>
