<!--
  StepInput — SOP 步骤输入区组件

  职责：
    - textarea 供用户输入
    - 文件上传按钮 + 隐藏 <input type="file">
    - 拖拽区域（dragenter/dragover/dragleave/drop）
    - 上传进度 + 错误反馈
    - 已上传文件的 chip 预览（可删除）

  ## 状态所有权

  - **modelValue (baseText)** 由父组件通过 v-model 持有
  - **upload items** 由本组件通过 useFileUpload composable 管理
  - 父组件调用 `exposed.compose()` 获取最终要发送给后端的完整文本
    （baseText + 成功上传结果）

  ## 为什么不把 compose 结果自动 emit 回 v-model

  用户体验考虑：compose 后的文本包含 OCR/PDF 识别内容，如果自动写回
  textarea，用户看到一大段自动出现的文字会感到困惑（legacy 也是这样设计）。
  正确的 UX：
    - textarea 只显示用户手输的内容（baseText）
    - 上传的文件显示为独立的 chip 预览
    - 最终发送到 LLM 时才合并（由父组件调用 compose()）

  ## Props

  - modelValue: string — 用户输入的基础文本（v-model 绑定）
  - runId: number | null — 当前 run ID（上传 API 必需）
  - nodeId: number | null — 当前 node ID（上传 API 必需）
  - placeholder: string — textarea placeholder
  - disabled: boolean — 整体禁用（上传中或执行中）

  ## Emits

  - update:modelValue — baseText 变化
  - error(msg) — 上传错误（供父组件 toast 提示）

  ## defineExpose

  - compose(): string — 返回完整的"base text + 所有成功上传结果"
  - clearUploads(): void — 清空所有上传条目（切换步骤时父组件调用）

  详见 spec §6
-->
<template>
  <div class="step-input" :class="{ 'is-drag-over': isDragOver, 'is-disabled': disabled }">
    <div
      class="step-input-dropzone"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <textarea
        ref="textareaRef"
        class="step-input-textarea"
        :value="modelValue"
        :placeholder="effectivePlaceholder"
        :disabled="disabled"
        rows="6"
        @input="handleInput"
      />

      <!-- 拖拽提示层，仅在 dragover 时显示 -->
      <div v-if="isDragOver" class="step-input-drag-hint" aria-hidden="true">
        <span>释放以上传文件</span>
      </div>
    </div>

    <!-- 已上传文件的 chip 预览 -->
    <div v-if="fileUpload.items.value.length > 0" class="step-input-chips">
      <div
        v-for="item in fileUpload.items.value"
        :key="item.localId"
        class="step-input-chip"
        :class="[`step-input-chip--${item.status}`, `step-input-chip--${item.kind}`]"
      >
        <span class="step-input-chip-icon" aria-hidden="true">
          {{ chipIconFor(item.kind, item.status) }}
        </span>
        <span class="step-input-chip-name" :title="item.file.name">
          {{ item.file.name }}
        </span>
        <span v-if="item.status === 'uploading'" class="step-input-chip-status">识别中…</span>
        <span
          v-else-if="item.status === 'error'"
          class="step-input-chip-status"
          :title="item.error"
        >
          失败
        </span>
        <button
          v-if="item.status !== 'uploading'"
          type="button"
          class="step-input-chip-remove"
          :aria-label="`移除 ${item.file.name}`"
          @click="fileUpload.removeItem(item.localId)"
        >
          ×
        </button>
      </div>
    </div>

    <!-- 操作栏：上传按钮 -->
    <div class="step-input-actions">
      <input
        ref="fileInputRef"
        type="file"
        class="step-input-file-input"
        multiple
        :accept="acceptString"
        @change="handleFilePick"
      />
      <button
        type="button"
        class="step-input-upload-btn"
        :disabled="disabled"
        @click="triggerFilePicker"
      >
        <span aria-hidden="true">📎</span>
        <span>上传文件</span>
      </button>
      <span v-if="fileUpload.isUploading.value" class="step-input-uploading-hint"> 上传中… </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useFileUpload } from '@/views/sop/composables/useFileUpload'

