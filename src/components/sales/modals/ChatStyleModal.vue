<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { X, Upload, FileText, Plus, MessageSquare } from 'lucide-vue-next'
import { fetchChatStyle, analyzeChatStyleStream, saveChatStyle } from '@/api/sales'
import type { SalesChatEvent } from '@/api/sales'
import { useMarkdown } from '@/composables/useMarkdown'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { render: renderMarkdown } = useMarkdown()

// ==================== State ====================
type Step = 'display' | 'input' | 'analyzing'
const currentStep = ref<Step>('display')
const styleContent = ref('')           // Raw markdown content
const renderedContent = ref('')        // Rendered HTML
const uploadedFile = ref<File | null>(null)
const inputText = ref('')
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
const hasContent = () => styleContent.value.trim().length > 0
const canGenerate = () => !!uploadedFile.value || inputText.value.trim().length > 0

// ==================== Title mapping ====================
function getTitle(): string {
  switch (currentStep.value) {
    case 'display': return '语言风格'
    case 'input': return '创建语言风格'
    case 'analyzing': return '生成语言风格'
    default: return '语言风格'
  }
}

// ==================== Step switching ====================
function switchStep(step: Step) {
  currentStep.value = step
}

// ==================== Open/Close ====================
watch(() => props.open, async (show) => {
  if (show) {
    await loadSavedStyle()
    switchStep('display')
  } else {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }
})

// ==================== Load saved style ====================
async function loadSavedStyle() {
  try {
    const saved = await fetchChatStyle()
    if (saved && saved.trim()) {
      styleContent.value = saved
      renderedContent.value = renderMarkdown(saved)
    } else {
      styleContent.value = ''
      renderedContent.value = ''
    }
  } catch (e) {
    console.warn('Failed to load saved chat style:', e)
    styleContent.value = ''
    renderedContent.value = ''
  }
}

// ==================== File upload ====================
function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    handleUpload(input.files[0])
  }
}

