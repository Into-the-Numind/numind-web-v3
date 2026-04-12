<!--
  TrailingChat — Gemini 风格全屏聊天面板

  职责：
    - 右侧全屏聊天区域，消息居中 max-width 800px
    - 悬浮 ChatComposer 叠加在底部（position: absolute）
    - 消息列表底部有 padding 避免被 composer 遮挡
    - 空态居中展示"从这里开始追问"

  ## Props

  - runId: number | null
  - conversationId?: string
  - streaming?: boolean
  - streamingMessage?: ChatBubbleMessage | null
  - reloadTrigger?: number

  ## Emits

  - send(text) — 用户发送问题
  - stop() — 用户点击停止
  - error(msg) — 加载历史失败
-->
<template>
  <div class="chat" data-testid="trailing-chat">
    <div ref="historyRef" class="chat__history">
      <!-- Loading -->
      <div v-if="loading" class="chat__loading">
        <span class="chat__spinner" aria-hidden="true" />
        <span>加载对话历史…</span>
      </div>

      <!-- Empty -->
      <div v-else-if="messages.length === 0 && !streamingMessage" class="chat__empty">
        <div class="chat__empty-title">从这里开始追问</div>
        <div class="chat__empty-hint">基于上方 SOP 执行结果，继续和 AI 对话</div>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div class="chat__messages-container">
          <ChatBubble
            v-for="msg in messages"
            :key="msg.id"
            :message="toBubbleMessage(msg)"
            :meta="extractMeta(msg)"
            @copy="handleCopy"
          />
          <ChatBubble
            v-if="streamingMessage"
            :key="streamingMessage.id"
            :message="streamingMessage"
            :streaming="true"
          />
        </div>
      </template>
    </div>

    <ChatComposer
      :streaming="streaming"
      @send="(t: string) => emit('send', t)"
      @stop="emit('stop')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import ChatBubble, { type ChatBubbleMessage } from './ChatBubble.vue'
import ChatComposer from './ChatComposer.vue'
import { listRunChatMessages, type RunChatMessageItem } from '@/api/sop'
import type { SopChatMessageMeta } from '@/views/sop/types'
import { useNotificationsStore } from '@/stores/notifications'

interface Props {
  runId: number | null
  conversationId?: string
  streaming?: boolean
  streamingMessage?: ChatBubbleMessage | null
  reloadTrigger?: number
}

const props = withDefaults(defineProps<Props>(), {
  conversationId: '',
  streaming: false,
  streamingMessage: null,
  reloadTrigger: 0
})

const emit = defineEmits<{
  send: [text: string]
  stop: []
  error: [message: string]
}>()

const notifications = useNotificationsStore()

// ===== 状态 =====
const messages = ref<RunChatMessageItem[]>([])
const loading = ref(false)
const historyRef = ref<HTMLDivElement | null>(null)

// ===== 数据加载 =====

async function loadHistory() {
  if (!props.runId) {
    messages.value = []
    return
  }
  loading.value = true
  try {
    const resp = await listRunChatMessages(props.runId)
    messages.value = resp.messages
    await nextTick()
    scrollToBottom()
  } catch (err) {
    const msg = (err as Error)?.message || '加载聊天历史失败'
    notifications.error(msg)
    emit('error', msg)
  } finally {
    loading.value = false
  }
}

// ===== 消息适配 =====

function toBubbleMessage(item: RunChatMessageItem): ChatBubbleMessage {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    thinking: item.thinking,
    created_at: item.created_at
  }
}

function extractMeta(item: RunChatMessageItem): SopChatMessageMeta | undefined {
  if (item.role !== 'assistant') return undefined
  return {
    model_name: item.model_name ?? '',
    duration_ms: item.duration_ms ?? 0,
    prompt_tokens: item.prompt_tokens,
    completion_tokens: item.completion_tokens,
    total_tokens: item.total_tokens,
    created_at: item.created_at
  }
}

// ===== 交互 =====

async function handleCopy(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    notifications.success('已复制')
  } catch {
    notifications.error('复制失败，请手动选择复制')
  }
}

function scrollToBottom() {
  if (historyRef.value) {
    historyRef.value.scrollTop = historyRef.value.scrollHeight
  }
}

// ===== 生命周期 =====

watch(
  () => props.runId,
  (newId, oldId) => {
    if (newId !== oldId) {
      messages.value = []
      loadHistory()
    }
  }
)

watch(
  () => props.streamingMessage?.content,
  () => {
    nextTick(() => scrollToBottom())
  }
)

watch(
  () => props.reloadTrigger,
  (newVal, oldVal) => {
    if (newVal !== oldVal && props.runId) {
      loadHistory()
    }
  }
)

onMounted(() => {
  if (props.runId) {
    loadHistory()
  }
})

defineExpose({
  messages,
  loadHistory,
  scrollToBottom
})
</script>

<style scoped>
/* .chat — 全屏容器，position relative 让 composer 可以 absolute 定位 */
.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
  overflow: hidden;
}

/* .chat__history — 可滚动消息区，底部留出 composer 空间 */
.chat__history {
  flex: 1;
  min-height: 0;
  padding: var(--space-xl) var(--space-2xl) 120px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.chat__history::-webkit-scrollbar {
  width: 6px;
}

.chat__history::-webkit-scrollbar-track {
  background: transparent;
}

.chat__history::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: var(--radius-pill);
}

.chat__history::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* 消息容器 — 居中 + 限宽，对齐 ChatbotChat 的 .messages-container */
.chat__messages-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  max-width: 800px;
  margin: 0 auto;
}

/* Loading */
.chat__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-3xl);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.chat__spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: chat-spin 0.8s linear infinite;
}

@keyframes chat-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Empty state */
.chat__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--space-3xl) var(--space-lg);
  min-height: 300px;
}

.chat__empty-title {
  font-size: var(--text-lg);
  font-weight: 500;
  color: var(--text);
}

.chat__empty-hint {
  font-size: var(--text-sm);
  color: var(--text-muted);
  max-width: 320px;
}
</style>
