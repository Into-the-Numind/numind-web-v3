<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount, computed } from 'vue'
import type { AgentMessage, AssistantMessage, ToolGroupMessage } from '@/types/agent'
import type { AnswerItemPayload } from '@/api/agent'
import { useScrollFollow } from '@/composables/useScrollFollow'
import AgentMessageItem from './AgentMessageItem.vue'
import AgentRunPulse from './AgentRunPulse.vue'
import { ChevronDown } from 'lucide-vue-next'

interface Props {
  messages: AgentMessage[]
  readOnly?: boolean
  hasOlder?: boolean
  loadingOlder?: boolean
  olderError?: string | null
  loadOlder?: () => Promise<boolean>
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  hasOlder: false,
  loadingOlder: false,
  olderError: null,
  loadOlder: undefined
})

// One continuous process timeline: consecutive agent-flow messages (thinking,
// tool lines, plan, artifacts, final answer) render under a SINGLE avatar with
// tight spacing, so they read as one flowing block instead of a stack of
// separate avatared cards. A message is "continued" when both it and the message
// before it are agent-flow types.
const FLOW_TYPES = new Set(['assistant', 'tool_group', 'plan', 'artifact', 'final_answer'])
const continuedAt = (i: number): boolean =>
  i > 0 && FLOW_TYPES.has(props.messages[i].type) && FLOW_TYPES.has(props.messages[i - 1].type)

// Forward QuestionPrompt's answer-submitted (run_id + answers) up to AgentChatView.
defineEmits<{ 'answer-submitted': [runId: number, answers: Record<string, AnswerItemPayload>] }>()

const scroller = ref<HTMLDivElement | null>(null)
const scrollFollow = useScrollFollow()
const isPrependingHistory = ref(false)
const LOAD_OLDER_THRESHOLD = 80

const loadOlderFromTop = async (): Promise<void> => {
  const element = scroller.value
  if (
    !element ||
    !props.loadOlder ||
    !props.hasOlder ||
    props.loadingOlder ||
    isPrependingHistory.value
  ) {
    return
  }

  isPrependingHistory.value = true
  const previousScrollHeight = element.scrollHeight
  const previousScrollTop = element.scrollTop
  const viewportTop = element.getBoundingClientRect().top
  const visibleAnchor = Array.from(
    element.querySelectorAll<HTMLElement>('.messages-container > :not(.history-state):not(.history-retry)')
  ).find((candidate) => candidate.getBoundingClientRect().bottom > viewportTop)
  const visibleAnchorTop = visibleAnchor?.getBoundingClientRect().top
  const previousInlineScrollBehavior = element.style.scrollBehavior
  try {
    const loaded = await props.loadOlder()
    await nextTick()
    if (loaded && scroller.value === element) {
      // History prepending is position preservation, not navigation. Disable
      // the container's normal smooth scrolling for these corrective writes.
      element.style.scrollBehavior = 'auto'
      element.scrollTop = previousScrollTop + (element.scrollHeight - previousScrollHeight)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (visibleAnchor?.isConnected && visibleAnchorTop !== undefined) {
        element.scrollTop += visibleAnchor.getBoundingClientRect().top - visibleAnchorTop
      }
    }
  } finally {
    element.style.scrollBehavior = previousInlineScrollBehavior
    isPrependingHistory.value = false
  }
}

const handleScroll = (): void => {
  if (scroller.value && scroller.value.scrollTop <= LOAD_OLDER_THRESHOLD) {
    void loadOlderFromTop()
  }
}

// 精准计算当前处于 streaming 状态的助理消息文本长度（合并思考过程 reasoning 与回答 markdown）
const streamingMessageText = computed<string>(() => {
  const streamingMsg = props.messages.find(
    (m): m is AssistantMessage => m.type === 'assistant' && !!m.isStreaming
  )
  if (!streamingMsg) return ''
  return (streamingMsg.markdown || '') + (streamingMsg.reasoning || '')
})

// Polling updates an existing tool_group in place, so messages.length and the
// streaming assistant text do not change. Track only the small presentation
// facts that affect the visible timeline; this keeps follow-scroll responsive
// without a deep watch over all message content or exposing model reasoning.
const toolNarrationSignature = computed<string>(() =>
  props.messages
    .filter((message): message is ToolGroupMessage => message.type === 'tool_group')
    .map((message) =>
      message.tool_calls
        .map(
          (call) =>
            `${call.tool_call_id}:${call.current_state}:${call.events.length}:${call.events.at(-1)?.timestamp ?? ''}`
        )
        .join(',')
    )
    .join('|')
)

// 监听流式输出文本增长，在 Following 状态下实时平滑滚动到底部
watch(streamingMessageText, () => {
  nextTick(() => {
    if (scroller.value) {
      scrollFollow.checkAndScroll(scroller.value)
    }
  })
})

watch(toolNarrationSignature, () => {
  nextTick(() => {
    if (scroller.value) scrollFollow.checkAndScroll(scroller.value)
  })
})

// 新增消息（如新节点执行、用户消息发送、系统通知等导致 length 变化）时，自动触发跳到底部并重置跟随状态
watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (isPrependingHistory.value) return
    if (scroller.value) {
      scrollFollow.resume(scroller.value)
    }
  }
)

onMounted(async () => {
  await nextTick()
  if (scroller.value) {
    scrollFollow.install(scroller.value)
    // 首次挂载时直接无动画瞬间滚动到最下方
    scrollFollow.resume(scroller.value)
  }
})

onBeforeUnmount(() => {
  scrollFollow.uninstall()
})
</script>

<template>
  <div class="message-list">
    <div ref="scroller" class="scroller" @scroll.passive="handleScroll">
      <div class="messages-container">
        <div v-if="loadingOlder || isPrependingHistory" class="history-state" role="status">
          正在加载更早记录…
        </div>
        <button
          v-else-if="olderError && hasOlder"
          class="history-retry"
          type="button"
          @click="loadOlderFromTop"
        >
          更早记录加载失败，点击重试
        </button>
        <AgentMessageItem
          v-for="(msg, i) in messages"
          :key="msg.id"
          :msg="msg"
          :read-only="readOnly"
          :continued="continuedAt(i)"
          @answer-submitted="(runId, answers) => $emit('answer-submitted', runId, answers)"
        />
        <!-- Trailing inline live line — the consistent "still working" signal at
             the bottom of the flow (replaces the pinned bottom pulse). -->
        <AgentRunPulse v-if="!readOnly" />
      </div>
    </div>
    <!-- 用户手动向上滚动后，用紧凑的圆形箭头回到底部。 -->
    <button
      v-if="scrollFollow.isInterrupted.value"
      class="back-to-bottom"
      @click="scrollFollow.resume(scroller!)"
      aria-label="回到底部"
      title="回到底部"
    >
      <ChevronDown :size="16" />
    </button>
  </div>
</template>

<style scoped>
.message-list {
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.scroller {
  flex: 1;
  overflow-y: auto;
  padding: 20px 32px 200px;
  scroll-behavior: smooth;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.history-state,
.history-retry {
  align-self: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.history-retry {
  border: 0;
  background: transparent;
  color: var(--accent-link);
  cursor: pointer;
}

.history-retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

@media (max-width: 768px) {
  .scroller {
    padding: 16px;
  }
}

.back-to-bottom {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-primary, #2563eb);
  color: #fff;
  border: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.back-to-bottom:hover {
  background: var(--color-primary-hover, #1d4ed8);
}

.back-to-bottom:focus-visible {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: 3px;
}
</style>
