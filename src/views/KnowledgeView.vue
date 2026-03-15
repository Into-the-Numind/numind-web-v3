<template>
  <MainLayout>
    <div class="kb-page">
      <!-- ========== List View ========== -->
      <div v-show="!currentDoc" class="kb-list-view">
        <!-- 加载状态 -->
        <div v-if="isLoading && documents.length === 0" class="loading-state">
          <div class="loading-spinner"></div>
          <div class="loading-text">加载知识库...</div>
        </div>

        <template v-else>
          <!-- Hero 区域 -->
          <div class="hero-section">
            <div class="hero-content">
              <h1 class="hero-title">知识库管理</h1>
              <p class="hero-subtitle">集中管理业务文档，支持智能切分与向量检索</p>
            </div>
            <button class="hero-action-btn" @click="showUploadModal = true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
                <path d="M12 12v9"/><path d="m16 16-4-4-4 4"/>
              </svg>
              创建知识库
            </button>
          </div>

          <!-- 工具栏 -->
          <div class="toolbar">
            <div class="filter-bar">
              <button
                class="filter-btn"
                :class="{ active: activeFilter === 'all' }"
                @click="activeFilter = 'all'"
              >
                全部
                <span class="filter-count">{{ documents.length }}</span>
              </button>
              <button
                class="filter-btn"
                :class="{ active: activeFilter === 'completed' }"
                @click="activeFilter = 'completed'"
              >
                <span class="filter-dot completed"></span>
                已就绪
                <span class="filter-count">{{ completedCount }}</span>
              </button>
              <button
                class="filter-btn"
                :class="{ active: activeFilter === 'processing' }"
                @click="activeFilter = 'processing'"
              >
                <span class="filter-dot processing"></span>
                处理中
                <span class="filter-count">{{ processingCount }}</span>
              </button>
              <button
                class="filter-btn"
                :class="{ active: activeFilter === 'failed' }"
                @click="activeFilter = 'failed'"
              >
                <span class="filter-dot failed"></span>
                已失败
                <span class="filter-count">{{ failedCount }}</span>
              </button>
            </div>
            <div class="search-box">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                v-model="searchQuery"
                type="text"
                class="search-input"
                placeholder="搜索文档名称..."
              />
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="documents.length === 0" class="empty-state">
            <div class="empty-icon-wrapper">
              <svg viewBox="0 0 48 48" fill="none" class="empty-icon">
                <path d="M12 14l1.5-2.9A2 2 0 0 1 15.24 10h17.52a2 2 0 0 1 1.74 1.1L36 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M12 14h24v16a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V14Z" stroke="currentColor" stroke-width="2"/>
                <path d="M24 20v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M20 24h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="empty-title">暂无知识文档</div>
            <div class="empty-desc">上传您的第一份业务文档，开始构建知识库</div>
            <button class="empty-action" @click="showUploadModal = true">创建知识库</button>
          </div>

          <!-- 筛选后无结果 -->
          <div v-else-if="filteredDocs.length === 0" class="empty-state compact">
            <div class="empty-title">没有匹配的文档</div>
            <div class="empty-desc">切换筛选条件或修改搜索关键词</div>
          </div>

          <!-- 表格容器 -->
          <div v-else class="table-container">
            <div class="table-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-check">
                      <span
                        class="checkbox-mark"
                        :class="{ checked: isAllSelected }"
                        @click="toggleSelectAll"
                      >
                        <svg v-if="isAllSelected" viewBox="0 0 12 12" fill="none" width="12" height="12">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </span>
                    </th>
                    <th class="col-doc">文档信息</th>
                    <th>状态</th>
                    <th class="col-desc">描述</th>
                    <th>切片数</th>
                    <th>文件类型</th>
                    <th>文件大小</th>
                    <th class="col-action">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="doc in filteredDocs"
                    :key="doc.id"
                    :class="{
                      'row-selected': selectedIds.has(doc.id),
                      'row-disabled': !doc.is_enabled
                    }"
                    @click="handleRowClick(doc)"
                  >
                    <td class="col-check" @click.stop>
                      <span
                        class="checkbox-mark"
                        :class="{ checked: selectedIds.has(doc.id) }"
                        @click="toggleSelect(doc.id)"
                      >
                        <svg v-if="selectedIds.has(doc.id)" viewBox="0 0 12 12" fill="none" width="12" height="12">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </span>
                    </td>
                    <td class="col-doc">
                      <div class="doc-info">
                        <div class="doc-icon" :class="getFileTypeClass(doc.name)">
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                            <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                          </svg>
                        </div>
                        <div class="doc-name" :title="doc.name">{{ doc.name }}</div>
                      </div>
                    </td>
                    <td>
                      <span class="status-badge" :class="getStatusClass(doc.status)">
                        <span v-if="isProcessing(doc.status)" class="status-spinner-sm"></span>
                        <span v-else class="status-dot-sm"></span>
                        {{ getStatusText(doc.status) }}
                      </span>
                    </td>
                    <td class="col-desc">
                      <span class="cell-secondary cell-desc" :title="doc.description">{{ doc.description || '暂无描述' }}</span>
                    </td>
                    <td>
                      <span class="cell-metric">{{ doc.chunk_count || 0 }}</span>
                    </td>
                    <td>
                      <span class="cell-secondary">{{ getFileTypeLabel(doc.name) }}</span>
                    </td>
                    <td>
                      <span class="cell-secondary">{{ formatFileSize(doc.file_size) }}</span>
                    </td>
                    <td class="col-action" @click.stop>
                      <button
                        class="action-btn-delete"
                        title="删除文档"
                        @click="confirmDelete(doc)"
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                  <!-- 上传中骨架行 -->
                  <tr v-if="isUploading" class="row-skeleton">
                    <td class="col-check"></td>
                    <td class="col-doc"><div class="skeleton" style="width:160px;height:16px;border-radius:4px"></div></td>
                    <td><div class="skeleton" style="width:60px;height:16px;border-radius:4px"></div></td>
                    <td class="col-desc"><div class="skeleton" style="width:120px;height:16px;border-radius:4px"></div></td>
                    <td><div class="skeleton" style="width:30px;height:16px;border-radius:4px"></div></td>
                    <td><div class="skeleton" style="width:50px;height:16px;border-radius:4px"></div></td>
                    <td><div class="skeleton" style="width:50px;height:16px;border-radius:4px"></div></td>
                    <td class="col-action"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <!-- ========== Detail View ========== -->
      <div v-show="currentDoc" class="kb-detail-view">
        <!-- Header -->
        <div class="hero-section">
          <div class="hero-content">
            <div class="detail-title-row">
              <button class="back-btn" title="返回列表" @click="goBackToList">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
                </svg>
              </button>
              <h1 class="hero-title">{{ currentDoc?.name || '正在加载...' }}</h1>
            </div>
            <p class="hero-subtitle">{{ currentDoc?.description || '暂无描述' }}</p>
          </div>
          <button class="delete-action-btn" @click="confirmDelete(currentDoc!)" title="删除文档">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
            删除
          </button>
        </div>

        <!-- 文档信息卡片 -->
        <div class="detail-info-grid">
          <div class="info-card">
            <span class="info-label">文件类型</span>
            <span class="info-value">{{ getFileTypeLabel(currentDoc?.name || '') }}</span>
          </div>
          <div class="info-card">
            <span class="info-label">文件大小</span>
            <span class="info-value">{{ formatFileSize(currentDoc?.file_size || 0) }}</span>
          </div>
          <div class="info-card">
            <span class="info-label">切片数量</span>
            <span class="info-value">{{ currentDoc?.chunk_count || 0 }}</span>
          </div>
          <div class="info-card">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatDateFull(currentDoc?.created_at) }}</span>
          </div>
        </div>

        <!-- Chunks loading -->
        <div v-if="chunksLoading" class="loading-state compact">
          <div class="loading-spinner"></div>
          <div class="loading-text">加载切片中...</div>
        </div>

        <!-- Chunks empty -->
        <div v-else-if="chunks.length === 0" class="empty-state compact">
          <div class="empty-title">暂无切片数据</div>
          <div class="empty-desc">文档处理完成后将显示切片内容</div>
        </div>

        <!-- Chunks list -->
        <div v-else class="chunks-section">
          <!-- 切片工具栏 -->
          <div class="chunk-toolbar">
            <h2 class="chunk-section-title">文档切片</h2>
            <div class="chunk-toolbar-right">
              <div class="search-box">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <input
                  v-model="chunkSearch"
                  type="text"
                  class="search-input"
                  placeholder="搜索切片内容或标签..."
                />
              </div>
              <span class="chunk-count">{{ filteredChunks.length }} / {{ chunks.length }}</span>
            </div>
          </div>

          <!-- 切片列表容器 -->
          <div class="chunks-container">
            <div v-for="(chunk, idx) in filteredChunks" :key="chunk.id" class="chunk-item">
              <div class="chunk-header">
                <span class="chunk-idx">#{{ idx + 1 }}</span>
                <div v-if="chunk.tags && chunk.tags.length" class="chunk-tags">
                  <span v-for="tag in chunk.tags" :key="tag" class="chunk-tag">{{ tag }}</span>
                </div>
                <button class="chunk-copy-btn" title="复制内容" @click="copyChunkContent(chunk.content)">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>
                </button>
              </div>
              <div v-if="chunk.summary" class="chunk-summary">{{ chunk.summary }}</div>
              <div class="chunk-content">{{ chunk.content }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== Batch manage bar ========== -->
      <Transition name="bar-slide">
        <div v-if="selectedIds.size > 0 && !currentDoc" class="manage-bar">
          <span class="manage-count">已选 {{ selectedIds.size }} 项</span>
          <button class="manage-select-all" @click="toggleSelectAll">
            {{ isAllSelected ? '取消全选' : '全选' }}
          </button>
          <button
            class="manage-batch-delete"
            @click="handleBatchDelete"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            批量删除
          </button>
        </div>
      </Transition>

      <!-- ========== Upload Modal ========== -->
      <Teleport to="body">
        <Transition name="overlay-fade">
          <div v-if="showUploadModal" class="modal-overlay" @mousedown.self="closeUploadModal">
            <div class="modal-dialog">
              <div class="modal-header">
                <h2 class="modal-title">创建知识库</h2>
                <button class="modal-close" @click="closeUploadModal">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
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
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/>
                      </svg>
                      <p>拖拽文件到此处，或点击选择</p>
                      <span class="upload-hint">支持 PDF, DOC, DOCX, TXT, MD, HTML, XLSX, PPTX</span>
                    </div>
                    <div v-else class="file-preview-item">
                      <div class="file-icon-sm">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                        </svg>
                      </div>
                      <div class="file-info">
                        <div class="file-name">{{ selectedFile.name }}</div>
                        <div class="file-size">{{ formatFileSize(selectedFile.size) }}</div>
                      </div>
                      <button type="button" class="remove-file-btn" @click.stop="selectedFile = null">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                    </div>
                  </div>
                  <input ref="fileInputRef" type="file" accept=".pdf,.doc,.docx,.txt,.md,.html,.xlsx,.pptx" style="display:none" @change="handleFileSelect" />
                </div>
              </form>
              <div class="modal-footer">
                <button type="button" class="btn-cancel" @click="closeUploadModal">取消</button>
                <button type="button" class="btn-primary" :disabled="!uploadForm.name || !selectedFile || isUploading" @click="handleUpload">
                  {{ isUploading ? '上传中...' : '上传' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ========== Delete Confirm ========== -->
      <Teleport to="body">
        <Transition name="overlay-fade">
          <div v-if="confirmVisible" class="modal-overlay" @click.self="confirmVisible = false">
            <div class="confirm-dialog">
              <div class="confirm-icon-wrapper">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div class="confirm-title">{{ confirmTitle }}</div>
              <div class="confirm-message">{{ confirmMessage }}</div>
              <div class="confirm-buttons">
                <button class="btn-cancel" @click="confirmVisible = false">取消</button>
                <button class="btn-danger" @click="onConfirm">确认删除</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ========== Toast ========== -->
      <Teleport to="body">
        <Transition name="toast-fade">
          <div v-if="toast.visible" class="toast" :class="toast.type">
            <svg v-if="toast.type === 'success'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <svg v-else-if="toast.type === 'error'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            {{ toast.message }}
          </div>
        </Transition>
      </Teleport>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import {
  fetchDocuments,
  uploadDocument,
  getDocument,

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
const activeFilter = ref<'all' | 'completed' | 'processing' | 'failed'>('all')
const selectedIds = ref<Set<number>>(new Set())

// Chunk search
const chunkSearch = ref('')

// Upload modal
const showUploadModal = ref(false)
const uploadForm = ref({ name: '', description: '' })
const selectedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragover = ref(false)

// Confirm dialog
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
let confirmCallback: (() => void) | null = null

// Toast
const toast = ref({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'info' })
let toastTimer: ReturnType<typeof setTimeout> | null = null

// Polling
const statusPollers = new Map<number, ReturnType<typeof setInterval>>()

// ── Computed ───────────────────────────────────────────────────────
const processingStatuses = ['PENDING', 'PARSING', 'SPLITTING', 'TAGGING', 'EMBEDDING']

const completedCount = computed(() => documents.value.filter((d) => d.status === 'COMPLETED').length)
const processingCount = computed(() => documents.value.filter((d) => processingStatuses.includes(d.status)).length)
const failedCount = computed(() => documents.value.filter((d) => d.status === 'FAILED').length)
const filteredDocs = computed(() => {
  let docs = documents.value

  // Filter by status
  if (activeFilter.value === 'completed') {
    docs = docs.filter((d) => d.status === 'COMPLETED')
  } else if (activeFilter.value === 'processing') {
    docs = docs.filter((d) => processingStatuses.includes(d.status))
  } else if (activeFilter.value === 'failed') {
    docs = docs.filter((d) => d.status === 'FAILED')
  }

  // Filter by search
  const q = searchQuery.value.toLowerCase().trim()
  if (q) {
    docs = docs.filter(
      (d) => (d.name || '').toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)
    )
  }

  return docs
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

const isAllSelected = computed(() => {
  return filteredDocs.value.length > 0 && filteredDocs.value.every((d) => selectedIds.value.has(d.id))
})

// ── Lifecycle ──────────────────────────────────────────────────────
onMounted(async () => {
  await loadDocuments()
})

onBeforeUnmount(() => {
  statusPollers.forEach((interval) => clearInterval(interval))
  statusPollers.clear()
  if (toastTimer) clearTimeout(toastTimer)
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
  showConfirm('确认删除', `确定要删除知识库「${doc.name}」吗？此操作不可恢复。`, async () => {
    try {
      await deleteDocApi(doc.id)
      documents.value = documents.value.filter((d) => d.id !== doc.id)
      selectedIds.value.delete(doc.id)
      showToast('删除成功', 'success')

      if (currentDoc.value?.id === doc.id) {
        goBackToList()
      }
    } catch (e: any) {
      console.error('[KnowledgeBase] 删除失败:', e)
      showToast(`删除失败: ${e.message}`, 'error')
    }
  })
}

function handleBatchDelete() {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  showConfirm(
    '批量删除',
    `确定要删除选中的 ${ids.length} 个知识库吗？此操作不可恢复。`,
    async () => {
      try {
        await Promise.all(ids.map((id) => deleteDocApi(id)))
        const idSet = new Set(ids)
        documents.value = documents.value.filter((d) => !idSet.has(d.id))
        selectedIds.value = new Set()
        showToast(`已删除 ${ids.length} 个知识库`)
      } catch (e: any) {
        showToast(e.message || '批量删除失败', 'error')
      }
    }
  )
}

// ── Detail View ────────────────────────────────────────────────────
function handleRowClick(doc: KnowledgeDocument) {
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

// ── Selection ──────────────────────────────────────────────────────
function toggleSelect(id: number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredDocs.value.map((d) => d.id))
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
function isProcessing(status: string) {
  return processingStatuses.includes(status)
}

function getStatusClass(status: string) {
  if (isProcessing(status)) return 'status-processing'
  if (status === 'FAILED') return 'status-failed'
  return 'status-completed'
}

function getStatusText(status: string) {
  const map: Record<string, string> = {
    PENDING: '等待处理',
    PARSING: '正在解析',
    SPLITTING: '正在切分',
    TAGGING: '正在打标',
    EMBEDDING: '向量化中',
    COMPLETED: '就绪',
    FAILED: '处理失败'
  }
  return map[status] || status
}

function getFileTypeLabel(name: string) {
  const parts = (name || '').split('.')
  if (parts.length < 2) return '未知'
  const ext = parts.pop()!.toLowerCase()
  const map: Record<string, string> = {
    pdf: 'pdf', doc: 'word', docx: 'word',
    xls: 'excel', xlsx: 'excel', csv: 'csv',
    ppt: 'ppt', pptx: 'ppt',
    txt: 'txt', md: 'markdown', html: 'html'
  }
  return map[ext] || ext || '未知'
}

function getFileTypeClass(name: string) {
  const ext = (name || '').split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return 'file-pdf'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'file-excel'
  if (['doc', 'docx'].includes(ext)) return 'file-word'
  if (['pptx', 'ppt'].includes(ext)) return 'file-ppt'
  return 'file-default'
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

function showConfirm(title: string, message: string, cb: () => void) {
  confirmTitle.value = title
  confirmMessage.value = message
  confirmCallback = cb
  confirmVisible.value = true
}

function onConfirm() {
  confirmVisible.value = false
  confirmCallback?.()
  confirmCallback = null
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { visible: true, message, type }
  toastTimer = setTimeout(() => { toast.value.visible = false }, duration)
}
</script>

<style scoped>
.kb-page {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 100px;
}

/* ===== Hero Section ===== */
.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 28px;
  padding: 20px 0 0;
}

.hero-content { flex: 1; }

.hero-title {
  font-family: var(--font-sans);
  font-size: 36px;
  font-weight: 700;
  color: hsl(155, 30%, 15%);
  line-height: 1.3;
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}

.hero-subtitle {
  font-size: 15px;
  color: hsl(158, 20%, 45%);
  margin: 0;
}

.hero-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 4px 16px hsl(158 64% 50% / 0.25);
}

.hero-action-btn:hover {
  background: var(--accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px hsl(158 64% 50% / 0.3);
}

/* ===== Toolbar ===== */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
}

/* ===== Filter Bar ===== */
.filter-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  user-select: none;
}

.filter-btn:hover {
  transform: translateY(-1px);
  border-color: hsl(158, 40%, 82%);
  color: hsl(155, 25%, 30%);
}

.filter-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 4px 16px hsl(158 64% 50% / 0.3);
}

.filter-btn.active .filter-count { background: hsla(0, 0%, 100%, 0.25); color: #fff; }
.filter-btn.active .filter-dot { background: #fff; box-shadow: none; }

.filter-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.filter-dot.completed { background: hsl(158, 64%, 45%); }
.filter-dot.processing { background: hsl(45, 90%, 50%); box-shadow: 0 0 5px hsl(45 90% 50% / 0.4); animation: dot-pulse 2s ease-in-out infinite; }
.filter-dot.failed { background: hsl(0, 70%, 55%); }

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.filter-count {
  padding: 1px 7px;
  border-radius: 6px;
  background: hsl(150, 15%, 93%);
  font-size: 11px;
  font-weight: 600;
  color: hsl(155, 15%, 45%);
  min-width: 18px;
  text-align: center;
  transition: all 0.2s;
}

/* ===== Search ===== */
.search-box { position: relative; display: flex; align-items: center; }

.search-icon {
  position: absolute;
  left: 12px;
  color: hsl(155, 12%, 55%);
  pointer-events: none;
}

.search-input {
  width: 220px;
  height: 36px;
  padding: 0 12px 0 36px;
  border-radius: var(--radius-md);
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  font-size: 13px;
  color: hsl(155, 25%, 18%);
  outline: none;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 2px 12px hsl(150 15% 0% / 0.05), 0 0 0 1px hsl(155 20% 92% / 0.3);
}

.search-input:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158 50% 50% / 0.12);
}

/* ===== Table ===== */
.table-container {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  overflow: hidden;
}

.table-scroll { overflow-x: auto; }

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
  cursor: pointer;
}

.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover td { background: hsl(155, 20%, 98%); }
.data-table tbody tr.row-selected td { background: hsl(158, 50%, 97%); }
.data-table tbody tr.row-disabled { opacity: 0.55; }
.data-table tbody tr.row-skeleton { cursor: default; pointer-events: none; }

.col-check { width: 48px; text-align: center; }
.col-check .checkbox-mark { margin: 0 auto; }
.col-doc { min-width: 200px; text-align: left; }
.col-doc th { text-align: left; }
.col-desc { min-width: 120px; max-width: 200px; }
.col-action { width: 72px; text-align: center; }

/* Checkbox */
.checkbox-mark {
  width: 20px;
  height: 20px;
  border: 2px solid hsl(155, 20%, 82%);
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: hsla(0, 0%, 100%, 0.8);
  color: transparent;
}

.checkbox-mark.checked {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* Doc info cell */
.doc-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.doc-icon {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.doc-icon.file-pdf { background: hsl(0, 80%, 96%); color: hsl(0, 70%, 50%); }
.doc-icon.file-excel { background: hsl(140, 50%, 94%); color: hsl(140, 60%, 38%); }
.doc-icon.file-word { background: hsl(215, 60%, 95%); color: hsl(215, 70%, 50%); }
.doc-icon.file-ppt { background: hsl(15, 80%, 95%); color: hsl(15, 70%, 50%); }
.doc-icon.file-default { background: hsl(155, 20%, 95%); color: hsl(158, 40%, 45%); }

.doc-name {
  font-weight: 600;
  color: hsl(155, 25%, 18%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

/* Status badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.status-badge.status-completed { background: hsl(158, 50%, 93%); color: hsl(158, 64%, 32%); }
.status-badge.status-processing { background: hsl(45, 90%, 94%); color: hsl(35, 80%, 35%); }
.status-badge.status-failed { background: hsl(0, 80%, 95%); color: hsl(0, 70%, 45%); }

.status-dot-sm {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-spinner-sm {
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Cell styles */
.cell-secondary { font-size: 13px; color: hsl(155, 12%, 50%); }
.cell-metric { font-size: 14px; font-weight: 600; color: hsl(155, 25%, 22%); }
.cell-desc {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

/* Delete button */
.action-btn-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  color: hsl(150, 10%, 65%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin: 0 auto;
}

.action-btn-delete:hover {
  background: hsl(0, 80%, 96%);
  color: hsl(0, 70%, 50%);
}

/* Skeleton */
.skeleton {
  background: linear-gradient(90deg, hsl(150, 15%, 93%) 25%, hsl(150, 15%, 88%) 50%, hsl(150, 15%, 93%) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ===== Detail View ===== */
.kb-detail-view {
  animation: detailFadeIn 0.3s ease-out;
}

@keyframes detailFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: var(--radius-md);
  color: hsl(155, 12%, 45%);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3);
}

.back-btn:hover {
  color: var(--accent);
  border-color: hsl(158, 40%, 82%);
  transform: translateX(-2px);
}

.delete-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: var(--radius-md);
  border: 1px solid hsl(0, 60%, 88%);
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(0, 12%, 98%, 0.9));
  color: hsl(0, 60%, 50%);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow:
    0 2px 12px hsl(0 15% 0% / 0.05),
    0 0 0 1px hsl(0 20% 92% / 0.3);
}

.delete-action-btn:hover {
  background: hsl(0, 80%, 96%);
  border-color: hsl(0, 60%, 75%);
  color: hsl(0, 72%, 45%);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px hsl(0 60% 50% / 0.12);
}

/* Document info grid */
.detail-info-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.info-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 20px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 16px;
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
}

.info-label {
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 15%, 50%);
  letter-spacing: 0.04em;
}

.info-value {
  font-size: 16px;
  font-weight: 700;
  color: hsl(155, 25%, 18%);
}

/* Chunks section */
.chunks-section {
  display: flex;
  flex-direction: column;
}

/* Chunk toolbar */
.chunk-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 16px;
  flex-wrap: wrap;
}

.chunk-section-title {
  font-size: 18px;
  font-weight: 700;
  color: hsl(155, 25%, 18%);
  margin: 0;
  white-space: nowrap;
}

.chunk-toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chunk-count {
  font-size: 13px;
  font-weight: 500;
  color: hsl(155, 12%, 50%);
  white-space: nowrap;
  padding: 6px 14px;
  border-radius: var(--radius-md);
  background: hsl(150, 15%, 95%);
}

/* Chunks container */
.chunks-container {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  overflow: hidden;
}

.chunk-item {
  padding: 20px 24px;
  border-bottom: 1px solid hsl(155, 20%, 95%);
  transition: background 0.15s;
}

.chunk-item:last-child { border-bottom: none; }

.chunk-item:hover { background: hsl(155, 20%, 98%); }

.chunk-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.chunk-idx {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
  padding: 2px 8px;
  border-radius: 6px;
  font-family: var(--font-mono, 'SF Mono', monospace);
}

.chunk-tags { display: flex; gap: 6px; flex-wrap: wrap; }

.chunk-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 24px;
  font-size: 12px;
  background: hsl(158, 50%, 95%);
  color: hsl(158, 64%, 30%);
  border: 1px solid hsl(158, 40%, 88%);
}

.chunk-copy-btn {
  margin-left: auto;
  background: transparent;
  border: none;
  color: hsl(155, 12%, 65%);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chunk-copy-btn:hover {
  background: hsl(158, 50%, 95%);
  color: hsl(158, 64%, 40%);
}

.chunk-summary {
  font-size: 13px;
  color: hsl(155, 12%, 40%);
  margin-bottom: 10px;
  padding: 8px 12px;
  background: hsl(150, 20%, 97%);
  border-radius: 8px;
  border-left: 3px solid var(--accent);
  line-height: 1.6;
}

.chunk-content {
  font-size: 14px;
  line-height: 1.7;
  color: hsl(155, 15%, 25%);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ===== Loading ===== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 20px;
}

.loading-state.compact { padding: 60px 20px; }

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid hsl(155, 30%, 90%);
  border-top-color: hsl(158, 64%, 45%);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

.loading-text { font-size: 14px; color: var(--text-secondary); }

/* ===== Empty ===== */
.empty-state { text-align: center; padding: 80px 20px; }
.empty-state.compact { padding: 48px 20px; }

.empty-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 24px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  margin-bottom: 20px;
  box-shadow: 0 4px 16px hsl(150 15% 0% / 0.06);
}

.empty-icon { width: 36px; height: 36px; color: hsl(158, 30%, 65%); }
.empty-title { font-weight: 650; font-size: 18px; color: hsl(155, 25%, 18%); margin-bottom: 6px; }
.empty-desc { font-size: 14px; color: hsl(155, 12%, 50%); margin-bottom: 24px; }

.empty-action {
  display: inline-flex;
  align-items: center;
  padding: 10px 28px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 4px 12px hsl(158 64% 50% / 0.25);
}

.empty-action:hover {
  background: var(--accent-hover);
  transform: translateY(-2px);
}

/* ===== Manage Bar ===== */
.manage-bar {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 28px;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.92));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  box-shadow: 0 12px 40px hsl(150 15% 0% / 0.12), 0 0 0 1px hsl(155 20% 92% / 0.3);
  z-index: 100;
}

