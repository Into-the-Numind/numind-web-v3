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
      <div
        v-else-if="messages.length === 0 && !pendingUserMessage && !streamingMessage"
        class="chat__empty"
      >
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
          <!-- 用户刚发送的消息（API 尚未持久化，由父组件传入即时显示） -->
          <ChatBubble
            v-if="pendingUserMessage"
            :key="pendingUserMessage.id"
            :message="pendingUserMessage"
          />
          <!-- AI 流式回复 -->
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
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import ChatBubble, { type ChatBubbleMessage } from './ChatBubble.vue'
import ChatComposer from './ChatComposer.vue'
import { listRunChatMessages, type RunChatMessageItem } from '@/api/sop'
import type { SopChatMessageMeta } from '@/views/sop/types'
import { useNotificationsStore } from '@/stores/notifications'
import { useScrollFollow } from '@/views/sop/composables/useScrollFollow'

interface Props {
  runId: number | null
  conversationId?: string
  streaming?: boolean
  streamingMessage?: ChatBubbleMessage | null
  /** 用户刚发送的消息（尚未持久化），立即显示在消息列表末尾 */
  pendingUserMessage?: ChatBubbleMessage | null
  reloadTrigger?: number
}

const props = withDefaults(defineProps<Props>(), {
  conversationId: '',
  streaming: false,
  streamingMessage: null,
  pendingUserMessage: null,
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

// 自动滚动跟随状态机（2026-04-13 升级后支持 HTMLElement + interrupt + movingDown resume）
const scrollFollow = useScrollFollow()

// ===== 数据加载 =====

/**
 * 强制贴底：nextTick + 两次 rAF。
 *
 * 仅 nextTick 不够——ChatBubble 内部 marked/highlight.js 把 markdown 渲染为
 * 代码块/列表 等异步扩展高度，scrollHeight 在 nextTick 时往往尚未稳定，
 * `scrollFollow.resume()` 基于当时的 scrollHeight 设定 scrollTop，之后高度
 * 继续增长，scrollTop 不再跟随，用户看到的就是"顶部空白 + 最新回复被切掉"。
 *
 * 改为等到下下一帧再 resume——此时布局/样式/字体子像素都已 settled。
 */
async function resumeAfterLayout() {
  await nextTick()
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  if (historyRef.value) scrollFollow.resume(historyRef.value)
}

async function loadHistory() {
  if (!props.runId) {
    messages.value = []
    return
  }
  loading.value = true
  try {
    const resp = await listRunChatMessages(props.runId)
    messages.value = resp.messages
    // 必须在 resume 之前清 loading——loading=true 时 v-if 显示的是 spinner，
    // 消息容器还没挂载，此时 scrollHeight === clientHeight，resume 把 scrollTop
    // 设为 scrollHeight 实际被 clamp 为 0，之后内容扩展 scrollTop 不会跟随。
    loading.value = false
    // 加载/切换 runId / stream 结束后 reload 时重置为 Following 并贴底
    await resumeAfterLayout()
  } catch (err) {
    loading.value = false
    const msg = (err as Error)?.message || '加载聊天历史失败'
    notifications.error(msg)
    emit('error', msg)
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

/**
 * 外部可调：强制贴底。走 resumeAfterLayout 而非裸 resume，
 * 避免调用方未等 markdown 渲染完成就贴底、scrollTop 被 clamp 为 0 的老问题。
 * 保留此方法签名供父组件及 E2E 使用。
 */
async function scrollToBottom() {
  await resumeAfterLayout()
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

/**
 * 流式内容或思考内容生长时：若处于 Following 状态则自动贴底；
 * 若用户已上滑（Interrupted），保持不动 — 由 useScrollFollow 的 onScroll
 * 在用户滑回底部（方向向下 + 近底部）时自动 resume。
 *
 * 同时监听 content 和 thinking：两者都可能独立增长（流式深度思考阶段
 * 只有 thinking 在长，content 为空），都应触发跟随。
 */
watch(
  () => [props.streamingMessage?.content, props.streamingMessage?.thinking],
  () => {
    nextTick(() => {
      if (historyRef.value) scrollFollow.checkAndScroll(historyRef.value)
    })
  }
)

/**
 * 用户刚发送消息（pendingUserMessage 从 null → 对象）：显式强制 resume 贴底。
 *
 * 在修复之前，发送时的"贴底"是靠 streamingMessage 从 null → { content: '' }
 * 的 watcher 顺带 checkAndScroll 的意外副作用——依赖父组件的赋值顺序，
 * 一旦父组件先赋 pendingUserMessage 再 await 一段时间才赋 streamingMessage，
 * 用户就会看到"自己的消息出现在屏幕外"。显式监听 pendingUserMessage 把这个
 * 保障从"侥幸"变成"契约"，并重置 interrupt 状态——用户主动发消息 = 明确想回到底部。
 */
watch(
  () => props.pendingUserMessage?.id,
  (newId, oldId) => {
    if (newId && newId !== oldId && historyRef.value) {
      nextTick(() => {
        if (historyRef.value) scrollFollow.resume(historyRef.value)
      })
    }
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
  if (historyRef.value) scrollFollow.install(historyRef.value)
  if (props.runId) {
    loadHistory()
  }
})

onBeforeUnmount(() => {
  scrollFollow.uninstall()
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

/* .chat__history — 可滚动消息区。composer 是 flex 兄弟（非 absolute），
   此处只需很小的 padding-bottom 作为最后一条气泡和输入框的呼吸间距 */
.chat__history {
  flex: 1;
  min-height: 0;
  padding: var(--space-xl) var(--space-2xl) var(--space-sm);
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
