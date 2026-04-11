<!--
  TrailingChatPanel — SOP 末尾 AI 聊天面板

  职责：
    - 加载某 run 的聊天历史（GET /v1/sop/runs/:id/chat-messages）
    - 用户发送问题 → POST /v1/sop/chat/stream（JSON body，含 deep_thinking）
    - 流式接收 AI 回复（useSSEStream）
    - 管理消息列表 + 自动滚动到底部
    - 重新生成最后一条 assistant 消息

  ## 关键事实（task 1 research 确认，task 20 reviewer 要求严格）

  1. **conversation_id 由 store.currentRun.conversation_id 提供**：
     - 不从 SSE 流提取
     - 也不需要首次发送后持久化
     - 后端以 run.conversation_id 为准（biz/sop/sop.go:1195-1199 的 mismatch 校验）

  2. **chat/stream 是 JSON body 不是 FormData**（实测 sop.go:2289-2294）：
     ```json
     {
       "run_id": number,
       "conversation_id": string,
       "question": string,
       "deep_thinking": boolean,
       "regenerate_msg_id": number (0=不重新生成)
     }
     ```

  3. **SSE 事件格式**（实测 sop.go:2364-2380）：
     - thinking: event=thinking, data=JSON-encoded string
     - message: 无 event 行, data=JSON-encoded string
     - done: event=done, data={"status":"completed","message_id":<id>}
     - error: event=error, data=JSON-encoded string

  4. **HTTP 403 额度不足检测**：由 axios 拦截器 dispatchEvent → App.vue →
     uiDialogs store → InsufficientCreditsDialog（task 14 修订）

  ## Props

  - runId: number — 当前 run ID（必需）
  - conversationId: string — 来自 store.currentRun.conversation_id
  - deepThinking?: boolean — 深度思考开关（默认 false，由 ModelSelector 控制）
  - visible?: boolean — 面板是否激活（用于条件加载）

  ## Emits

  - error(msg) — 流式错误（用于父组件显示 toast）

  详见 spec §8 + task 1 research
-->
<template>
  <div class="trailing-chat-panel">
    <!-- 消息列表滚动容器 -->
    <div ref="scrollContainerRef" class="trailing-chat-messages">
      <!-- Loading -->
      <div v-if="loading" class="trailing-chat-loading">
        <span class="trailing-chat-spinner" aria-hidden="true" />
        <span>加载对话历史…</span>
      </div>

      <!-- Empty -->
      <div v-else-if="messages.length === 0 && !streamingMessage" class="trailing-chat-empty">
        <div class="trailing-chat-empty-icon" aria-hidden="true">💬</div>
        <div class="trailing-chat-empty-title">继续和 AI 对话</div>
        <div class="trailing-chat-empty-hint">可以基于上方 SOP 的结果，问 AI 任何后续问题</div>
      </div>

      <!-- 已有消息 + 正在流式生成的消息 -->
      <template v-else>
        <ChatBubble
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          @copy="handleCopy"
          @regenerate="handleRegenerate"
        />
        <ChatBubble
          v-if="streamingMessage"
          :key="streamingMessage.id"
          :message="streamingMessage"
          :streaming="true"
        />
      </template>
    </div>

    <!-- ScrollFollowButton 悬浮按钮 -->
    <ScrollFollowButton :visible="scrollFollow.isInterrupted.value" @click="handleScrollResume" />

    <!-- 输入区 -->
    <div class="trailing-chat-input-area">
      <textarea
        ref="inputRef"
        v-model="inputText"
        class="trailing-chat-input"
        placeholder="输入你的问题，Enter 发送，Shift+Enter 换行"
        rows="2"
        :disabled="sending"
        @keydown.enter.exact.prevent="send"
      />
      <button type="button" class="trailing-chat-send-btn" :disabled="!canSend" @click="send">
        <span v-if="sending" aria-hidden="true">⏳</span>
        <span v-else aria-hidden="true">↑</span>
        <span>{{ sending ? '生成中' : '发送' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import ChatBubble, { type ChatBubbleMessage } from './ChatBubble.vue'
import ScrollFollowButton from './ScrollFollowButton.vue'
import { useSSEStream } from '@/views/sop/composables/useSSEStream'
import { useScrollFollow } from '@/views/sop/composables/useScrollFollow'
import { listRunChatMessages, type RunChatMessageItem } from '@/api/sop'
import { useNotificationsStore } from '@/stores/notifications'

interface Props {
  runId: number
  conversationId: string
  deepThinking?: boolean
  /** 面板是否可见（从不可见切到可见时自动加载一次） */
  visible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  deepThinking: false,
  visible: true
})

const emit = defineEmits<{
  error: [message: string]
}>()

const notifications = useNotificationsStore()

// ===== 状态 =====
const messages = ref<ChatBubbleMessage[]>([])
const streamingMessage = ref<ChatBubbleMessage | null>(null)
const inputText = ref('')
const loading = ref(false)
const sending = ref(false)

const scrollContainerRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)

