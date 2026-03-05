<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useSalesStore } from '@/stores/sales'
import { useAutoScroll } from '@/composables/useAutoScroll'
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

const {
  smartScrollToBottom,
  onScroll,
  showScrollButton,
  handleScrollToBottomClick
} = useAutoScroll(containerRef)

// Auto-scroll when messages change or streaming content updates (single watcher)
watch(
  () => [store.messages.length, store.streamContent, store.streamThinkingContent] as const,
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
    <div
      ref="containerRef"
      class="chat-messages"
      @scroll="onScroll"
    >
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
            @show-citations="(c) => emit('showCitations', c)"
            @preview-image="(url) => emit('previewImage', url)"
            @regenerate="store.regenerateMessage()"
          />

          <!-- Streaming message (live) — only show when AI starts generating -->
          <ChatMessage
            v-if="store.isLoading && (store.streamContent || store.streamThinkingContent)"
            :streaming="true"
            :stream-content="store.streamContent"
            :stream-thinking-content="store.streamThinkingContent"
            :stream-citations="store.streamCitations"
            :sales-stage="store.salesStage"
            @show-citations="(c) => emit('showCitations', c)"
            @preview-image="(url) => emit('previewImage', url)"
            @regenerate="store.regenerateMessage()"
          />

          <!-- Global loading status — hide once AI starts generating -->
          <GlobalLoadingStatus
            v-if="store.isLoading && store.streamStatus && !store.streamContent && !store.streamThinkingContent"
            :status="store.streamStatus"
          />
        </div>
      </template>

      <!-- Scroll to bottom button -->
      <ScrollToBottomBtn
        :visible="showScrollButton"
        @click="handleScrollToBottomClick"
      />
    </div>
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
  padding: 20px 32px;
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
  padding-bottom: 20px;
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
