<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ArrowUp, Image, Maximize2, Minimize2 } from 'lucide-vue-next'
import { useSalesStore } from '@/stores/sales'
import ImagePreviewStrip from './ImagePreviewStrip.vue'
import KbTagStrip from './KbTagStrip.vue'
import { getInputBudgetState } from '@/utils/inputBudget'

const store = useSalesStore()

const emit = defineEmits<{
  previewImage: [url: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isExpanded = ref(false)
const isComposing = ref(false)
const isDragOver = ref(false)
let dragLeaveTimer: ReturnType<typeof setTimeout> | null = null

const canSend = computed(() => {
  const hasText = store.draftText.trim().length > 0
  const hasImages = store.images.length > 0
  const allImagesReady = store.images.every((img) => img.status === 'success')
  return !store.isLoading && (hasText || (hasImages && allImagesReady))
})

const inputBudget = computed(() => getInputBudgetState(store.draftText))

const modeClass = computed(() => {
  return store.chatMode === 'sales' ? 'sales-mode' : 'free-mode'
})

const modeLabel = computed(() => {
  return store.chatMode === 'sales' ? '销冠模式' : '顾问模式'
})

// Reset expand state on session switch
watch(
  () => store.currentSessionId,
  () => {
    isExpanded.value = false
    nextTick(autoResize)
  }
)

// Auto-resize textarea
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  if (isExpanded.value) {
    el.style.height = Math.min(el.scrollHeight, 480) + 'px'
  } else {
    el.style.height = Math.min(el.scrollHeight, 92) + 'px'
  }
}

watch(
  () => store.draftText,
  () => nextTick(autoResize)
)

// Toggle expand
function toggleExpand() {
  isExpanded.value = !isExpanded.value
  nextTick(autoResize)
}

// Toggle chat mode
function toggleMode() {
  store.chatMode = store.chatMode === 'sales' ? 'free' : 'sales'
}

// Toggle deep thinking
function toggleDeepThinking() {
  store.isDeepThinking = !store.isDeepThinking
}

// Send message
function handleSend() {
  if (!canSend.value) return
  const text = store.draftText.trim()
  store.draftText = ''
  isExpanded.value = false
  nextTick(autoResize)
  store.sendMessage(text)
}

// Handle enter key (skip during IME composition)
function handleKeydown(e: KeyboardEvent) {
  if (isComposing.value) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// Handle image paste
function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        store.addImage(file)
      }
    }
  }
}

// Handle image drag & drop
function handleDragOver(e: DragEvent) {
  e.preventDefault()
  if (dragLeaveTimer) {
    clearTimeout(dragLeaveTimer)
    dragLeaveTimer = null
  }
  if (e.dataTransfer?.types.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy'
    isDragOver.value = true
  }
}

function handleDragLeave() {
  dragLeaveTimer = setTimeout(() => {
    isDragOver.value = false
  }, 50)
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      store.addImage(file)
    }
  }
}

// Handle image file selection
function triggerImageUpload() {
  fileInputRef.value?.click()
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of input.files) {
    if (file.type.startsWith('image/')) {
      store.addImage(file)
    }
  }
  input.value = ''
}

// Focus textarea on mount
onMounted(() => {
  nextTick(() => textareaRef.value?.focus())
})

onUnmounted(() => {
  if (dragLeaveTimer) {
    clearTimeout(dragLeaveTimer)
    dragLeaveTimer = null
  }
})
</script>

<template>
  <div class="input-stage">
    <!-- KB Tags -->
    <KbTagStrip />

    <!-- Floating input container -->
    <div
      class="input-floating-container"
      :class="{ expanded: isExpanded, 'drag-over': isDragOver }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <!-- Image preview strip -->
      <ImagePreviewStrip
        :images="store.images"
        @remove="store.removeImage"
        @preview="(url) => emit('previewImage', url)"
      />

      <!-- Textarea -->
      <textarea
        ref="textareaRef"
        v-model="store.draftText"
        class="chat-input"
        :placeholder="
          store.chatMode === 'sales'
            ? '输入客户的话或销售场景，帮你生成话术...'
            : '输入问题，获取销售策略建议...'
        "
        @keydown="handleKeydown"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @paste="handlePaste"
        @input="autoResize"
      />

      <!-- Expand button -->
      <button
        v-if="store.draftText.length > 100"
        class="expand-btn visible"
        @click="toggleExpand"
        :title="isExpanded ? '收起' : '展开'"
      >
        <Minimize2 v-if="isExpanded" :size="14" />
        <Maximize2 v-else :size="14" />
      </button>

      <!-- Toolbar -->
      <div class="input-toolbar">
        <div class="toolbar-left">
          <button
            class="mode-toggle-btn"
            :class="modeClass"
            :title="'点击切换对话模式'"
            @click="toggleMode"
          >
            <span class="mode-indicator"></span>
            <span>{{ modeLabel }}</span>
          </button>
          <button
            v-if="false"
            class="deep-thinking-btn"
            :class="{ active: store.isDeepThinking }"
            title="开启后大模型会展示思考过程"
            @click="toggleDeepThinking"
          >
            <span>深度思考</span>
          </button>
          <button class="image-upload-btn" title="上传图片回复" @click="triggerImageUpload">
            <Image :size="16" />
            <span>图片</span>
          </button>
        </div>
        <!-- 字数计数器 -->
        <div
          v-if="store.draftText.length > 0"
          class="input-budget"
          :class="{
            'input-budget--warning': inputBudget.state === 'warning',
            'input-budget--error': inputBudget.state === 'error'
          }"
          aria-live="polite"
        >
          <span>{{ inputBudget.label }}</span>
          <span v-if="inputBudget.state === 'error'" class="input-budget-hint">
            输入超过 40000 字，系统可能需要压缩上下文
          </span>
        </div>
        <div class="toolbar-right">
          <button class="send-btn" :disabled="!canSend" @click="handleSend">
            <ArrowUp :size="20" />
          </button>
        </div>
      </div>

      <!-- Hidden file input -->
      <input
        ref="fileInputRef"
        type="file"
        hidden
        accept="image/*"
        multiple
        @change="handleFileChange"
      />

      <!-- Drag overlay -->
      <div v-if="isDragOver" class="drag-overlay">
        <Image :size="24" />
        <span>释放以添加图片</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-stage {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  /* 底部 padding 从 24 缩到 16，减少 input 高度让聊天可视面积更大 */
  padding: 0 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 20;
  pointer-events: none;
}