const sseStream = useSSEStream()
const scrollFollow = useScrollFollow()

// ===== Computed =====
const canSend = computed(() => {
  return !sending.value && inputText.value.trim().length > 0 && props.runId > 0
})

// ===== 数据加载 =====

/**
 * 把后端 RunChatMessageItem 转换为 ChatBubble 可消费的 ChatBubbleMessage
 */
function toChatBubbleMessage(item: RunChatMessageItem): ChatBubbleMessage {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    thinking: item.thinking,
    created_at: item.created_at
  }
}

async function loadHistory() {
  if (!props.runId) return
  loading.value = true
  try {
    const resp = await listRunChatMessages(props.runId)
    messages.value = resp.messages.map(toChatBubbleMessage)
    // 加载后滚到底
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

// ===== 发送消息 =====

/** 生成临时消息 ID（字符串，与后端 number ID 区分） */
function makeTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 发送消息核心逻辑。
 *
 * @param question 用户输入
 * @param regenerateMsgId 如为非 0，表示重新生成某条 assistant 消息
 */
async function sendMessage(question: string, regenerateMsgId: number = 0) {
  if (!props.runId) {
    emit('error', 'run ID 无效')
    return
  }

  sending.value = true

  // 非重新生成：添加用户消息到列表
  if (regenerateMsgId === 0) {
    messages.value.push({
      id: makeTempId(),
      role: 'user',
      content: question
    })
  }

  // 创建 streaming 占位消息
  streamingMessage.value = {
    id: makeTempId(),
    role: 'assistant',
    content: '',
    thinking: ''
  }

  await nextTick()
  scrollToBottom()

  const body = {
    run_id: props.runId,
    conversation_id: props.conversationId || '',
    question,
    deep_thinking: props.deepThinking,
    regenerate_msg_id: regenerateMsgId
  }

  // 构建 API URL 与 useDraftLifecycle.getApiBaseURL 逻辑保持一致
  const baseURL = resolveApiBaseURL()
  const url = `${baseURL}/v1/sop/chat/stream`

  await sseStream.streamPost(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    {
      onThinking: (chunk) => {
        if (streamingMessage.value) {
          streamingMessage.value.thinking = (streamingMessage.value.thinking || '') + chunk
          checkAutoScroll()
        }
      },
      onMessage: (chunk) => {
        if (streamingMessage.value) {
          streamingMessage.value.content = (streamingMessage.value.content || '') + chunk
          checkAutoScroll()
        }
      },
      onDone: (meta) => {
        if (streamingMessage.value) {
          // 成功：把 streamingMessage 提交到 messages，用 message_id 关联
          const finalMsg: ChatBubbleMessage = {
            ...streamingMessage.value,
            id: meta.message_id ?? streamingMessage.value.id
          }
          messages.value.push(finalMsg)
          streamingMessage.value = null
        }
        sending.value = false
      },
      onError: (errMsg) => {
        // 保留已收到的部分内容，标记为失败
        if (
          streamingMessage.value &&
          !streamingMessage.value.content &&
          !streamingMessage.value.thinking
        ) {
          // 完全没收到内容，直接丢弃 streaming 占位
          streamingMessage.value = null
        } else if (streamingMessage.value) {
          // 已收到部分内容 → 作为一条 assistant 消息保留
          const partialMsg: ChatBubbleMessage = {
            ...streamingMessage.value,
            content: (streamingMessage.value.content || '') + `\n\n⚠ 生成中断：${errMsg}`
          }
          messages.value.push(partialMsg)
          streamingMessage.value = null
        }
        notifications.error(errMsg)
        emit('error', errMsg)
        sending.value = false
      }
    }
  )
}

/** 点击发送按钮或 Enter 键 */
async function send() {
  const text = inputText.value.trim()
  if (!text || !canSend.value) return
  inputText.value = ''
  await sendMessage(text, 0)
}

/** 处理重新生成：删除最后一条 assistant 消息 + 前一条 user 消息，重新发送 */
async function handleRegenerate(messageId: number) {
  // 找到目标 assistant 消息
  const assistantIdx = messages.value.findIndex((m) => m.id === messageId)
  if (assistantIdx === -1) return

  // 前一条应是 user 消息，从它重新发起
  const userIdx = assistantIdx - 1
  if (userIdx < 0) return
  const userMsg = messages.value[userIdx]
  if (userMsg.role !== 'user') return

  // 从列表移除这两条
  messages.value.splice(userIdx, 2)
  // 重新添加 user 消息并发起请求
  messages.value.push({
    id: makeTempId(),
    role: 'user',
    content: userMsg.content
  })
  await sendMessage(userMsg.content, messageId)
}

/** 复制消息内容到剪贴板 */
async function handleCopy(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    notifications.success('已复制')
  } catch {
    notifications.error('复制失败，请手动选择复制')
  }
}

/** 点击"跳回底部"按钮 */
function handleScrollResume() {
  if (scrollContainerRef.value) {
    scrollFollow.resume(scrollContainerRef.value)
  }
}

// ===== 滚动管理 =====

function scrollToBottom() {
  if (!scrollContainerRef.value) return
  scrollContainerRef.value.scrollTop = scrollContainerRef.value.scrollHeight
}

function checkAutoScroll() {
  nextTick(() => {
    if (scrollContainerRef.value) {
      scrollFollow.checkAndScroll(scrollContainerRef.value)
    }
  })
}

// ===== 辅助 =====

/**
 * 解析 API baseURL（与 useDraftLifecycle 的 getApiBaseURL 逻辑一致）。
 */
function resolveApiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (!raw) return '/api'
  if (/\/dev\/?$/i.test(raw) || /youshu\.asia\/dev\/?$/i.test(raw)) return '/api'
  return raw.replace(/\/$/, '')
}