.manage-count { font-size: 14px; font-weight: 600; color: hsl(155, 25%, 18%); }

.manage-select-all {
  padding: 7px 16px;
  border-radius: var(--radius-md);
  border: 1px solid hsl(155, 20%, 88%);
  background: hsla(0, 0%, 100%, 0.8);
  color: hsl(155, 12%, 45%);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.manage-select-all:hover { border-color: var(--accent); color: var(--accent); }

.manage-batch-delete {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-md);
  border: none;
  background: hsl(0, 72%, 56%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px hsl(0 72% 56% / 0.25);
}

.manage-batch-delete:hover { background: hsl(0, 72%, 48%); }

.bar-slide-enter-active, .bar-slide-leave-active { transition: all 0.3s cubic-bezier(0.2, 0, 0, 1); }
.bar-slide-enter-from { opacity: 0; transform: translateX(-50%) translateY(20px); }
.bar-slide-leave-to { opacity: 0; transform: translateX(-50%) translateY(20px); }

/* ===== Modal ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.2s ease; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }

.modal-dialog {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.97), hsla(150, 12%, 98%, 0.94));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  width: 90%;
  max-width: 520px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px hsl(155 20% 92% / 0.3);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-pop {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid hsl(155, 20%, 93%);
}

.modal-title { font-size: 18px; font-weight: 700; color: hsl(155, 25%, 18%); margin: 0; }

.modal-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(155, 12%, 55%);
  padding: 4px;
  border-radius: 8px;
  transition: all 0.2s;
}

.modal-close:hover { color: hsl(155, 25%, 25%); background: hsl(155, 20%, 94%); }

.modal-body { padding: 24px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 0 24px 24px; }

/* Confirm Dialog */
.confirm-dialog {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.97), hsla(150, 12%, 98%, 0.94));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  padding: 36px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px hsl(155 20% 92% / 0.3);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.confirm-icon-wrapper {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: hsl(0, 80%, 96%);
  color: hsl(0, 70%, 55%);
  margin-bottom: 16px;
}

