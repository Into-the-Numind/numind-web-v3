<template>
  <MainLayout>
    <div class="kb-page">
      <!-- ========== List View ========== -->
      <div v-show="!currentDoc" class="kb-list-view">
        <div class="kb-page-header">
          <div class="kb-header-content">
            <h1 class="kb-title">知识库管理</h1>
            <p class="kb-subtitle">集中管理业务文档</p>
          </div>
          <div class="kb-header-actions">
            <div class="kb-search-box">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kb-search-icon"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                v-model="searchQuery"
                type="text"
                class="kb-search-input"
                placeholder="搜索文档..."
              />
            </div>
            <button class="btn-primary kb-upload-btn" @click="showUploadModal = true">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
              <span>创建知识库</span>
            </button>
          </div>
        </div>

        <!-- Loading skeleton -->
        <div v-if="isLoading && documents.length === 0" class="kb-grid">
          <div v-for="i in 8" :key="i" class="kb-card kb-skeleton-card">
            <div class="skeleton" style="width:56px;height:56px;border-radius:16px;margin-bottom:16px"></div>
            <div class="skeleton" style="width:60%;height:20px;margin-bottom:12px;border-radius:4px"></div>
            <div class="skeleton" style="width:100%;height:14px;margin-bottom:8px;border-radius:4px"></div>
            <div class="skeleton" style="width:80%;height:14px;border-radius:4px"></div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="filteredDocs.length === 0 && !isLoading && !isUploading" class="kb-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="kb-empty-icon"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H14.76a2 2 0 0 1 1.74 1.1L18 14"/><path d="M6 14h12v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4Z"/><path d="M12 10V4"/></svg>
          <h3>暂无知识文档</h3>
          <p>开始上传您的第一份业务文档</p>
        </div>

        <!-- Document grid -->
        <div v-else class="kb-grid">
          <div
            v-for="doc in filteredDocs"
            :key="doc.id"
            class="kb-card"
            :class="[getCardStatusClass(doc.status), { 'kb-card-disabled': !doc.is_enabled }]"
            @click="handleCardClick(doc)"
          >
            <div class="kb-status-line"></div>
            <div class="kb-card-header">
              <div class="kb-icon-container">
                <component :is="getDocIconComponent(doc.name)" />
              </div>
              <div class="kb-header-text">
                <div class="kb-card-title" :title="doc.name">{{ doc.name }}</div>
                <div class="kb-card-subtitle">
                  <span v-if="isProcessing(doc.status)" class="status-spinner"></span>
                  <span v-else-if="doc.status === 'COMPLETED'" class="status-dot status-dot-ok"></span>
                  <span v-else-if="doc.status === 'FAILED'" class="status-dot status-dot-err"></span>
                  <span v-else class="status-dot status-dot-default"></span>
                  {{ getStatusText(doc.status) }}
                </div>
              </div>
            </div>
            <div class="kb-desc-box">{{ doc.description || '暂无描述信息...' }}</div>
            <div class="kb-data-footer" @click.stop>
              <div class="kb-stats-group">
                <div class="kb-stat-pill" title="切片数量">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
                  <span>{{ doc.chunk_count || 0 }}</span>
                </div>
                <div class="kb-stat-pill" title="更新时间">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>{{ formatDateShort(doc.updated_at) }}</span>
                </div>
              </div>
              <button
                class="kb-toggle-btn"
                :class="{ 'kb-toggle-on': doc.is_enabled }"
                :title="doc.is_enabled ? '点击禁用' : '点击启用'"
                @click="toggleDocEnabled(doc, $event)"
              >
                <span class="kb-toggle-track">
                  <span class="kb-toggle-thumb"></span>
                </span>
              </button>
              <button class="kb-delete-btn" title="删除文档" @click="confirmDelete(doc)">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>

          <!-- Uploading skeleton card -->
          <div v-if="isUploading" class="kb-card kb-skeleton-card">
            <div class="skeleton" style="width:56px;height:56px;border-radius:16px;margin-bottom:16px"></div>
            <div class="skeleton" style="width:60%;height:20px;margin-bottom:12px;border-radius:4px"></div>
            <div class="skeleton" style="width:100%;height:14px;margin-bottom:8px;border-radius:4px"></div>
            <div class="skeleton" style="width:80%;height:14px;border-radius:4px"></div>
          </div>
        </div>
      </div>

      <!-- ========== Detail View ========== -->
      <div v-show="currentDoc" class="kb-detail-view">
        <header class="kb-detail-header">
          <div class="kb-header-top-row">
            <div class="kb-title-group">
              <button class="kb-back-btn" title="返回列表" @click="goBackToList">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              </button>
              <h1 class="kb-detail-title">{{ currentDoc?.name || '正在加载...' }}</h1>
            </div>
          </div>
          <div class="kb-header-bottom-row">
            <div class="kb-detail-meta">
              <span class="kb-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                <span>{{ formatDateFull(currentDoc?.created_at) }}</span>
              </span>
              <span class="kb-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
                <span>{{ formatFileSize(currentDoc?.file_size || 0) }}</span>
              </span>
              <span class="kb-meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>
                <span>{{ currentDoc?.chunk_count || 0 }} 切片</span>
              </span>
              <button class="kb-delete-link" @click="confirmDelete(currentDoc!)" title="删除文档">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                <span>删除</span>
              </button>
            </div>
          </div>
        </header>

        <!-- Chunks loading -->
        <div v-if="chunksLoading" class="kb-chunks-loading">
          <div class="loading-spinner"></div>
          <p>加载切片中...</p>
        </div>

        <!-- Chunks empty -->
        <div v-else-if="chunks.length === 0" class="kb-chunks-empty">
          <p>暂无切片数据</p>
        </div>

        <!-- Chunks list -->
        <div v-else class="kb-chunks-section">
          <!-- Chunk search -->
          <div class="kb-chunk-search-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kb-chunk-search-icon"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              v-model="chunkSearch"
              type="text"
              class="kb-chunk-search-input"
              placeholder="搜索切片内容或标签..."
            />
            <span class="kb-chunk-count">{{ filteredChunks.length }} / {{ chunks.length }} 切片</span>
          </div>

          <div class="kb-chunks-list">
            <div v-for="(chunk, idx) in filteredChunks" :key="chunk.id" class="kb-chunk-card">
              <div class="kb-chunk-header">
                <span class="kb-chunk-idx">#{{ idx + 1 }}</span>
                <div v-if="chunk.tags && chunk.tags.length" class="kb-chunk-tags">
                  <span v-for="tag in chunk.tags" :key="tag" class="kb-chunk-tag">{{ tag }}</span>
                </div>
                <button class="kb-chunk-copy-btn" title="复制内容" @click="copyChunkContent(chunk.content)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
              </div>
              <div v-if="chunk.summary" class="kb-chunk-summary">{{ chunk.summary }}</div>
              <div class="kb-chunk-content">{{ chunk.content }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== Upload Modal (Teleport) ========== -->
      <Teleport to="body">
        <div v-if="showUploadModal" class="modal-overlay" @click.self="closeUploadModal">
          <div class="modal-card upload-modal">
            <div class="modal-header">
              <h2>创建知识库</h2>
              <button class="modal-close" @click="closeUploadModal">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <form class="modal-body" @submit.prevent="handleUpload">
              <div class="form-group">
                <label class="form-label">知识库名称 <span class="required">*</span></label>
                <input v-model="uploadForm.name" type="text" class="form-input" placeholder="请输入知识库名称" required />
              </div>
              <div class="form-group">
                <label class="form-label">描述</label>
                <textarea v-model="uploadForm.description" class="form-textarea" placeholder="请输入描述（可选）" rows="3"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">选择文件 <span class="required">*</span></label>
                <div
                  class="upload-area"
                  :class="{ dragover: isDragover }"
                  @dragenter.prevent="isDragover = true"
                  @dragover.prevent="isDragover = true"
                  @dragleave.prevent="isDragover = false"
                  @drop.prevent="handleDrop"
                  @click="triggerFileInput"
                >
                  <div v-if="!selectedFile" class="upload-placeholder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
                    <p>拖拽文件到此处，或点击选择</p>
                    <span class="upload-hint">支持 PDF, DOC, DOCX, TXT, MD, HTML, XLSX, PPTX</span>
                  </div>
                  <div v-else class="file-preview-item">
                    <div class="file-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                    </div>
                    <div class="file-info">
                      <div class="file-name">{{ selectedFile.name }}</div>
                      <div class="file-size">{{ formatFileSize(selectedFile.size) }}</div>
                    </div>
                    <button type="button" class="remove-file-btn" @click.stop="selectedFile = null">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </div>
                </div>
                <input ref="fileInputRef" type="file" accept=".pdf,.doc,.docx,.txt,.md,.html,.xlsx,.pptx" style="display:none" @change="handleFileSelect" />
              </div>
              <div class="modal-footer">
                <button type="button" class="btn-cancel" @click="closeUploadModal">取消</button>
                <button type="submit" class="btn-submit" :disabled="!uploadForm.name || !selectedFile || isUploading">
                  {{ isUploading ? '上传中...' : '上传' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Teleport>

      <!-- ========== Delete Confirm Modal (Teleport) ========== -->
      <Teleport to="body">
        <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
          <div class="modal-card delete-modal">
            <div class="modal-header">
              <h2>确认删除</h2>
            </div>
            <div class="modal-body">
              <p>确定要删除知识库「<strong>{{ deleteTarget?.name }}</strong>」吗？此操作不可撤销。</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-cancel" @click="showDeleteModal = false">取消</button>
              <button type="button" class="btn-danger" @click="handleDelete">确认删除</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ========== Toast (Teleport) ========== -->
      <Teleport to="body">
        <Transition name="toast">
          <div v-if="toast.visible" class="kb-toast" :class="'toast-' + toast.type">
            {{ toast.message }}
          </div>
        </Transition>
      </Teleport>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, h } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import {
  fetchDocuments,
  uploadDocument,
  getDocument,
  updateDocument,
  deleteDocument as deleteDocApi,
  fetchChunks as fetchChunksApi,
  type KnowledgeDocument,
  type DocumentChunk
} from '@/api/knowledge'

// ── State ──────────────────────────────────────────────────────────
const documents = ref<KnowledgeDocument[]>([])
const currentDoc = ref<KnowledgeDocument | null>(null)
const chunks = ref<DocumentChunk[]>([])
const isLoading = ref(false)
const isUploading = ref(false)
const chunksLoading = ref(false)
const searchQuery = ref('')

// Chunk search
const chunkSearch = ref('')

// Upload modal
const showUploadModal = ref(false)
const uploadForm = ref({ name: '', description: '' })
const selectedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragover = ref(false)

// Delete modal
const showDeleteModal = ref(false)
const deleteTarget = ref<KnowledgeDocument | null>(null)

// Toast
const toast = ref({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' | 'warning' })
let toastTimer: ReturnType<typeof setTimeout> | null = null

// Polling
const statusPollers = new Map<number, ReturnType<typeof setInterval>>()

// ── Computed ───────────────────────────────────────────────────────
const filteredDocs = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return documents.value
  return documents.value.filter(
    (d) => (d.name || '').toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)
  )
})

const filteredChunks = computed(() => {
  const q = chunkSearch.value.toLowerCase().trim()
  if (!q) return chunks.value
  return chunks.value.filter((c) => {
    const content = (c.content || '').toLowerCase()
    const tags = (c.tags || []).join(' ').toLowerCase()
    const summary = (c.summary || '').toLowerCase()
    return content.includes(q) || tags.includes(q) || summary.includes(q)
  })
})

// ── Lifecycle ──────────────────────────────────────────────────────
onMounted(async () => {
  await loadDocuments()
})

onBeforeUnmount(() => {
  statusPollers.forEach((interval) => clearInterval(interval))
  statusPollers.clear()
})

// ── API: Load Documents ────────────────────────────────────────────
async function loadDocuments() {
  try {
    isLoading.value = true
    const res = await fetchDocuments()
    if (res.code === 200 || res.code === 0) {
      documents.value = (res.data || []).map((item: any) => ({
        ...item,
        type: item.type || 'FACT'
      }))
    }
  } catch (e: any) {
    console.error('[KnowledgeBase] 加载失败:', e)
    showToast('加载知识库列表失败', 'error')
  } finally {
    isLoading.value = false
  }
}

// ── API: Upload ────────────────────────────────────────────────────
async function handleUpload() {
  if (!uploadForm.value.name || !selectedFile.value) return

  // 先构建 FormData，再关闭弹窗（closeUploadModal 会清空 selectedFile）
  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('name', uploadForm.value.name)
  formData.append('description', uploadForm.value.description)

  closeUploadModal()
  isUploading.value = true

  try {

    const res = await uploadDocument(formData)
    if (res.code === 200 || res.code === 0) {
      showToast('上传成功，系统正在处理文件', 'success')
      await loadDocuments()

      if (res.data?.document_id) {
        startStatusPolling(res.data.document_id)
      }
    }
  } catch (e: any) {
    console.error('[KnowledgeBase] 上传失败:', e)
    showToast(`上传失败: ${e.message}`, 'error')
  } finally {
    isUploading.value = false
  }
}

// ── API: Delete ────────────────────────────────────────────────────
function confirmDelete(doc: KnowledgeDocument) {
  deleteTarget.value = doc
  showDeleteModal.value = true
}

async function handleDelete() {
  if (!deleteTarget.value) return
  const docId = deleteTarget.value.id
  showDeleteModal.value = false

  try {
    await deleteDocApi(docId)
    documents.value = documents.value.filter((d) => d.id !== docId)
    showToast('删除成功', 'success')

    if (currentDoc.value?.id === docId) {
      goBackToList()
    }
  } catch (e: any) {
    console.error('[KnowledgeBase] 删除失败:', e)
    showToast(`删除失败: ${e.message}`, 'error')
  }
}

// ── Detail View ────────────────────────────────────────────────────
function handleCardClick(doc: KnowledgeDocument) {
  if (isProcessing(doc.status)) {
    const statusTextMap: Record<string, string> = {
      PENDING: '等待处理',
      PARSING: '正在解析',
      SPLITTING: '正在切分',
      TAGGING: '正在打标',
      EMBEDDING: '向量化中'
    }
    showToast(`文档${statusTextMap[doc.status] || '正在处理'}，请稍后查看`, 'info')
    return
  }
  viewDetail(doc)
}

async function viewDetail(doc: KnowledgeDocument) {
  currentDoc.value = doc
  chunksLoading.value = true
  chunks.value = []
  chunkSearch.value = ''

  try {
    const res = await fetchChunksApi(doc.id)
    if (res.code === 200 || res.code === 0) {
      const rawChunks = res.data || []
      // Sort by number suffix in chunk ID (e.g., "15_0", "15_1", "15_2")
      rawChunks.sort((a: DocumentChunk, b: DocumentChunk) => {
        const getNum = (id: string) => {
          if (!id) return 0
          const parts = id.split('_')
          return parseInt(parts[parts.length - 1]) || 0
        }
        return getNum(a.id) - getNum(b.id)
      })
      chunks.value = rawChunks
    }
  } catch (e: any) {
    console.error('[KnowledgeBase] 加载切片失败:', e)
    showToast('加载切片失败', 'error')
  } finally {
    chunksLoading.value = false
  }
}

function goBackToList() {
  currentDoc.value = null
  chunks.value = []
  chunkSearch.value = ''
}

async function copyChunkContent(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    showToast('已复制到剪贴板', 'success')
  } catch {
    showToast('复制失败', 'error')
  }
}

