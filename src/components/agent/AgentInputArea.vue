<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { EstimateResponse, UploadResponse } from '@/types/agent'
import AppButton from '@/components/common/AppButton.vue'
import { Paperclip, Send, X } from 'lucide-vue-next'

interface Props {
  agentId: number
  estimate: EstimateResponse | null
  attachments: UploadResponse[]
  sending?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  sending: false,
  disabled: false
})

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'estimate-request', text: string): void
  (e: 'upload', file: File): void
  (e: 'remove-attachment', id: number): void
  (e: 'reject', reason: string): void
}>()

const text = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_FILE_COUNT = 5
const REJECT_MIME = ['application/x-msdownload', 'application/x-executable']

const canSend = computed(() => text.value.trim().length > 0 && !props.sending && !props.disabled)

// 自动调高度（最多 5 行）
const adjustHeight = (): void => {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  const maxHeight = 5 * 24 + 16 // ~5 lines
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
}

watch(text, adjustHeight)

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
}

const handleKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

const triggerUpload = (): void => {
  fileInput.value?.click()
}

const handleFileChange = (e: Event): void => {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

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
  // 清空 input 让相同文件可重传
  input.value = ''
}

onMounted(adjustHeight)
onUnmounted(() => {
  if (estimateTimer) clearTimeout(estimateTimer)
})
</script>

<template>
  <div class="input-area">
    <!-- 预估提示 -->
    <div
      v-if="estimate && text.trim().length > 0"
      class="estimate"
      :class="{ large: estimate.is_large_task }"
    >
      <template v-if="estimate.is_large_task">
        📊 这个任务预计消耗 {{ estimate.min }}-{{ estimate.max }} 积分
      </template>
      <template v-else> 预计消耗 {{ estimate.min }}-{{ estimate.max }} 积分 </template>
    </div>

    <!-- 附件预览 -->
    <div v-if="attachments.length > 0" class="attachments">
      <span v-for="att in attachments" :key="att.id" class="att-chip">
        📎 {{ att.filename }}
        <button class="remove-btn" aria-label="移除附件" @click="emit('remove-attachment', att.id)">
          <X :size="14" />
        </button>
      </span>
    </div>

    <!-- 输入行 -->
    <div class="input-row">
      <textarea
        ref="textarea"
        v-model="text"
        :disabled="disabled"
        rows="1"
        placeholder="输入你的问题，或拖拽文件到这里..."
        @keydown="handleKeydown"
      />
      <input
        ref="fileInput"
        type="file"
        multiple
        hidden
        accept=".xlsx,.csv,.txt,.pdf,.png,.jpg,.jpeg,.docx"
        @change="handleFileChange"
      />
      <button class="upload-btn" :disabled="disabled" aria-label="上传文件" @click="triggerUpload">
        <Paperclip :size="18" />
      </button>
      <AppButton :disabled="!canSend" @click="handleSend">
        <Send :size="14" />
        <span>发送</span>
      </AppButton>
    </div>
  </div>
</template>

<style scoped>
.input-area {
  position: sticky;
  bottom: 0;
  background: var(--color-surface, #fff);
  border-top: 1px solid var(--color-border, #e5e7eb);
  padding: 12px 20px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}

.estimate {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  margin-bottom: 8px;
}

.estimate.large {
  background: #fff7ed;
  color: #c2410c;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #fdba74;
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.att-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f3f4f6;
  border-radius: 14px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--color-text, #1f2937);
}

.remove-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.input-row {
  display: flex;
  align-items: end;
  gap: 8px;
}

textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s ease;
  background: var(--color-surface, #fff);
}

textarea:focus {
  border-color: var(--color-primary, #2563eb);
}

textarea:disabled {
  background: #f9fafb;
  color: #9ca3af;
}

.upload-btn {
  background: none;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .input-area {
    padding: 10px 12px;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
  }
}
</style>
