<!--
  ChatBubble — 单条聊天消息气泡

  职责：
    - 显示一条聊天消息（user 或 assistant）
    - 用户消息：右侧气泡，无 thinking / 无操作按钮
    - 助手消息：左侧气泡 + thinking 折叠面板 + 复制 / 重新生成按钮
    - Markdown 渲染 content（通过 @/utils/markdown）
    - 流式状态下显示光标

  ## Props

  - message: ChatBubbleMessage — 消息对象
  - streaming?: boolean — 是否正在流式生成（仅 assistant 有意义）
  - meta?: SopChatMessageMeta — 可选，AI 气泡下方贴 MetaFooter（F10 新增）

  ## Emits

  - copy(content) — 点击复制按钮（父组件调 navigator.clipboard 并 toast）
  - regenerate(messageId) — 点击重新生成（父组件处理删除+重新发送）

  ## 为什么不直接复用 StepOutput

  - StepOutput 有自己的滚动容器 + scrollFollow 集成（整个步骤输出）
  - ChatBubble 是容器的子元素（多条消息共享父级滚动）
  - 两者都会用 renderMarkdown，但外壳和交互完全不同

  详见 spec §8.2
-->
<template>
  <div
    class="chat-bubble"
    :class="[`chat-bubble--${message.role}`, { 'is-streaming': streaming }, { 'is-temp': isTemp }]"
  >
    <!-- 助手头像（左侧） -->
    <div
      v-if="message.role === 'assistant'"
      class="chat-bubble-avatar chat-bubble-avatar--assistant"
      aria-hidden="true"
    >
      AI
    </div>

    <div class="chat-bubble-body">
      <!-- 思维链折叠面板（仅 assistant + 有 thinking） -->
      <div
        v-if="hasThinking"
        class="chat-bubble-thinking"
        :class="{ 'is-collapsed': thinkingCollapsed }"
      >
        <button
          type="button"
          class="chat-bubble-thinking-header"
          :aria-expanded="!thinkingCollapsed"
          @click="thinkingCollapsed = !thinkingCollapsed"
        >
          <span class="chat-bubble-thinking-icon" aria-hidden="true">
            <component :is="thinkingCollapsed ? ChevronRight : ChevronDown" :size="14" />
          </span>
          <span>{{ streaming ? '思考中…' : '思考过程' }}</span>
        </button>
        <div
          v-show="!thinkingCollapsed"
          class="chat-bubble-thinking-content prose"
          v-html="thinkingHtml"
        />
      </div>

      <!-- 主气泡 -->
      <div class="chat-bubble-content">
        <!-- 流式但无内容：光标占位 -->
        <div v-if="streaming && !hasContent && !hasThinking" class="chat-bubble-loading">
          <span class="chat-bubble-cursor" aria-hidden="true" />
          <span>AI 正在思考…</span>
        </div>
        <!-- 正常/流式内容 -->
        <div v-else-if="hasContent" class="chat-bubble-text prose" v-html="contentHtml" />
      </div>

      <!-- meta 行（仅 assistant + 非流式 + 非临时 + 有 meta） — F10 新增 -->
      <MetaFooter
        v-if="message.role === 'assistant' && !streaming && !isTemp && meta"
        class="chat-bubble-meta"
        :latency-ms="meta.duration_ms"
        :model-name="meta.model_name"
        :total-tokens="meta.total_tokens"
        :completed-at="metaCompletedAt"
      />

      <!-- 操作按钮（仅 assistant + 非流式 + 非临时） -->
      <div
        v-if="message.role === 'assistant' && !streaming && !isTemp && hasContent"
        class="chat-bubble-actions"
      >
        <button
          type="button"
          class="chat-bubble-action"
          aria-label="复制"
          @click="emit('copy', message.content)"
        >
          <Copy :size="14" aria-hidden="true" />
          <span>复制</span>
        </button>
        <button
          type="button"
          class="chat-bubble-action"
          aria-label="重新生成"
          @click="emit('regenerate', message.id as number)"
        >
          <RotateCw :size="14" aria-hidden="true" />
          <span>重新生成</span>
        </button>
      </div>
    </div>

    <!-- 用户头像（右侧） -->
    <div
      v-if="message.role === 'user'"
      class="chat-bubble-avatar chat-bubble-avatar--user"
      aria-hidden="true"
    >
      我
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight, ChevronDown, Copy, RotateCw } from 'lucide-vue-next'
import { renderMarkdown } from '@/utils/markdown'
import MetaFooter from './MetaFooter.vue'
import type { SopChatMessageMeta } from '@/views/sop/types'

/**
 * 聊天消息类型（兼容后端 RunChatMessageItem 和前端临时消息）。
 *
 * 临时消息的 id 是字符串（如 "temp_123"），持久化后变为后端分配的 number。
 */
