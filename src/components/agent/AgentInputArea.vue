<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { EstimateResponse, UploadResponse } from '@/types/agent'
import { Paperclip, ArrowUp, X, FileText, Square } from 'lucide-vue-next'
import { getInputBudgetState } from '@/utils/inputBudget'

interface Props {
  agentId: number
  estimate: EstimateResponse | null
  attachments: UploadResponse[]
  sending?: boolean
  disabled?: boolean
  /** True only when the parent has an active, server-addressable run that can
   * be cancelled. The stop button must not appear for a stream that has not
   * received its run_id yet. */
  canStop?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  sending: false,
  disabled: false,
  canStop: false
})

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'estimate-request', text: string): void
  (e: 'upload', file: File): void
  (e: 'remove-attachment', url: string): void
  (e: 'reject', reason: string): void
  (e: 'stop'): void
}>()

const text = ref('')
const isComposing = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_FILE_COUNT = 5
const REJECT_MIME = ['application/x-msdownload', 'application/x-executable']

const canSend = computed(() => {
  const hasText = text.value.trim().length > 0
  const hasUploads = props.attachments.length > 0
  return (hasText || hasUploads) && !props.sending && !props.disabled
})

const inputBudget = computed(() => getInputBudgetState(text.value))

// 自动调高度
const autoResize = (): void => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}

watch(text, () => nextTick(autoResize))

// Debounce estimate 500ms
let estimateTimer: ReturnType<typeof setTimeout> | null = null
watch(text, (newText) => {
  if (estimateTimer) clearTimeout(estimateTimer)
  if (newText.trim().length === 0) return
  estimateTimer = setTimeout(() => {
    emit('estimate-request', newText)
  }, 500)
})

const handleSend = (): void => {
  if (!canSend.value) return
  emit('send', text.value)
  text.value = ''
  nextTick(autoResize)
}

const handleKeydown = (e: KeyboardEvent): void => {
  if (isComposing.value) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

const triggerUpload = (): void => {
  fileInputRef.value?.click()
}

const processFiles = (files: FileList): void => {
  for (const file of Array.from(files)) {
    if (props.attachments.length >= MAX_FILE_COUNT) {
      emit('reject', `最多上传 ${MAX_FILE_COUNT} 个文件`)
      break
    }
    if (file.size > MAX_FILE_SIZE) {
      emit('reject', `${file.name} 超过 20MB 上限`)
      continue
    }
    if (REJECT_MIME.includes(file.type)) {
      emit('reject', `${file.name} 文件类型不支持`)
      continue
    }
    emit('upload', file)
  }
}

const handleFileChange = (e: Event): void => {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    processFiles(input.files)
  }
  input.value = ''
}

const handleDrop = (e: DragEvent): void => {
  isDragging.value = false
  const droppedFiles = e.dataTransfer?.files
  if (droppedFiles && droppedFiles.length > 0) {
    processFiles(droppedFiles)
  }
}

const handlePaste = (e: ClipboardEvent): void => {
  const clipboardFiles = e.clipboardData?.files
  if (clipboardFiles && clipboardFiles.length > 0) {
    e.preventDefault()
    processFiles(clipboardFiles)
  }
}

onMounted(() => {
  nextTick(autoResize)
})

onUnmounted(() => {
  if (estimateTimer) clearTimeout(estimateTimer)
})
</script>