async function toggleDocEnabled(doc: KnowledgeDocument, event: Event) {
  event.stopPropagation()
  const newEnabled = !doc.is_enabled
  const idx = documents.value.findIndex((d) => d.id === doc.id)
  // 乐观更新
  if (idx !== -1) {
    documents.value[idx] = { ...documents.value[idx], is_enabled: newEnabled }
  }
  try {
    await updateDocument(doc.id, { is_enabled: newEnabled })
    showToast(newEnabled ? '已启用' : '已禁用', 'success')
  } catch (e: any) {
    // API 失败，回滚 UI
    if (idx !== -1) {
      documents.value[idx] = { ...documents.value[idx], is_enabled: !newEnabled }
    }
    showToast(`操作失败: ${e.message}`, 'error')
  }
}

// ── Status Polling ─────────────────────────────────────────────────
function startStatusPolling(docId: number) {
  if (statusPollers.has(docId)) return

  const interval = setInterval(async () => {
    try {
      const res = await getDocument(docId)
      if (res.code === 200 || res.code === 0) {
        const newDoc = res.data
        const idx = documents.value.findIndex((d) => d.id === docId)
        if (idx !== -1) {
          documents.value[idx] = { ...documents.value[idx], ...newDoc }

          if (newDoc.status === 'COMPLETED' || newDoc.status === 'FAILED') {
            stopStatusPolling(docId)
            showToast(
              newDoc.status === 'COMPLETED' ? '文档处理完成，已就绪' : '文档处理失败',
              newDoc.status === 'COMPLETED' ? 'success' : 'error'
            )
          }
        } else {
          stopStatusPolling(docId)
        }
      }
    } catch {
      stopStatusPolling(docId)
    }
  }, 3000)

  statusPollers.set(docId, interval)
}