export interface ChatBubbleMessage {
  id: number | string
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  created_at?: string
}

interface Props {
  message: ChatBubbleMessage
  streaming?: boolean
  /**
   * F10 新增：AI 气泡下方 meta 行（模型 + 耗时 + token）。
   * 仅 assistant 角色 + 非流式 + 非临时消息时渲染。
   * 由 TrailingChat 传入，来自 listRunChatMessages 返回的 RunChatMessageItem。
   */
  meta?: SopChatMessageMeta
}

const props = withDefaults(defineProps<Props>(), {
  streaming: false,
  meta: undefined
})

/**
 * meta.created_at 格式化为 "HH:MM:SS"（MetaFooter 期望的 completedAt 字符串）。
 * 若 meta 或 created_at 缺失则返回空字符串，MetaFooter 内部会跳过该段渲染。
 */
const metaCompletedAt = computed(() => {
  const ts = props.meta?.created_at
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const emit = defineEmits<{
  copy: [content: string]
  regenerate: [messageId: number]
}>()

const hasThinking = computed(
  () =>
    props.message.role === 'assistant' &&
    !!props.message.thinking &&
    props.message.thinking.length > 0
)

const hasContent = computed(() => !!props.message.content && props.message.content.length > 0)

/** 临时消息判断（id 是字符串 = 临时） */
const isTemp = computed(() => typeof props.message.id === 'string')

const thinkingCollapsed = ref(!props.streaming)

const thinkingHtml = computed(() => renderMarkdown(props.message.thinking ?? ''))
const contentHtml = computed(() => renderMarkdown(props.message.content))

/**
 * streaming 状态变化时重置折叠：
 * true→false 流式结束，自动折叠思维链
 */
watch(
  () => props.streaming,
  (newVal) => {
    thinkingCollapsed.value = !newVal
  }
)
</script>

<style scoped>
.chat-bubble {
  display: flex;
  gap: var(--space-sm);
  max-width: 100%;
  margin: var(--space-md) 0;
}

.chat-bubble--user {
  flex-direction: row-reverse;
}

.chat-bubble--assistant {
  flex-direction: row;
}

/* ==================== 头像 ==================== */

.chat-bubble-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-surface);
}

.chat-bubble-avatar--assistant {
  background: var(--primary);
}

.chat-bubble-avatar--user {
  background: var(--color-text-secondary);
}

/* ==================== Body ==================== */

.chat-bubble-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  max-width: calc(100% - 40px);
}

.chat-bubble--user .chat-bubble-body {
  align-items: flex-end;
}

.chat-bubble--assistant .chat-bubble-body {
  align-items: flex-start;
}

/* ==================== Thinking 面板 ==================== */

.chat-bubble-thinking {
  width: 100%;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-tint);
  overflow: hidden;
}

.chat-bubble-thinking-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  text-align: left;
  transition: background var(--transition-fast);
}

.chat-bubble-thinking-header:hover {
  background: var(--color-surface-hover);
}

.chat-bubble-thinking-icon {
  font-size: 10px;
  color: var(--color-text-muted);
}

.chat-bubble-thinking-content {
  padding: 0 var(--space-md) var(--space-md);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: var(--line-height-relaxed);
  max-height: 200px;
  overflow-y: auto;
}

/* ==================== 主气泡 ==================== */

.chat-bubble-content {
  max-width: 100%;
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  line-height: var(--line-height-relaxed);
  word-wrap: break-word;
}

.chat-bubble--user .chat-bubble-content {
  background: var(--primary);
  color: var(--primary-foreground);
  border-bottom-right-radius: var(--radius-sm);
}

.chat-bubble--assistant .chat-bubble-content {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border-light);
  border-bottom-left-radius: var(--radius-sm);
}

.chat-bubble-text {
  /* prose 样式由全局定义处理 Markdown 渲染结果 */
}

/* 流式占位 */
.chat-bubble-loading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

.chat-bubble-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--primary);
  animation: chat-cursor-blink 1s infinite;
}

@keyframes chat-cursor-blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}

/* ==================== Meta 行（F10） ==================== */

/*
 * MetaFooter 默认带 padding + border-top + 背景（为 OutputCard foot 设计）。
 * 在 ChatBubble 中它是气泡下方的一行小字 meta，不需要边框/背景/padding。
 * 这里用 :deep() 覆写。
 */
.chat-bubble-meta {
  width: 100%;
}

.chat-bubble-meta :deep(.meta-footer) {
  padding: 0;
  margin-top: var(--space-xs);
  background: transparent;
  border-top: none;
}

/* ==================== 操作按钮 ==================== */

.chat-bubble-actions {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.chat-bubble-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.chat-bubble-action:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
  border-color: var(--color-border);
}
</style>