function handleUpload(file: File) {
  uploadedFile.value = file
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function clearUploadedFile(e?: Event) {
  if (e) e.stopPropagation()
  uploadedFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function formatFileSize(bytes: number): string {
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
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    handleUpload(e.dataTransfer.files[0])
  }
}

// ==================== Generation ====================
async function startGeneration() {
  if (!canGenerate()) return
  isGenerating.value = true
  switchStep('analyzing')

  let result = ''
  abortController = new AbortController()

  try {
    const formData = new FormData()
    if (uploadedFile.value) {
      formData.append('file', uploadedFile.value)
    } else {
      formData.append('text', inputText.value.trim())
    }

    await analyzeChatStyleStream(formData, (event: SalesChatEvent) => {
      if (event.type === 'token') {
        result += String(event.data || '')
        // Switch to display on first token
        if (currentStep.value === 'analyzing') {
          switchStep('display')
        }
        // Real-time render
        styleContent.value = result
        renderedContent.value = renderMarkdown(result)
        // Auto-scroll
        nextTick(() => {
          if (editorRef.value) {
            editorRef.value.scrollTop = editorRef.value.scrollHeight
          }
        })
      } else if (event.type === 'done') {
        const doneData = event.data as Record<string, unknown> | null
        if (doneData?.analysis || doneData?.style) {
          result = String(doneData.analysis || doneData.style || result)
          styleContent.value = result
          renderedContent.value = renderMarkdown(result)
        }
      } else if (event.type === 'error') {
        throw new Error(String(event.data))
      }
    }, abortController.signal)

    if (!result.trim()) {
      throw new Error('分析结果为空，请检查输入内容或稍后重试')
    }

    // Auto-save
    await saveChatStyle(result)

    // Clear input
    inputText.value = ''
    clearUploadedFile()
  } catch (e: unknown) {
    if (e instanceof Error && e.name !== 'AbortError') {
      console.error('Chat style generation failed:', e)
      errorMessage.value = '生成失败，请重试'
      switchStep('input')
    }
  } finally {
    isGenerating.value = false
    abortController = null
  }
}

// ==================== Save (inline edit) ====================
async function saveStyleOnly() {
  // Sync from contenteditable
  if (editorRef.value) {
    styleContent.value = editorRef.value.innerText || ''
  }

  if (!styleContent.value.trim()) return

  isSaving.value = true
  try {
    await saveChatStyle(styleContent.value)
    emit('close')
  } catch (e: unknown) {
    console.error('Failed to save chat style:', e)
    errorMessage.value = '保存失败，请重试'
  } finally {
    isSaving.value = false
  }
}

// ==================== Navigation ====================
function returnToDisplay() {
  inputText.value = ''
  clearUploadedFile()
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
          <!-- Step 1: Display -->
          <div v-show="currentStep === 'display'" class="chatstyle-step active">
            <!-- Empty state -->
            <div v-if="!hasContent()" class="profile-display-empty">
              <MessageSquare :size="48" />
              <span>未生成语言风格</span>
            </div>
            <!-- Content editor (contenteditable for inline editing) -->
            <div v-else class="profile-editor-wrapper">
              <div
                ref="editorRef"
                class="profile-editor-simple chatstyle-editor"
                contenteditable="true"
                data-placeholder="分析结果将在这里显示，您也可以在这里直接编辑..."
                v-html="renderedContent"
                @paste="onEditorPaste"
              />
            </div>
          </div>

          <!-- Error message -->
          <div v-if="errorMessage" class="modal-error-message" @click="errorMessage = ''">
            {{ errorMessage }}
          </div>

          <!-- Step 2: Input -->
          <div v-show="currentStep === 'input'" class="chatstyle-step chatstyle-step-input active">
            <!-- Upload zone -->
            <div class="profile-input-upload-wrapper">
              <div
                v-if="!uploadedFile"
                class="profile-upload-zone chatstyle-upload-zone"
                @click="triggerFileInput"
                @dragover="onDragOver"
                @dragleave="onDragLeave"
                @drop="onDrop"
              >
                <div class="profile-upload-icon">
                  <Upload :size="40" />
                </div>
                <div class="profile-upload-text">点击上传 PDF、Word、Excel、图片</div>
              </div>
              <div v-else class="profile-uploaded-file">
                <div class="profile-uploaded-file-icon">
                  <FileText :size="20" />
                </div>
                <div class="profile-uploaded-file-info">
                  <div class="profile-uploaded-file-name">{{ uploadedFile.name }}</div>
                  <div class="profile-uploaded-file-size">{{ formatFileSize(uploadedFile.size) }}</div>
                </div>
                <button class="profile-uploaded-file-remove" @click="clearUploadedFile($event)">
                  <X :size="16" />
                </button>
              </div>
            </div>

            <!-- Divider -->
            <div class="profile-input-divider">
              <span>或手动输入</span>
            </div>

            <!-- Textarea -->
            <div class="profile-input-textarea-wrapper">
              <textarea
                v-model="inputText"
                class="profile-input-textarea"
                placeholder="粘贴聊天记录、邮件或其他文本内容，AI 将自动分析您的语言风格..."
              />
            </div>
          </div>

          <!-- Step 3: Analyzing -->
          <div v-show="currentStep === 'analyzing'" class="chatstyle-step chatstyle-step-analyzing active">
            <div class="profile-analyzing-state">
              <div class="profile-analyzing-spinner" />
              <div class="profile-analyzing-title">AI 正在分析中...</div>
              <div class="profile-analyzing-subtitle">根据您上传的文件大小，生成时间可能需要 5 秒到 1 分钟，请耐心等待</div>
            </div>
          </div>

          <!-- Hidden file input -->
          <input
            ref="fileInputRef"
            type="file"
            hidden
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
              @click="saveStyleOnly"
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
/* ==================== Chat Style Modal Scoped Styles ==================== */

/* Upload zone (matches legacy #chatStyleUploadZoneInput) */
.chatstyle-upload-zone {
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

.chatstyle-upload-zone:hover {
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.06);
}

.chatstyle-upload-zone.dragover {
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.1);
  box-shadow: 0 0 0 4px rgba(37, 167, 105, 0.1);
}

/* ChatStyle editor: contenteditable with inline editing */
.chatstyle-editor {
  min-height: 280px;
  max-height: none;
  border: none;
  box-shadow: none;
  padding: 0;
  background: transparent;
}

/* Step containers */
.chatstyle-step {
  display: none;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.chatstyle-step.active {
  display: flex;
}

.chatstyle-step-input {
  gap: 20px;
  overflow-y: auto;
}

.chatstyle-step-analyzing {
  align-items: center;
  justify-content: center;
}

/* Responsive */
@media (max-width: 768px) {
  .chatstyle-editor {
    min-height: 200px;
  }
}
</style>