function stopStatusPolling(docId: number) {
  const interval = statusPollers.get(docId)
  if (interval) {
    clearInterval(interval)
    statusPollers.delete(docId)
  }
}

// ── Upload Helpers ─────────────────────────────────────────────────
function triggerFileInput() {
  if (!selectedFile.value) {
    fileInputRef.value?.click()
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    selectedFile.value = input.files[0]
  }
}

function handleDrop(e: DragEvent) {
  isDragover.value = false
  if (e.dataTransfer?.files?.[0]) {
    selectedFile.value = e.dataTransfer.files[0]
  }
}

function closeUploadModal() {
  showUploadModal.value = false
  uploadForm.value = { name: '', description: '' }
  selectedFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// ── Helpers ────────────────────────────────────────────────────────
const processingStatuses = ['PENDING', 'PARSING', 'SPLITTING', 'TAGGING', 'EMBEDDING']

function isProcessing(status: string) {
  return processingStatuses.includes(status)
}

function getCardStatusClass(status: string) {
  if (isProcessing(status)) return 'status-embedding'
  if (status === 'FAILED') return 'status-error'
  return ''
}

function getStatusText(status: string) {
  const map: Record<string, string> = {
    PENDING: '等待处理',
    PARSING: '正在解析...',
    SPLITTING: '正在切分...',
    TAGGING: '正在打标...',
    EMBEDDING: '向量化中...',
    COMPLETED: '就绪',
    FAILED: '处理失败'
  }
  return map[status] || status
}

function getDocIconComponent(name: string) {
  const ext = (name || '').split('.').pop()?.toLowerCase() || ''
  // All use simple file SVG icons with different styling
  if (['pdf'].includes(ext)) {
    return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
      h('path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }),
      h('path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }),
      h('path', { d: 'M10 9H8' }), h('path', { d: 'M16 13H8' }), h('path', { d: 'M16 17H8' })
    ])
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
      h('path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }),
      h('path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }),
      h('path', { d: 'M8 13h2' }), h('path', { d: 'M14 13h2' }),
      h('path', { d: 'M8 17h2' }), h('path', { d: 'M14 17h2' })
    ])
  }
  // Default document icon
  return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }),
    h('path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' })
  ])
}