.confirm-title { font-size: 18px; font-weight: 700; color: hsl(155, 25%, 18%); margin-bottom: 8px; }
.confirm-message { font-size: 14px; color: hsl(155, 12%, 45%); line-height: 1.5; margin-bottom: 24px; }
.confirm-buttons { display: flex; gap: 12px; width: 100%; }

/* ===== Form ===== */
.form-group { margin-bottom: 20px; }

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: hsl(155, 15%, 25%);
  margin-bottom: 8px;
}

.required { color: #ef4444; }

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid hsl(155, 20%, 88%);
  border-radius: 12px;
  font-size: 14px;
  color: hsl(155, 25%, 18%);
  background: hsla(0, 0%, 100%, 0.8);
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  border-color: hsl(158, 64%, 50%);
  box-shadow: 0 0 0 3px hsl(158 50% 50% / 0.12);
  background: #fff;
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

/* Upload area */
.upload-area {
  border: 2px dashed hsl(155, 20%, 85%);
  border-radius: 14px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: hsla(150, 20%, 99%, 0.8);
}

.upload-area:hover,
.upload-area.dragover {
  border-color: hsl(158, 64%, 50%);
  background: hsl(158, 50%, 97%);
}

.upload-placeholder svg {
  color: hsl(155, 12%, 60%);
  margin-bottom: 10px;
}

.upload-placeholder p {
  font-size: 14px;
  color: hsl(155, 15%, 35%);
  margin: 0 0 4px;
}

.upload-hint {
  font-size: 12px;
  color: hsl(155, 12%, 55%);
}

.file-preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}