interface Props {
  modelValue: string
  runId: number | null
  nodeId: number | null
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '在此输入内容，或拖拽文件到此区域…',
  disabled: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  error: [message: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

const fileUpload = useFileUpload()

/**
 * 文件 picker accept 属性 —— 与 useFileUpload 的白名单保持一致
 */
const acceptString = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.pdf,.txt,.md,.docx,.doc,.rtf'

/**
 * 拖拽时替换 placeholder 为指示性文字
 */
const effectivePlaceholder = computed(() =>
  isDragOver.value ? '释放以上传文件' : props.placeholder
)

/**
 * textarea 输入 → 通过 v-model 回传父组件
 */
function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

/**
 * 点击"上传文件"按钮 → 触发隐藏的 file input
 */
function triggerFilePicker() {
  fileInputRef.value?.click()
}

/**
 * 用户通过 picker 选择文件 → 上传
 */
async function handleFilePick(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return
  await doUpload(Array.from(files))
  // 重置 input value，允许用户再次上传同一个文件
  target.value = ''
}

/**
 * 拖拽相关事件
 */
function handleDragEnter() {
  if (props.disabled) return
  isDragOver.value = true
}

function handleDragLeave(event: DragEvent) {
  // 仅当真正离开 dropzone 区域时才重置（避免 child 元素触发 leave 导致闪烁）
  const currentTarget = event.currentTarget as HTMLElement
  const relatedTarget = event.relatedTarget as Node | null
  if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
    isDragOver.value = false
  }
}

async function handleDrop(event: DragEvent) {
  isDragOver.value = false
  if (props.disabled) return
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  await doUpload(Array.from(files))
}

/**
 * 通用上传入口 —— 前置检查 runId/nodeId，之后委托给 composable
 */
async function doUpload(files: File[]) {
  if (!props.runId || !props.nodeId) {
    emit('error', '请先进入节点后再上传文件')
    return
  }
  await fileUpload.handleFiles(files, props.runId, props.nodeId)
  // 如果 composable 记录了错误，emit 给父组件 toast
  if (fileUpload.lastError.value) {
    emit('error', fileUpload.lastError.value)
  }
}

/**
 * Chip 图标映射
 */
function chipIconFor(
  kind: 'image' | 'document' | 'unsupported',
  status: 'pending' | 'uploading' | 'success' | 'error'
): string {
  if (status === 'error') return '⚠'
  if (status === 'uploading') return '⏳'
  if (kind === 'image') return '🖼'
  if (kind === 'document') return '📄'
  return '?'
}

/**
 * 监听 modelValue 变化，同步到 composable 的 baseText。
 *
 * 这样在父组件加载持久化内容或切换节点时，compose() 能返回最新的 baseText。
 */
watch(
  () => props.modelValue,
  (newValue) => {
    fileUpload.baseText.value = newValue
  },
  { immediate: true }
)

/**
 * 暴露给父组件的方法：
 * - compose() — 返回最终合并后的文本（用于 execute API 调用）
 * - clearUploads() — 清空上传条目（切换步骤时调用）
 * - focus() — 让父组件能聚焦 textarea
 */
defineExpose({
  compose: () => fileUpload.compose(),
  clearUploads: () => fileUpload.clearItems(),
  focus: () => textareaRef.value?.focus()
})
</script>

<style scoped>
.step-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
}

.step-input.is-disabled {
  opacity: 0.65;
  pointer-events: none;
}

/* ==================== Dropzone + textarea ==================== */

.step-input-dropzone {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.step-input-dropzone:hover {
  border-color: var(--primary);
}

.step-input.is-drag-over .step-input-dropzone {
  border-color: var(--primary);
  border-style: dashed;
  box-shadow: var(--shadow-focus);
}

.step-input-textarea {
  display: block;
  width: 100%;
  min-height: 140px;
  padding: var(--space-md) var(--space-lg);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
  resize: vertical;
  outline: none;
}

.step-input-textarea::placeholder {
  color: var(--color-text-muted);
}

.step-input-textarea:focus {
  box-shadow: var(--shadow-focus);
  border-radius: var(--radius-md);
}

.step-input-drag-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent-ultra-soft);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--primary);
  pointer-events: none;
}

/* ==================== Chips 预览 ==================== */

.step-input-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.step-input-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  color: var(--color-text);
  max-width: 260px;
}

.step-input-chip--success {
  background: var(--color-accent-ultra-soft);
  border-color: var(--color-accent-soft);
}

.step-input-chip--uploading {
  background: var(--color-surface-hover);
}

.step-input-chip--error {
  background: hsl(0, 60%, 97%);
  border-color: hsl(0, 60%, 85%);
  color: hsl(0, 60%, 45%);
}

.step-input-chip-icon {
  flex-shrink: 0;
  font-size: var(--text-sm);
  line-height: 1;
}

.step-input-chip-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-input-chip-status {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-left: var(--space-xs);
}

.step-input-chip-remove {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: var(--text-base);
  line-height: 1;
  padding: 0 var(--space-xs);
  border-radius: 4px;
  transition: color var(--transition-fast);
}

.step-input-chip-remove:hover {
  color: var(--color-text);
}

/* ==================== 操作栏 ==================== */

.step-input-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.step-input-file-input {
  display: none;
}

.step-input-upload-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--color-text);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.step-input-upload-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  border-color: var(--primary);
  color: var(--primary);
}

.step-input-upload-btn:disabled {
  cursor: not-allowed;
}

.step-input-uploading-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>
