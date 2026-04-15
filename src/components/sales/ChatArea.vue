<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useSalesStore } from '@/stores/sales'
import { useAutoScroll } from '@/composables/useAutoScroll'
import { useTypewriterReveal } from '@/composables/useTypewriterReveal'
import type { Citation } from '@/api/sales'
import ChatMessage from './ChatMessage.vue'
import GlobalLoadingStatus from './GlobalLoadingStatus.vue'
import ScrollToBottomBtn from './ScrollToBottomBtn.vue'
import WelcomeScreen from './WelcomeScreen.vue'

const store = useSalesStore()

const visibleMessages = computed(() => store.messages)

const emit = defineEmits<{
  showCitations: [citations: Citation[]]
  previewImage: [url: string]
}>()

const containerRef = ref<HTMLElement | null>(null)

const { smartScrollToBottom, onScroll, showScrollButton, handleScrollToBottomClick } =
  useAutoScroll(containerRef)

// ==================== Typewriter Reveal ====================
// 对齐 SOP 的 SSE 渲染方案：后端每 ~250ms burst 推送 ~13 字符，直接渲染会被
// 肉眼感知为掉帧/卡顿。reveal 层由 rAF 驱动以固定 80 cps 搬字，产生连续流动感。
const contentReveal = useTypewriterReveal()
const thinkingReveal = useTypewriterReveal()

watch(
  () => store.streamContent,
  (next, prev) => {
    if (!next) {
      contentReveal.reset()
      return
    }
    if (prev && next.startsWith(prev)) {
      contentReveal.append(next.slice(prev.length))
    } else {
      contentReveal.reset(next)
    }
  }
)

watch(
  () => store.streamThinkingContent,
  (next, prev) => {
    if (!next) {
      thinkingReveal.reset()
      return
    }
    if (prev && next.startsWith(prev)) {
      thinkingReveal.append(next.slice(prev.length))
    } else {
      thinkingReveal.reset(next)
    }
  }
)

watch(
  () => store.isLoading,
  (loading, was) => {
    if (was && !loading) {
      contentReveal.flush()
      thinkingReveal.flush()
    }
  }
)

// Auto-scroll when messages change or streaming content updates (single watcher)
watch(
  () =>
    [store.messages.length, contentReveal.displayed.value, thinkingReveal.displayed.value] as const,
  () => {
    requestAnimationFrame(() => smartScrollToBottom())
  }
)

// Scroll to bottom on mount
onMounted(() => {
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  })
})

onBeforeUnmount(() => {
  contentReveal.dispose()
  thinkingReveal.dispose()
})

const showWelcome = ref(false)

watch(
  () => [store.messages.length, store.messagesLoading, store.currentSessionId] as const,
  ([msgCount, loading, sessionId]) => {
    showWelcome.value = !loading && msgCount === 0 && sessionId !== null
  },
  { immediate: true }
)
</script>

<template>
  <div class="chat-wrapper">
    <div ref="containerRef" class="chat-messages" @scroll="onScroll">
      <!-- Welcome screen when no messages -->
      <WelcomeScreen v-if="showWelcome && !store.isLoading" />

      <!-- Messages list -->
      <template v-else>
        <div class="messages-container">
          <ChatMessage
            v-for="msg in visibleMessages"
            :key="msg.id"
            :message="msg"
            :sales-stage="store.salesStage"
            :session-id="store.currentSessionId ?? undefined"
            @show-citations="(c) => emit('showCitations', c)"
            @preview-image="(url) => emit('previewImage', url)"
            @regenerate="store.regenerateMessage()"
          />

          <!-- Streaming message (live) — only show when AI starts generating -->
          <ChatMessage
            v-if="
              store.isLoading && (contentReveal.displayed.value || thinkingReveal.displayed.value)
            "
            :streaming="true"
            :stream-content="contentReveal.displayed.value"
            :stream-thinking-content="thinkingReveal.displayed.value"
            :stream-citations="store.streamCitations"
            :sales-stage="store.salesStage"
            @show-citations="(c) => emit('showCitations', c)"
            @preview-image="(url) => emit('previewImage', url)"
            @regenerate="store.regenerateMessage()"
          />

          <!-- Global loading status — hide once AI starts generating -->
          <GlobalLoadingStatus
            v-if="
              store.isLoading &&
              store.streamStatus &&
              !contentReveal.displayed.value &&
              !thinkingReveal.displayed.value
            "
            :status="store.streamStatus"
          />

          <!-- Stream error display -->
          <div v-if="store.streamError && !store.isLoading" class="stream-error">
            <span>⚠ {{ store.streamError }}</span>
            <button class="stream-error-dismiss" @click="store.streamError = ''">✕</button>
          </div>
        </div>
      </template>
    </div>

    <!-- Scroll to bottom button (anchored above input) -->
    <ScrollToBottomBtn :visible="showScrollButton" @click="handleScrollToBottomClick" />
  </div>
</template>

<style scoped>
.chat-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 32px 200px;
  scroll-behavior: auto;
}

.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
  padding-bottom: 0;
}

.stream-error {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 0.9rem;
  border: 1px solid rgba(239, 68, 68, 0.15);
  max-width: 85%;
}

.stream-error-dismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  padding: 0 2px;
  font-size: 0.85rem;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.stream-error-dismiss:hover {
  opacity: 1;
}

@media (max-width: 768px) {
  .chat-messages {
    padding: 16px;
  }

  .messages-container {
    gap: 16px;
  }
}
</style>