.file-icon-sm {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: hsl(158, 50%, 95%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(158, 64%, 40%);
}

.file-info { flex: 1; min-width: 0; }

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: hsl(155, 25%, 18%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size { font-size: 12px; color: hsl(155, 12%, 50%); }

.remove-file-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(155, 12%, 55%);
  padding: 4px;
  border-radius: 4px;
}

.remove-file-btn:hover { color: #ef4444; }

/* Buttons */
.btn-cancel {
  flex: 1;
  padding: 10px 20px;
  border-radius: 12px;
  border: 1px solid hsl(155, 20%, 88%);
  background: hsla(0, 0%, 100%, 0.8);
  color: hsl(155, 12%, 45%);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel:hover { background: hsl(150, 15%, 95%); }

.btn-primary {
  flex: 1;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 10px hsl(158 64% 45% / 0.25);
}

.btn-primary:hover:not(:disabled) { background: var(--accent-hover); box-shadow: 0 4px 16px hsl(158 64% 45% / 0.35); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-danger {
  flex: 1;
  padding: 10px 20px;
  border-radius: 12px;
  border: none;
  background: hsl(0, 72%, 56%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px hsl(0 72% 56% / 0.2);
}

.btn-danger:hover { background: hsl(0, 72%, 48%); }

/* ===== Toast ===== */
.toast {
  position: fixed;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  z-index: 10001;
  pointer-events: none;
  box-shadow: 0 8px 24px hsl(0 0% 0% / 0.12);
}

.toast.success { background: hsl(155, 30%, 18%); color: hsl(158, 50%, 85%); }
.toast.error { background: hsl(0, 80%, 96%); color: hsl(0, 70%, 45%); border: 1px solid hsl(0, 70%, 90%); }
.toast.info { background: hsl(155, 30%, 18%); color: hsl(158, 50%, 85%); }

.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.toast-fade-enter-from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
.toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

/* ===== Responsive ===== */
@media (max-width: 1100px) {
  .detail-info-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 768px) {
  .hero-section { flex-direction: column; gap: 16px; }
  .hero-title { font-size: 28px; }

  .toolbar { flex-direction: column; align-items: flex-start; }
  .filter-bar { gap: 6px; }
  .filter-btn { padding: 7px 12px; font-size: 12px; }
  .search-box { width: 100%; }
  .search-input { width: 100%; }

  .detail-info-grid { grid-template-columns: 1fr; }

  .chunk-toolbar { flex-direction: column; align-items: flex-start; }
  .chunk-toolbar-right { width: 100%; }

  .manage-bar {
    left: 16px;
    right: 16px;
    transform: none;
    width: auto;
    flex-wrap: wrap;
    justify-content: center;
  }

  .bar-slide-enter-from, .bar-slide-leave-to { transform: translateY(20px); }
}
</style>
