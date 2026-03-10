<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { X, Upload, FileText, Plus, UserCircle } from 'lucide-vue-next'
import { useSalesStore } from '@/stores/sales'
import { analyzeProfileStream, analyzeProfileTextStream } from '@/api/sales'
import type { SalesChatEvent } from '@/api/sales'
import { useMarkdown } from '@/composables/useMarkdown'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useSalesStore()
const { render: renderMarkdown, cleanContent } = useMarkdown()

// ==================== State ====================
type Step = 'display' | 'input' | 'analyzing' | 'edit'
const currentStep = ref<Step>('display')
const renderedContent = ref('')
const uploadedFiles = ref<File[]>([])
const inputText = ref('')
const editText = ref('')
const isGenerating = ref(false)
const isSaving = ref(false)
const editorRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
let abortController: AbortController | null = null
const errorMessage = ref('')

onBeforeUnmount(() => {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
})

// ==================== Computed helpers ====================
const hasContent = () => (store.customerProfile || '').trim().length > 0
const canGenerate = () => uploadedFiles.value.length > 0 || inputText.value.trim().length > 0

// File/text mutual exclusion
const hasFiles = () => uploadedFiles.value.length > 0
const hasText = () => inputText.value.trim().length > 0

// ==================== Title ====================
function getTitle(): string {
  switch (currentStep.value) {
    case 'display': return '客户档案'
    case 'input': return '创建客户档案'
    case 'analyzing': return '生成客户档案'
    case 'edit': return '编辑客户档案'
    default: return '客户档案'
  }
}

// ==================== Step switching ====================
function switchStep(step: Step) {
  currentStep.value = step
  if (step === 'edit') {
    editText.value = store.customerProfile || ''
  }
}

// ==================== Open/Close ====================
watch(() => props.open, async (show) => {
  if (show) {
    // Clear stale local state from previous session
    errorMessage.value = ''
    uploadedFiles.value = []
    inputText.value = ''
    editText.value = ''
    await store.loadCustomerProfile()
    updateRenderedContent()
    switchStep('display')
  } else {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }
})

function updateRenderedContent() {
  const notes = store.customerProfile || ''
  renderedContent.value = notes ? renderMarkdown(cleanContent(notes)) : ''
}

// ==================== File upload ====================
function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    addFiles(Array.from(input.files))
  }
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function addFiles(newFiles: File[]) {
  const remaining = 5 - uploadedFiles.value.length
  if (remaining <= 0) return
  // Deduplicate by name + size
  const toAdd = newFiles.slice(0, remaining).filter((file) => {
    return !uploadedFiles.value.some((f) => f.name === file.name && f.size === file.size)
  })
  uploadedFiles.value.push(...toAdd)
}

function removeFile(index: number) {
  uploadedFiles.value.splice(index, 1)
}

