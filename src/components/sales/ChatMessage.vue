<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { Copy, Check, RefreshCw, BookOpen, ThumbsUp, ThumbsDown } from 'lucide-vue-next'
import type { SalesMessage, Citation } from '@/api/sales'
import { submitFeedback as submitFeedbackApi, getFeedback } from '@/api/sales'
import { useMarkdown } from '@/composables/useMarkdown'
import ThinkingBlock from './ThinkingBlock.vue'

const props = withDefaults(
  defineProps<{
    message?: SalesMessage
    streaming?: boolean
    streamContent?: string
    streamThinkingContent?: string
    streamCitations?: Citation[]
    salesStage?: string
    sessionId?: number
  }>(),
  {
    streaming: false,
    streamContent: '',
    streamThinkingContent: '',
    streamCitations: () => [],
    salesStage: '',
    sessionId: 0
  }
)

const emit = defineEmits<{
  showCitations: [citations: Citation[]]
  previewImage: [url: string]
  regenerate: []
}>()

const { render } = useMarkdown()
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})

const isAssistant = computed(() => {
  if (props.streaming) return true
  return props.message?.role === 'assistant'
})

const isUser = computed(() => props.message?.role === 'user')

const displayContent = computed(() => {
  if (props.streaming) return props.streamContent
  if (!props.message) return ''
  // Hide [图片内容]: OCR blocks for user messages
  // OCR blocks are always appended at the end, may contain multi-line text
  if (props.message.role === 'user') {
    return props.message.content.replace(/\n?\[图片内容\]:[\s\S]*/g, '').trim()
  }
  return props.message.content
})

const renderedContent = computed(() => {
  return render(displayContent.value)
})

const thinkingContent = computed(() => {
  if (props.streaming) return props.streamThinkingContent
  return props.message?.thinking || ''
})

const thinkingFinished = computed(() => {
  if (props.streaming) {
    // Thinking is finished when we start getting content tokens
    return !!props.streamContent
  }
  return true
})

const citations = computed<Citation[]>(() => {
  if (props.streaming) return props.streamCitations || []
  return props.message?.verdict?.evidence || []
})

const hasCitations = computed(() => citations.value.length > 0)

const hasImages = computed(() => {
  if (!props.message?.images) return false
  return props.message.images.length > 0
})

const displayImages = computed(() => props.message?.images || [])

const hasImagesOnly = computed(() => {
  return hasImages.value && !displayContent.value
})

// 反馈（点赞/点踩）
const feedbackRating = ref<number>(0)
const feedbackLoading = ref(false)

onMounted(async () => {
  // 加载已有反馈状态
  if (props.message?.id && props.sessionId && props.message.role === 'assistant') {
    try {
      const fb = await getFeedback(props.sessionId, props.message.id)
      if (fb?.rating) feedbackRating.value = fb.rating
    } catch {
      // ignore
    }
  }
})

async function handleFeedback(rating: 1 | -1) {
  if (!props.message?.id || !props.sessionId || feedbackLoading.value) return
  // Toggle off if same rating clicked
  const newRating = feedbackRating.value === rating ? 0 : rating
  feedbackLoading.value = true
  try {
    if (newRating === 0) {
      // 取消反馈：发送 rating=0，后端 upsert 覆盖
      await submitFeedbackApi(props.sessionId, props.message.id, 0)
      feedbackRating.value = 0
    } else {
      await submitFeedbackApi(props.sessionId, props.message.id, newRating)
      feedbackRating.value = newRating
    }
  } catch {
    // ignore
  } finally {
    feedbackLoading.value = false
  }
}

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(displayContent.value)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Fallback for non-secure contexts
    try {
      const textarea = document.createElement('textarea')
      textarea.value = displayContent.value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      copied.value = true
      if (copyTimer) clearTimeout(copyTimer)
      copyTimer = setTimeout(() => (copied.value = false), 2000)
    } catch {
      // silently fail
    }
  }
}
</script>

<template>
  <div class="message" :class="[isAssistant ? 'assistant' : isUser ? 'user' : 'system']">
    <div class="message-content">
      <div v-if="isAssistant && salesStage" class="message-stage">当前阶段：{{ salesStage }}</div>
      <button
        v-if="isUser"
        class="user-copy-btn"
        :class="{ copied }"
        :aria-label="copied ? '已复制' : '复制'"
        @click="copyMessage"
      >
        <Check v-if="copied" :size="14" />
        <Copy v-else :size="14" />
      </button>
      <div class="msg-bubble markdown-body" :class="{ 'img-only': hasImagesOnly }">
        <!-- Image grid for user messages -->
        <div v-if="hasImages" class="message-img-grid">
          <img
            v-for="(url, i) in displayImages"
            :key="url || i"
            :src="url"
            alt="用户上传的图片"
            class="message-img-item"
            @click="emit('previewImage', url)"
          />
        </div>
        <div class="message-text">
          <!-- Thinking block -->
          <ThinkingBlock
            v-if="thinkingContent"
            :content="thinkingContent"
            :finished="thinkingFinished"
          />
          <!-- Message content -->
          <div v-if="isAssistant" v-html="renderedContent"></div>
          <div v-else>{{ displayContent }}</div>
          <!-- AI actions -->
          <div v-if="isAssistant && !streaming" class="ai-actions-container">
            <button
              class="ai-action-btn"
              :class="{ copied }"
              :aria-label="copied ? '已复制' : '复制'"
              :title="copied ? '已复制' : '复制'"
              @click="copyMessage"
            >
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
            </button>
            <span v-if="copied" class="copied-toast">已复制</span>
            <button
              class="ai-action-btn"
              aria-label="重新生成"
              @click="emit('regenerate')"
              title="重新生成"
            >
              <RefreshCw :size="14" />
            </button>
            <button
              v-if="hasCitations"
              class="ai-action-btn citation-action-btn"
              aria-label="查看知识引用"
              @click="emit('showCitations', citations)"
            >
              <BookOpen :size="14" />
              <span>知识引用 ({{ citations.length }})</span>
            </button>
            <button
              class="ai-action-btn"
              :class="{ active: feedbackRating === 1 }"
              @click="handleFeedback(1)"
              title="有帮助"
            >
              <ThumbsUp :size="14" />
            </button>
            <button
              class="ai-action-btn"
              :class="{ active: feedbackRating === -1 }"
              @click="handleFeedback(-1)"
              title="没帮助"
            >
              <ThumbsDown :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;
  animation: slideUp 0.3s ease forwards;
}