<template>
  <div class="input-stage">
    <div
      class="input-floating-container"
      :class="{ 'drag-over': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragenter.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <!-- Hidden file input -->
      <input
        ref="fileInputRef"
        type="file"
        multiple
        style="display: none"
        accept=".xlsx,.csv,.txt,.pdf,.png,.jpg,.jpeg,.docx"
        @change="handleFileChange"
      />

      <textarea
        ref="textareaRef"
        v-model="text"
        class="chat-input"
        :disabled="disabled"
        placeholder="输入你的问题，或拖入文件到这里..."
        @keydown="handleKeydown"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @paste="handlePaste"
        @input="autoResize"
      />

      <!-- 预估消耗条 -->
      <div
        v-if="estimate && text.trim().length > 0"
        class="estimate-bar"
        :class="{ large: estimate.is_large_task }"
      >
        <template v-if="estimate.is_large_task">
          📊 本次运行属于大型任务，预计消耗 {{ estimate.min }}-{{ estimate.max }} 积分
        </template>
        <template v-else> 预计消耗 {{ estimate.min }}-{{ estimate.max }} 积分 </template>
      </div>

      <!-- Attachment preview strip -->
      <div v-if="attachments.length > 0" class="attachment-strip">
        <div v-for="att in attachments" :key="att.url" class="attachment-item success">
          <FileText :size="14" class="attachment-icon" />
          <span class="attachment-name" :title="att.filename">{{ att.filename }}</span>
          <button class="attachment-remove" @click="emit('remove-attachment', att.url)">
            <X :size="12" />
          </button>
        </div>
      </div>

      <div class="input-toolbar">
        <div class="toolbar-left">
          <button
            class="toolbar-icon-btn"
            title="上传附件"
            :disabled="disabled"
            @click="triggerUpload"
          >
            <Paperclip :size="18" />
          </button>
        </div>

        <!-- 字数计数器 -->
        <div
          v-if="text.length > 0"
          class="input-budget"
          :class="{
            'input-budget--warning': inputBudget.state === 'warning',
            'input-budget--error': inputBudget.state === 'error'
          }"
          aria-live="polite"
        >
          <span>{{ inputBudget.label }}</span>
          <span v-if="inputBudget.state === 'error'" class="input-budget-hint">
            输入过长，系统可能需要压缩上下文
          </span>
        </div>

        <div class="toolbar-right">
          <!-- issue4: a single button toggles between send (idle) and stop (running).
               While streaming it's always clickable so the user can abort; otherwise
               it sends and is gated by canSend. -->
          <button
            v-if="canStop"
            class="send-btn send-btn--stop"
            type="button"
            aria-label="终止"
            title="终止"
            @click="emit('stop')"
          >
            <Square :size="16" />
          </button>
          <button
            v-else
            class="send-btn"
            :disabled="!canSend"
            aria-label="发送"
            @click="handleSend"
          >
            <ArrowUp :size="20" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-stage {
  padding: 0 32px 32px;
  position: relative;
  background: transparent;
  flex-shrink: 0;
}

.input-floating-container {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  padding: 12px 16px 10px;
  display: flex;
  flex-direction: column;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  position: relative;
}

.input-floating-container:focus-within {
  border-color: hsla(160, 45%, 50%, 0.5);
  box-shadow: 0 4px 24px rgba(37, 167, 105, 0.08);
}

.input-floating-container.drag-over {
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.02);
  box-shadow: 0 0 0 2px rgba(37, 167, 105, 0.15);
}

.chat-input {
  width: 100%;
  border: none;
  resize: none;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  background: transparent;
  outline: none;
  padding: 4px 0 8px;
  max-height: 140px;
  min-height: 28px;
  overflow-y: auto;
}

.chat-input::placeholder {
  color: var(--text-light);
}

.chat-input:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

/* ===== Estimate Bar ===== */
.estimate-bar {
  font-size: 12px;
  color: var(--text-muted);
  padding: 6px 10px;
  background: hsla(160, 40%, 50%, 0.06);
  color: hsl(160, 45%, 36%);
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px dashed hsla(160, 45%, 50%, 0.2);
  display: inline-flex;
}

.estimate-bar.large {
  background: #fff7ed;
  color: #c2410c;
  border-color: #fdba74;
}

/* ===== Attachment Strip ===== */
.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.attachment-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 4px 8px;
  max-width: 200px;
}

.attachment-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.attachment-name {
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.attachment-remove:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text);
}

/* ===== Toolbar ===== */
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(0, 0, 0, 0.03);
  padding-top: 8px;
  margin-top: auto;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-icon-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 6px;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toolbar-icon-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text);
}

.toolbar-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== Input Budget ===== */
.input-budget {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.input-budget--warning {
  color: #eab308;
  font-weight: 500;
}

.input-budget--error {
  color: #ef4444;
  font-weight: 600;
}

.input-budget-hint {
  font-size: 11px;
  opacity: 0.8;
}

/* ===== Send Button ===== */
.toolbar-right {
  display: flex;
  align-items: center;
}

.send-btn {
  background: var(--primary);
  color: white;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(37, 167, 105, 0.2);
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 2px 10px rgba(37, 167, 105, 0.3);
}

.send-btn:disabled {
  background: var(--border-light);
  color: var(--text-muted);
  cursor: not-allowed;
  box-shadow: none;
  opacity: 0.6;
}

/* issue4: stop variant — distinct (red) so the "terminate" affordance reads
   clearly apart from the green send state. */
.send-btn--stop {
  background: #ef4444;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.22);
}

.send-btn--stop:hover:not(:disabled) {
  box-shadow: 0 2px 10px rgba(239, 68, 68, 0.32);
}

@media (max-width: 768px) {
  .input-stage {
    padding: 0 16px 16px;
  }
  .input-floating-container {
    border-radius: 16px;
  }
}
</style>