function clearAllFiles() {
  uploadedFiles.value = []
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Drag & drop
function onDragOver(e: DragEvent) {
  e.preventDefault()
  ;(e.currentTarget as HTMLElement)?.classList.add('dragover')
}

function onDragLeave(e: DragEvent) {
  e.preventDefault()
  ;(e.currentTarget as HTMLElement)?.classList.remove('dragover')
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  ;(e.currentTarget as HTMLElement)?.classList.remove('dragover')
  if (e.dataTransfer?.files) {
    addFiles(Array.from(e.dataTransfer.files))
  }
}

// ==================== Generation ====================
async function startGeneration() {
  if (!canGenerate()) return
  isGenerating.value = true
  switchStep('analyzing')

  let profileContent = ''
  abortController = new AbortController()

  const onEvent = (event: SalesChatEvent) => {
    if (event.type === 'token') {
      profileContent += String(event.data || '')
      // Switch to display on first token
      if (currentStep.value === 'analyzing') {
        switchStep('display')
      }
      // Real-time render
      store.customerProfile = profileContent
      renderedContent.value = renderMarkdown(cleanContent(profileContent))
      // Auto-scroll
      nextTick(() => {
        if (editorRef.value) {
          editorRef.value.scrollTop = editorRef.value.scrollHeight
        }
      })
    } else if (event.type === 'done') {
      const doneData = event.data as Record<string, unknown> | null
      if (doneData?.profile !== undefined) {
        profileContent = String(doneData.profile)
        store.customerProfile = profileContent
        renderedContent.value = renderMarkdown(cleanContent(profileContent))
      }
    } else if (event.type === 'error') {
      throw new Error(String(event.data))
    }
  }

  try {
    if (uploadedFiles.value.length > 0) {
      await analyzeProfileStream(uploadedFiles.value, onEvent, abortController.signal)
    } else {
      await analyzeProfileTextStream(inputText.value.trim(), onEvent, abortController.signal)
    }

    if (!profileContent.trim()) {
      throw new Error('分析结果为空，请检查文件内容或稍后重试')
    }

    // Auto-save to backend
    await store.persistProfile()

    // Clear inputs
    inputText.value = ''
    clearAllFiles()
  } catch (e: unknown) {
    if (e instanceof Error && e.name !== 'AbortError') {
      console.error('Profile generation failed:', e)
      errorMessage.value = '生成失败，请重试'
      switchStep('input')
    }
  } finally {
    isGenerating.value = false
    abortController = null
  }
}

// ==================== Save (from display contenteditable) ====================
async function saveProfile() {
  // Sync from contenteditable
  if (editorRef.value) {
    store.customerProfile = editorRef.value.innerText || ''
  }

  isSaving.value = true
  try {
    await store.persistProfile()
    // 如果内容被清空，同步清除本地渲染内容
    if (!store.customerProfile.trim()) {
      renderedContent.value = ''
    }
    emit('close')
  } catch (e: unknown) {
    console.error('Failed to save customer profile:', e)
    errorMessage.value = '保存失败，请重试'
  } finally {
    isSaving.value = false
  }
}

// ==================== Edit (raw markdown) ====================
function cancelEdit() {
  switchStep('display')
}

async function saveEdit() {
  store.customerProfile = editText.value
  renderedContent.value = renderMarkdown(cleanContent(editText.value))
  await store.persistProfile()
  switchStep('display')
}

// ==================== Navigation ====================
function returnToDisplay() {
  inputText.value = ''
  clearAllFiles()
  switchStep('display')
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}

// Handle paste as plain text in editor
function onEditorPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      :class="{ open: props.open }"
      @click="onOverlayClick"
    >
      <div class="modal-card profile-modal-card" role="dialog" aria-modal="true" @keydown.escape="emit('close')">
        <!-- Header -->
        <div class="profile-modal-header">
          <span class="modal-title">{{ getTitle() }}</span>
          <button class="modal-close-btn" aria-label="关闭" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div class="profile-modal-body">
          <!-- Error message -->
          <div v-if="errorMessage" class="modal-error-message" @click="errorMessage = ''">
            {{ errorMessage }}
          </div>

          <!-- Step 1: Display -->
          <div v-show="currentStep === 'display'" class="profile-step active">
            <!-- Empty state -->
            <div v-if="!hasContent()" class="profile-display-empty">
              <UserCircle :size="48" />
              <span>未创建客户档案</span>
            </div>
            <!-- Content editor (contenteditable for inline editing) -->
            <div v-else class="profile-editor-wrapper">
              <div
                ref="editorRef"
                class="profile-editor-simple profile-editor-display"
                contenteditable="true"
                data-placeholder="上传文档后，AI 将自动生成客户档案..."
                v-html="renderedContent"
                @paste="onEditorPaste"
              />
            </div>
          </div>

          <!-- Step 2: Input -->
          <div v-show="currentStep === 'input'" class="profile-step profile-step-input active">
            <!-- Upload area -->
            <div
              class="profile-input-upload-wrapper"
              :class="{ 'profile-input-disabled': hasText() }"
            >
              <div
                v-if="uploadedFiles.length === 0"
                class="profile-upload-zone profile-upload-zone-input"
                @click="!hasText() && triggerFileInput()"
                @dragover="onDragOver"
                @dragleave="onDragLeave"
                @drop="onDrop"
              >
                <div class="profile-upload-icon">
                  <Upload :size="40" />
                </div>
                <div class="profile-upload-text">点击或拖拽上传文件 (最多5个)</div>
                <div class="profile-upload-hint">支持 PDF, Word, Excel, 图片</div>
              </div>
              <div
                v-else
                class="profile-uploaded-files-list"
                @dragover="onDragOver"
                @dragleave="onDragLeave"
                @drop="onDrop"
              >
                <div
                  v-for="(file, idx) in uploadedFiles"
                  :key="file.name + file.size"
                  class="profile-uploaded-file"
                >
                  <div class="profile-uploaded-file-icon">
                    <FileText :size="20" />
                  </div>
                  <div class="profile-uploaded-file-info">
                    <div class="profile-uploaded-file-name">{{ file.name }}</div>
                    <div class="profile-uploaded-file-size">{{ formatFileSize(file.size) }}</div>
                  </div>
                  <button class="profile-uploaded-file-remove" @click="removeFile(idx)">
                    <X :size="16" />
                  </button>
                </div>
                <button
                  v-if="uploadedFiles.length < 5"
                  class="profile-add-more-btn"
                  @click="triggerFileInput"
                >
                  <Plus :size="16" />
                  <span>继续添加</span>
                </button>
              </div>
              <div class="profile-input-disabled-hint">已输入文本，清空后可上传文件</div>
            </div>

            <!-- Divider -->
            <div class="profile-input-divider">
              <span>或手动输入</span>
            </div>

            <!-- Textarea -->
            <div
              class="profile-input-textarea-wrapper"
              :class="{ 'profile-input-disabled': hasFiles() }"
            >
              <textarea
                v-model="inputText"
                class="profile-input-textarea"
                placeholder="粘贴客户信息，如公司简介、业务需求、联系人等，AI 将自动分析生成画像..."
                :disabled="hasFiles()"
              />
              <div class="profile-input-disabled-hint">已上传文件，清除后可手动输入</div>
            </div>
          </div>

          <!-- Step 3: Analyzing -->
          <div v-show="currentStep === 'analyzing'" class="profile-step profile-step-analyzing active">
            <div class="profile-analyzing-state">
              <div class="profile-analyzing-spinner" />
              <div class="profile-analyzing-title">AI 正在分析中...</div>
              <div class="profile-analyzing-subtitle">根据您上传的文件大小，生成时间可能需要 5 秒到 1 分钟，请耐心等待</div>
            </div>
          </div>

          <!-- Step 4: Edit (raw markdown) -->
          <div v-show="currentStep === 'edit'" class="profile-step active">
            <div class="profile-edit-wrapper">
              <textarea
                v-model="editText"
                class="profile-edit-textarea"
                placeholder="在此编辑 Markdown 格式的客户档案..."
              />
            </div>
          </div>

          <!-- Hidden file input -->
          <input
            ref="fileInputRef"
            type="file"
            hidden
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.json,.html,.jpg,.jpeg,.png,.gif,.webp"
            @change="handleFileChange"
          >
        </div>

        <!-- Footer -->
        <div class="profile-modal-footer">
          <!-- Display step footer -->
          <div v-show="currentStep === 'display'" class="profile-footer-display">
            <button
              type="button"
              class="btn-secondary"
              @click="switchStep('input')"
            >
              <Plus v-if="!hasContent()" :size="18" />
              <span>{{ hasContent() ? '重新生成' : '创建档案' }}</span>
            </button>
            <button
              v-if="hasContent()"
              type="button"
              class="btn-primary"
              :disabled="isSaving"
              @click="saveProfile"
            >
              <span>{{ isSaving ? '保存中...' : '保存' }}</span>
            </button>
          </div>

          <!-- Input step footer -->
          <div v-show="currentStep === 'input'" class="profile-footer-input">
            <button type="button" class="btn-secondary" @click="returnToDisplay">返回</button>
            <button
              type="button"
              class="btn-primary"
              :disabled="!canGenerate()"
              @click="startGeneration"
            >
              <span>生成</span>
            </button>
          </div>

          <!-- Edit step footer -->
          <div v-show="currentStep === 'edit'" class="profile-footer-edit">
            <button type="button" class="btn-secondary" @click="cancelEdit">
              <span>取消</span>
            </button>
            <button type="button" class="btn-primary" @click="saveEdit">
              <span>保存</span>
            </button>
          </div>

          <!-- Analyzing step: no footer buttons -->
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import '@/assets/styles/sales-modal.css';
</style>

<style scoped>
/* ==================== Profile Modal Scoped Styles ==================== */

/* Profile modal card (override shared) */
.profile-modal-card {
  width: 800px;
  max-width: 95vw;
  height: 85vh;
  max-height: 700px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.15);
}

