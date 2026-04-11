<!--
  TrailingChat — v2 redesign state F 的 trailing chat 全铺主区（F10）

  职责：
    - 无 step-header 的全铺聊天面板（左 nav 已标识"继续问 AI"）
    - 渲染历史消息 + ChatComposer
    - 挂载时拉取 listRunChatMessages(runId) 填充历史
    - 将 composer 的 send / stop 事件透传给父组件（F11 主容器接线 SSE 流）
    - 空态展示"从这里开始追问"

  ## 作用域边界（F10 vs F11）

  F10 本 task 只落地 **UI 组件 + emit 链路**。真正的 SSE 流式发送 / stop abort / meta
  注入由 F11 主容器接线 useSSEStream chat 路径 + store.chatMessages。当前组件：
    - 只从后端拉历史，不触发 chat/stream
    - send / stop 仅 emit 到父，父组件负责实际 HTTP

  ## Props

  - runId: number | null — 当前 run ID（null 时只渲染空态，不拉历史）
  - isStreaming?: boolean — 父组件告知当前是否正在流式生成（传给 composer）
  - streamingMessage?: ChatBubbleMessage | null — 正在流式接收的 assistant 占位消息（父传）

  ## Emits

  - send(text) — 用户发送问题
  - stop() — 用户点击停止生成
  - error(msg) — 加载历史失败

  DOM class 对齐 mockup state F：`.chat` / `.chat__history` / `.chat__empty`
  （见 `02-additional-states.html`）。

  详见 spec §5.2 + §3.2 state F + plan Task F10
-->
<template>
  <div class="chat">
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
      </template>
    </div>

    <ChatComposer
      :is-streaming="isStreaming"
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
  isStreaming?: boolean
  streamingMessage?: ChatBubbleMessage | null
}

const props = withDefaults(defineProps<Props>(), {
  isStreaming: false,
  streamingMessage: null
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

/**
 * 后端 RunChatMessageItem → ChatBubble 消费的 ChatBubbleMessage
 * 去掉 meta 字段（meta 单独通过 :meta prop 传入）。
 */
function toBubbleMessage(item: RunChatMessageItem): ChatBubbleMessage {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    thinking: item.thinking,
    created_at: item.created_at
  }
}

/**
 * 提取 assistant 消息的 meta 行字段。
 *
 * - user 消息：无 meta → 返回 undefined（MetaFooter 不渲染）
 * - assistant 消息缺 model_name / duration_ms（B5 部署前）：
 *   传入的 meta.model_name / duration_ms 为空，MetaFooter 内部判空不渲染
 */
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

/** runId 变化时重新加载 */
watch(
  () => props.runId,
  (newId, oldId) => {
    if (newId !== oldId) {
      messages.value = []
      loadHistory()
    }
  }
)

/** streamingMessage 变化时滚到底 */
watch(
  () => props.streamingMessage?.content,
  () => {
    nextTick(() => scrollToBottom())
  }
)

onMounted(() => {
  if (props.runId) {
    loadHistory()
  }
})

// 测试/F11 接线暴露
defineExpose({
  messages,
  loadHistory,
  scrollToBottom
})
</script>

<style scoped>
/* .chat — 全铺容器（mockup state F .chat） */
.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  min-height: 0;
}

/* .chat__history — 可滚动消息区（mockup state F .chat__history） */
.chat__history {
  flex: 1;
  min-height: 0;
  padding: var(--space-xl) var(--space-2xl) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  overflow-y: auto;
  background: var(--color-surface);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.chat__history::-webkit-scrollbar {
  width: 6px;
}

.chat__history::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-pill);
}

/* Loading */
.chat__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-2xl);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.chat__spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
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
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-3xl) var(--space-lg);
}

.chat__empty-title {
  font-size: var(--text-lg);
  font-weight: 500;
  color: var(--color-text);
}

.chat__empty-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  max-width: 320px;
}
</style>