.input-stage::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  /* Fade 高度从 56 缩到 28，减少对聊天底部内容的遮盖 */
  height: 28px;
  /* Fade 到白色，匹配 SalesView .app-container 背景（2026-04-19 灰→白改动） */
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, #ffffff 100%);
  pointer-events: none;
}

.input-stage::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  /* 匹配 SalesView .app-container 白色背景（2026-04-19 灰→白改动）。
     之前是 var(--bg) (#f7f8fb)，覆盖了 app-container 的白色导致底部灰条。 */
  background: #ffffff;
  z-index: -1;
}

.input-stage > * {
  pointer-events: auto;
}

.input-floating-container {
  width: 100%;
  max-width: 800px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  /* padding 从 16 缩到 10，进一步降低 input 高度 */
  padding: 10px;
  box-shadow: 0 4px 12px rgba(37, 167, 105, 0.05);
  border: 1px solid rgba(37, 167, 105, 0.3);
  transition: all 0.3s ease;
  position: relative;
  display: flex;
  flex-direction: column;
}

.input-floating-container.drag-over {
  border-color: var(--primary);
  box-shadow:
    0 8px 24px rgba(37, 167, 105, 0.12),
    0 0 0 2px rgba(37, 167, 105, 0.2);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  background: rgba(37, 167, 105, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--primary);
  font-size: 0.95rem;
  font-weight: 500;
  pointer-events: none;
  z-index: 10;
}

.input-floating-container:focus-within {
  box-shadow:
    0 8px 24px rgba(37, 167, 105, 0.12),
    0 0 0 2px rgba(37, 167, 105, 0.15);
  border-color: rgba(37, 167, 105, 0.6);
}

.chat-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 40px 10px 0;
  font-size: 1rem;
  resize: none;
  min-height: 44px;
  max-height: 92px;
  color: var(--text);
  line-height: 24px;
  overflow-y: auto;
  transition: none;
  flex: 1;
  font-family: inherit;
}

.input-floating-container.expanded .chat-input {
  max-height: 480px;
  min-height: 200px;
  overflow-y: auto;
}

.chat-input:focus {
  outline: none;
}

.chat-input::placeholder {
  color: var(--text-muted);
}

/* Expand button */
.expand-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s;
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
}

.expand-btn.visible {
  display: flex;
}

.expand-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text);
}

/* Toolbar */
.input-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Mode toggle button */
.mode-toggle-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: white;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.mode-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
  box-shadow: 0 0 4px currentColor;
}

.mode-toggle-btn:hover {
  border-color: rgba(0, 0, 0, 0.2);
}

.mode-toggle-btn.sales-mode {
  background: rgba(37, 167, 105, 0.08);
  border-color: rgba(37, 167, 105, 0.2);
  color: var(--primary);
}

.mode-toggle-btn.sales-mode .mode-indicator {
  background: var(--primary);
  box-shadow: 0 0 6px var(--primary);
}

.mode-toggle-btn.free-mode {
  background: rgba(20, 184, 166, 0.08);
  border-color: rgba(20, 184, 166, 0.2);
  color: #0d9488;
}

.mode-toggle-btn.free-mode .mode-indicator {
  background: #14b8a6;
  box-shadow: 0 0 6px #14b8a6;
}

/* Deep thinking button */
.deep-thinking-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: white;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.deep-thinking-btn.active {
  background: rgba(37, 167, 105, 0.08);
  border-color: rgba(37, 167, 105, 0.2);
  color: var(--primary);
}

/* Image upload button */
.image-upload-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  background: white;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.image-upload-btn:hover {
  background: rgba(37, 167, 105, 0.05);
  border-color: rgba(37, 167, 105, 0.2);
  color: var(--primary);
}

/* Send button */
.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(37, 167, 105, 0.3);
}

.send-btn:hover {
  background: linear-gradient(135deg, var(--accent), var(--primary));
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(37, 167, 105, 0.4);
}

.send-btn:disabled {
  background: #ccc;
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.6;
}

/* ===== Input budget counter ===== */
.input-budget {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  user-select: none;
  max-width: 200px;
  font-variant-numeric: tabular-nums;
}

.input-budget--warning {
  color: var(--color-warning, #d97706);
}

.input-budget--error {
  color: var(--color-danger, #dc2626);
}

.input-budget-hint {
  font-size: 11px;
}

@media (max-width: 768px) {
  .input-stage {
    padding: 8px 16px 16px;
  }

  .input-floating-container {
    border-radius: 16px;
    padding: 12px;
  }

  .mode-toggle-btn span:not(.mode-indicator) {
    display: none;
  }

  .deep-thinking-btn span {
    display: none;
  }

  .image-upload-btn span {
    display: none;
  }

  /* On mobile, hide budget hint text — keep only the label to save space */
  .input-budget-hint {
    display: none;
  }
}
</style>