/* Header */
.profile-modal-header {
  background: white;
}

.profile-modal-header .modal-title {
  font-size: 1.35rem;
  font-weight: 700;
}

/* Body */
.profile-modal-body {
  padding: 20px 28px;
  gap: 16px;
  position: relative;
}

/* Step containers */
.profile-step {
  display: none;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.profile-step.active {
  display: flex;
}

.profile-step-input {
  gap: 20px;
  overflow-y: auto;
}

.profile-step-analyzing {
  align-items: center;
  justify-content: center;
}

/* Display editor: contenteditable with inline editing */
.profile-editor-display {
  min-height: 280px;
  max-height: none;
  border: none;
  box-shadow: none;
  padding: 0;
  background: transparent;
}

/* Upload zone input */
.profile-upload-zone-input {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 36px 24px;
  background: linear-gradient(135deg, rgba(37, 167, 105, 0.03), rgba(37, 167, 105, 0.01));
  border: 2px dashed rgba(37, 167, 105, 0.25);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  min-height: 150px;
}

.profile-upload-zone-input:hover {
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.06);
}

.profile-upload-zone-input.dragover {
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.1);
  box-shadow: 0 0 0 4px rgba(37, 167, 105, 0.1);
}

/* Uploaded files list */
.profile-uploaded-files-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 2px dashed transparent;
  border-radius: 16px;
  transition: all 0.3s ease;
}

.profile-uploaded-files-list.dragover {
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.06);
  box-shadow: 0 0 0 4px rgba(37, 167, 105, 0.1);
}

.profile-add-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: 2px dashed rgba(37, 167, 105, 0.2);
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.profile-add-more-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(37, 167, 105, 0.04);
}

/* Mutual exclusion: file upload vs text input */
.profile-input-disabled-hint {
  display: none;
  font-size: 13px;
  color: #d97706;
  margin-top: 8px;
}

.profile-input-disabled {
  opacity: 0.5;
  pointer-events: none;
  position: relative;
}

.profile-input-disabled .profile-input-disabled-hint {
  display: block;
  pointer-events: auto;
  opacity: 1;
}

/* Footer layouts */
.profile-footer-display,
.profile-footer-input,
.profile-footer-edit {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}

.profile-modal-footer {
  padding: 16px 28px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: white;
}

/* Responsive */
@media (max-width: 768px) {
  .profile-modal-card {
    height: 90vh;
    max-height: none;
    border-radius: 20px 20px 0 0;
  }

  .profile-editor-display {
    min-height: 200px;
  }
}
</style>