// ===== 生命周期 =====

/**
 * 面板可见时加载历史（从不可见切到可见）
 */
watch(
  () => props.visible,
  (visible, oldVisible) => {
    if (visible && !oldVisible) {
      loadHistory()
    }
  }
)

/**
 * runId 变化时重新加载（切换 run 场景）
 *
 * 关键：必须先 abort 旧的 SSE 流再清 state。否则旧流的 onMessage/onDone
 * 回调仍会运行，写入新 run 的 messages，并错误地解锁 sending flag。
 */
watch(
  () => props.runId,
  (newId, oldId) => {
    if (newId && newId !== oldId) {
      sseStream.abort()
      sending.value = false
      messages.value = []
      streamingMessage.value = null
      loadHistory()
    }
  }
)

onMounted(() => {
  // 安装 scrollFollow 到滚动容器
  if (scrollContainerRef.value) {
    scrollFollow.install(scrollContainerRef.value)
  }
  // 初始加载（visible 默认 true 时）
  if (props.visible && props.runId) {
    loadHistory()
  }
})

onBeforeUnmount(() => {
  scrollFollow.uninstall()
  sseStream.abort()
})

// 测试暴露
defineExpose({
  loadHistory,
  sendMessage,
  messages,
  streamingMessage
})
</script>

<style scoped>
.trailing-chat-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 100%;
  height: 100%;
  min-height: 0;
  /* 相对定位让 ScrollFollowButton 的 absolute 正确定位 */
  position: relative;
}

/* ==================== 消息列表滚动容器 ==================== */

.trailing-chat-messages {
  flex: 1;
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
  padding: var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.trailing-chat-messages::-webkit-scrollbar {
  width: 6px;
}

.trailing-chat-messages::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-pill);
}

/* ==================== Loading / Empty ==================== */

.trailing-chat-loading,
.trailing-chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-3xl);
  color: var(--color-text-muted);
}

.trailing-chat-loading {
  flex-direction: row;
  font-size: var(--text-sm);
}

.trailing-chat-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: tc-spin 0.8s linear infinite;
}

@keyframes tc-spin {
  to {
    transform: rotate(360deg);
  }
}

.trailing-chat-empty-icon {
  font-size: 48px;
  line-height: 1;
  margin-bottom: var(--space-sm);
}

.trailing-chat-empty-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
}

.trailing-chat-empty-hint {
  font-size: var(--text-sm);
  text-align: center;
  max-width: 320px;
}

/* ==================== 输入区 ==================== */

.trailing-chat-input-area {
  display: flex;
  gap: var(--space-sm);
  align-items: flex-end;
  padding: var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.trailing-chat-input {
  flex: 1;
  min-height: 40px;
  max-height: 160px;
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: var(--text-sm);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
  resize: none;
  outline: none;
}

.trailing-chat-input::placeholder {
  color: var(--color-text-muted);
}

.trailing-chat-send-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.trailing-chat-send-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.trailing-chat-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