function formatDateShort(dateStr?: string) {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}`
}

function formatDateFull(dateStr?: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  })
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success', duration = 3000) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { visible: true, message, type }
  toastTimer = setTimeout(() => { toast.value.visible = false }, duration)
}
</script>

<style scoped>
/* ── Page ─────────────────────────────────────────────────────── */
.kb-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0;
}

/* ── Page Header ──────────────────────────────────────────────── */
.kb-page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  gap: 24px;
  flex-wrap: wrap;
}

.kb-title {
  font-size: 28px;
  font-weight: 800;
  color: hsl(150, 10%, 15%);
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}

.kb-subtitle {
  font-size: 14px;
  color: hsl(150, 10%, 45%);
  margin: 0;
}

.kb-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.kb-search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.kb-search-icon {
  position: absolute;
  left: 12px;
  color: hsl(150, 10%, 55%);
  pointer-events: none;
}

.kb-search-input {
  width: 220px;
  height: 40px;
  padding: 0 12px 0 38px;
  border-radius: 10px;
  border: 1px solid hsl(150, 15%, 88%);
  background: hsl(150, 20%, 98%);
  font-size: 13.5px;
  color: hsl(150, 10%, 15%);
  transition: all 0.2s;
  outline: none;
}

.kb-search-input:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158, 50%, 92%);
  background: #fff;
}

.kb-upload-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  background: hsl(158, 64%, 40%);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
}

.kb-upload-btn:hover {
  background: hsl(158, 64%, 35%);
}

/* ── Grid ─────────────────────────────────────────────────────── */
.kb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

/* ── Card ─────────────────────────────────────────────────────── */
.kb-card {
  background: #fff;
  border-radius: 20px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
  padding: 24px;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.kb-card:hover {
  box-shadow: 0 12px 24px rgba(16, 185, 129, 0.12), 0 4px 10px rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.3);
}

.kb-card.status-embedding {
  border-color: rgba(16, 185, 129, 0.3);
}

.kb-card.status-error {
  border-color: rgba(239, 68, 68, 0.2);
}

.kb-status-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: transparent;
  border-radius: 20px 20px 0 0;
}

.kb-card.status-embedding .kb-status-line {
  background: linear-gradient(90deg, hsl(158, 64%, 50%), hsl(158, 64%, 70%));
}

.kb-card.status-error .kb-status-line {
  background: #ef4444;
}

.kb-card-header {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.kb-icon-container {
  width: 56px;
  height: 56px;
  min-width: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, #f6f8fc 0%, #eef2f6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
  color: hsl(158, 64%, 50%);
}

.kb-header-text {
  flex: 1;
  min-width: 0;
}

.kb-card-title {
  font-size: 17px;
  font-weight: 700;
  color: hsl(150, 10%, 15%);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kb-card-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: hsl(150, 10%, 45%);
}

.kb-card.status-embedding .kb-card-subtitle {
  color: hsl(158, 64%, 40%);
  font-weight: 500;
}

/* Status indicators */
.status-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(16, 185, 129, 0.3);
  border-top-color: hsl(158, 64%, 40%);
  border-radius: 50%;
  animation: kb-spin 1s linear infinite;
  display: inline-block;
}

@keyframes kb-spin {
  to { transform: rotate(360deg); }
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot-ok { background: #10b981; }
.status-dot-err { background: #ef4444; }
.status-dot-default { background: #94a3b8; }

.kb-desc-box {
  flex: 1;
  font-size: 13.5px;
  color: hsl(150, 10%, 45%);
  line-height: 1.6;
  margin-bottom: 16px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kb-data-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.kb-stats-group {
  display: flex;
  gap: 12px;
}

.kb-stat-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: hsl(150, 10%, 50%);
}

.kb-stat-pill svg {
  color: hsl(150, 10%, 60%);
}

.kb-delete-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(150, 10%, 60%);
  padding: 8px;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-delete-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.06);
}

/* Toggle switch */
.kb-toggle-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}

.kb-toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: hsl(150, 10%, 80%);
  position: relative;
  transition: background 0.2s;
  display: block;
}

.kb-toggle-on .kb-toggle-track {
  background: hsl(158, 64%, 50%);
}

.kb-toggle-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  display: block;
}

.kb-toggle-on .kb-toggle-thumb {
  transform: translateX(16px);
}

/* Disabled card */
.kb-card-disabled {
  opacity: 0.55;
}

.kb-card-disabled .kb-card-title::after {
  content: ' (已禁用)';
  font-size: 12px;
  color: hsl(150, 10%, 55%);
  font-weight: 400;
}

/* ── Skeleton ─────────────────────────────────────────────────── */
.kb-skeleton-card {
  cursor: default !important;
  pointer-events: none;
}

.skeleton {
  background: linear-gradient(90deg, hsl(150, 15%, 93%) 25%, hsl(150, 15%, 88%) 50%, hsl(150, 15%, 93%) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Empty State ──────────────────────────────────────────────── */
.kb-empty {
  padding: 100px 0;
  text-align: center;
}

.kb-empty-icon {
  color: hsl(150, 10%, 60%);
  margin-bottom: 16px;
}

.kb-empty h3 {
  font-size: 18px;
  color: hsl(150, 10%, 15%);
  margin: 0 0 8px;
}

.kb-empty p {
  font-size: 14px;
  color: hsl(150, 10%, 45%);
  margin: 0;
}

/* ── Detail View ──────────────────────────────────────────────── */
.kb-detail-view {
  animation: detailFadeIn 0.3s ease-out;
}

@keyframes detailFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.kb-detail-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}

.kb-header-top-row {
  display: flex;
  align-items: center;
}

.kb-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.kb-back-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid hsl(150, 15%, 88%);
  border-radius: 12px;
  color: hsl(150, 10%, 45%);
  cursor: pointer;
  transition: all 0.2s;
}

.kb-back-btn:hover {
  color: hsl(158, 64%, 50%);
  border-color: hsl(158, 64%, 50%);
  background: hsl(158, 50%, 95%);
  transform: translateX(-2px);
}

.kb-detail-title {
  font-size: 24px;
  font-weight: 800;
  color: hsl(150, 10%, 15%);
  margin: 0;
}

.kb-header-bottom-row {
  padding-left: 52px;
}

.kb-detail-meta {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.kb-meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: hsl(150, 10%, 45%);
}

.kb-meta-item svg {
  color: hsl(150, 10%, 55%);
}

.kb-delete-link {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #ef4444;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.kb-delete-link:hover {
  background: rgba(239, 68, 68, 0.06);
}

/* Chunks loading */
.kb-chunks-loading {
  padding: 60px;
  text-align: center;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid hsl(150, 15%, 88%);
  border-top-color: hsl(158, 64%, 50%);
  border-radius: 50%;
  animation: kb-spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

.kb-chunks-loading p,
.kb-chunks-empty p {
  font-size: 14px;
  color: hsl(150, 10%, 45%);
}

.kb-chunks-empty {
  padding: 80px 0;
  text-align: center;
  background: #fff;
  border-radius: 20px;
  border: 1px dashed hsl(150, 15%, 85%);
}

/* Chunk search */
.kb-chunks-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.kb-chunk-search-box {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
}

.kb-chunk-search-icon {
  position: absolute;
  left: 12px;
  color: hsl(150, 10%, 55%);
  pointer-events: none;
}

.kb-chunk-search-input {
  flex: 1;
  height: 40px;
  padding: 0 12px 0 38px;
  border-radius: 10px;
  border: 1px solid hsl(150, 15%, 88%);
  background: #fff;
  font-size: 13.5px;
  color: hsl(150, 10%, 15%);
  transition: all 0.2s;
  outline: none;
}

.kb-chunk-search-input:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158, 50%, 92%);
}

.kb-chunk-count {
  font-size: 13px;
  color: hsl(150, 10%, 50%);
  white-space: nowrap;
}

/* Chunks list */
.kb-chunks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kb-chunk-card {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 16px;
  padding: 20px 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.kb-chunk-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.kb-chunk-idx {
  font-size: 13px;
  font-weight: 700;
  color: hsl(158, 64%, 40%);
  font-family: var(--font-mono, 'SF Mono', monospace);
}

.kb-chunk-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.kb-chunk-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 24px;
  font-size: 12px;
  background: hsl(158, 50%, 95%);
  color: hsl(158, 64%, 30%);
  border: 1px solid hsl(158, 40%, 88%);
}

.kb-chunk-copy-btn {
  margin-left: auto;
  background: transparent;
  border: none;
  color: hsl(150, 10%, 60%);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-chunk-copy-btn:hover {
  background: hsl(158, 50%, 95%);
  color: hsl(158, 64%, 40%);
}

.kb-chunk-summary {
  font-size: 13px;
  color: hsl(150, 10%, 45%);
  margin-bottom: 12px;
  padding: 8px 12px;
  background: hsl(150, 20%, 98%);
  border-radius: 6px;
  border-left: 3px solid hsl(158, 64%, 50%);
  line-height: 1.6;
}

.kb-chunk-content {
  font-size: 14px;
  line-height: 1.7;
  color: hsl(150, 10%, 25%);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Modal ────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: modalFadeIn 0.2s ease-out;
}

@keyframes modalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 520px;
  animation: modalScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalScaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid hsl(150, 15%, 92%);
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: hsl(150, 10%, 15%);
  margin: 0;
}

.modal-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(150, 10%, 50%);
  padding: 4px;
  border-radius: 6px;
  transition: color 0.2s;
}

.modal-close:hover {
  color: hsl(150, 10%, 25%);
}

.modal-body {
  padding: 24px;
}

.modal-body p {
  font-size: 14px;
  color: hsl(150, 10%, 35%);
  line-height: 1.6;
  margin: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 24px 24px;
}

/* Form */
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: hsl(150, 10%, 25%);
  margin-bottom: 8px;
}

.required {
  color: #ef4444;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid hsl(150, 15%, 88%);
  border-radius: 10px;
  font-size: 14px;
  color: hsl(150, 10%, 15%);
  background: hsl(150, 20%, 98%);
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158, 50%, 92%);
  background: #fff;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

/* Upload area */
.upload-area {
  border: 2px dashed hsl(150, 15%, 85%);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: hsl(150, 20%, 99%);
}

.upload-area:hover,
.upload-area.dragover {
  border-color: rgba(16, 185, 129, 0.6);
  background: linear-gradient(135deg, hsl(150, 60%, 96%), hsl(150, 50%, 95%));
}

.upload-placeholder svg {
  color: hsl(150, 10%, 60%);
  margin-bottom: 12px;
}

.upload-placeholder p {
  font-size: 14px;
  color: hsl(150, 10%, 35%);
  margin: 0 0 4px;
}

.upload-hint {
  font-size: 12px;
  color: hsl(150, 10%, 55%);
}

.file-preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}

.file-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: hsl(158, 50%, 95%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: hsl(150, 10%, 15%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 12px;
  color: hsl(150, 10%, 50%);
}

.remove-file-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(150, 10%, 55%);
  padding: 4px;
  border-radius: 4px;
}

.remove-file-btn:hover {
  color: #ef4444;
}

/* Buttons */
.btn-cancel {
  padding: 8px 20px;
  border-radius: 10px;
  border: 1px solid hsl(150, 15%, 85%);
  background: #fff;
  font-size: 14px;
  color: hsl(150, 10%, 35%);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: hsl(150, 15%, 96%);
}

.btn-submit {
  padding: 8px 24px;
  border-radius: 10px;
  border: none;
  background: hsl(158, 64%, 40%);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-submit:hover:not(:disabled) {
  background: hsl(158, 64%, 35%);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  padding: 8px 24px;
  border-radius: 10px;
  border: none;
  background: #ef4444;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-danger:hover {
  background: #dc2626;
}

.delete-modal .modal-body {
  padding-bottom: 8px;
}

/* ── Toast ────────────────────────────────────────────────────── */
.kb-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}

.toast-success {
  background: hsl(158, 64%, 40%);
  color: #fff;
}

.toast-error {
  background: #ef4444;
  color: #fff;
}

.toast-info {
  background: hsl(150, 10%, 25%);
  color: #fff;
}

.toast-warning {
  background: #f59e0b;
  color: #fff;
}

.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.2s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-16px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}

/* ── Responsive ───────────────────────────────────────────────── */
@media (max-width: 768px) {
  .kb-page-header {
    flex-direction: column;
  }

  .kb-header-actions {
    width: 100%;
  }

  .kb-search-input {
    flex: 1;
    width: auto;
  }

  .kb-grid {
    grid-template-columns: 1fr;
  }

  .kb-header-bottom-row {
    padding-left: 0;
  }
}
</style>