.message-content {
  display: flex;
  flex-direction: column;
  max-width: 100%;
  overflow: visible;
}

.message-stage {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
  padding-left: 4px;
}

.message.assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.message.user {
  align-self: flex-end;
  align-items: flex-end;
  flex-direction: column;
  position: relative;
}

.message.user .message-content {
  align-items: flex-end;
  position: relative;
  overflow: visible;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.msg-bubble {
  padding: 16px 20px;
  border-radius: 16px;
  font-size: 0.95rem;
  line-height: 1.6;
  max-width: 100%;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.03);
}

.user .msg-bubble {
  background: var(--primary);
  color: white;
  border-top-right-radius: 4px;
}

.assistant .msg-bubble {
  background: transparent;
  color: var(--text);
  border: none;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
  max-width: 100%;
}

.message.assistant {
  max-width: 100%;
}

/* Message image grid */
.message-img-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(50px, 1fr));
  gap: 6px;
  margin-bottom: 8px;
  width: fit-content;
}

.message-img-item {
  width: 60px;
  height: 50px;
  object-fit: cover;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.user .message-img-item {
  border-color: rgba(255, 255, 255, 0.3);
}

.message-img-item:hover {
  transform: scale(1.05);
}

/* ===== Mobile ===== */
@media (max-width: 768px) {
  .message {
    max-width: 92%;
  }

  .msg-bubble {
    padding: 12px 14px;
    font-size: 0.9rem;
    border-radius: 14px;
  }

  .message-img-grid {
    grid-template-columns: repeat(2, minmax(45px, 1fr));
  }

  .message-img-item {
    width: 50px;
    height: 42px;
  }
}

.msg-bubble.img-only {
  padding: 8px;
}

.msg-bubble.img-only .message-img-grid {
  margin-bottom: 0;
}

.message-text:empty {
  display: none;
}

/* AI actions */
.ai-actions-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  justify-content: flex-start;
}

/* 复制成功浮字，2s 后 copied ref 超时自动消失 */
.copied-toast {
  font-size: 12px;
  color: var(--primary);
  font-weight: 500;
  animation: copied-fade 0.2s ease;
}

@keyframes copied-fade {
  from {
    opacity: 0;
    transform: translateX(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.ai-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-action-btn:hover {
  color: var(--primary);
  background: rgba(37, 167, 105, 0.08);
}

/* Copy 成功：保持高亮 2s，跟浮字 "已复制" 同步 */
.ai-action-btn.copied {
  color: var(--primary);
  background: rgba(37, 167, 105, 0.12);
}

.ai-action-btn.active {
  color: var(--primary);
  background: rgba(37, 167, 105, 0.12);
}

/* User copy button */
.user-copy-btn {
  position: absolute;
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
  margin-right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease;
  visibility: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.user-copy-btn.copied {
  /* Copy 成功：强制可见 + 绿色 check，2s 后 copied ref 超时自动复位 */
  visibility: visible;
  opacity: 1;
  color: var(--primary);
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.08);
}

.user-copy-btn::after {
  content: '';
  position: absolute;
  top: -10px;
  bottom: -10px;
  left: -10px;
  right: -20px;
  z-index: -1;
}

.message.user:hover .user-copy-btn {
  opacity: 1;
  visibility: visible;
}

.user-copy-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  transform: translateY(-50%) scale(1.1);
}

/* Markdown body styles */
.assistant .markdown-body :deep(h1),
.assistant .markdown-body :deep(h2),
.assistant .markdown-body :deep(h3),
.assistant .markdown-body :deep(h4),
.assistant .markdown-body :deep(h5),
.assistant .markdown-body :deep(h6) {
  font-family: var(--font-sans);
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}

.assistant .markdown-body :deep(h1) {
  font-size: 16px;
}

.assistant .markdown-body :deep(h2) {
  font-size: 15px;
}

.assistant .markdown-body :deep(h3),
.assistant .markdown-body :deep(h4),
.assistant .markdown-body :deep(h5),
.assistant .markdown-body :deep(h6) {
  font-size: inherit;
}

.assistant .markdown-body :deep(h1:first-child),
.assistant .markdown-body :deep(h2:first-child),
.assistant .markdown-body :deep(h3:first-child),
.assistant .markdown-body :deep(h4:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p) {
  margin-bottom: 0.8em;
}

/* Markdown 分割线：AI/用户输出的横向分割线在前端完全隐藏 */
.markdown-body :deep(hr) {
  display: none !important;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(pre) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.8em 0;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--accent);
  background: rgba(37, 167, 105, 0.05);
  padding: 8px 12px;
  color: var(--text-muted);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin-bottom: 0.8em;
}

.markdown-body :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 0.9em;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}
</style>
