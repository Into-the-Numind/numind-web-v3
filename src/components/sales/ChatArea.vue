<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useSalesStore } from '@/stores/sales'
import { useScrollFollow } from '@/composables/useScrollFollow'
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

const scrollFollow = useScrollFollow()

// ==================== Typewriter Reveal ====================
// 对齐 SOP 的 SSE 渲染方案：后端每 ~250ms burst 推送 ~13 字符，直接渲染会被
// 肉眼感知为掉帧/卡顿。reveal 层由 rAF 驱动以自适应速率搬字（可见滞后约束在 ~maxLagMs 内），产生连续流动感。
const contentReveal = useTypewriterReveal()
const thinkingReveal = useTypewriterReveal()

watch(
  () => store.streamContent,
  (next, prev) => {
    if (!next) {
      contentReveal.reset()
      return
    }
    // 第一个 content token 到达 → thinking 阶段结束，立即 flush thinking typewriter
    if (!prev && next) {
      thinkingReveal.flush()
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
    if (containerRef.value) {
      nextTick(() => scrollFollow.checkAndScroll(containerRef.value!))
    }
  }
)

// Install scroll follow when container ref is available
watch(containerRef, (el) => {
  scrollFollow.uninstall()
  if (el) scrollFollow.install(el)
})

// Scroll to bottom on mount
onMounted(() => {
  nextTick(() => {
    if (containerRef.value) {
      scrollFollow.resume(containerRef.value)
    }
  })
})

onBeforeUnmount(() => {
  scrollFollow.uninstall()
  contentReveal.dispose()
  thinkingReveal.dispose()
})

// 切换会话时重置 scroll follow 状态
watch(
  () => store.currentSessionId,
  () => {
    nextTick(() => {
      if (containerRef.value) scrollFollow.resume(containerRef.value)
    })
  }
)

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
    <div ref="containerRef" class="chat-messages">
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

          <!--
            Stream error 已迁移到全局 toast (notifications.warning) — 见
            stores/sales.ts SSE 'error' 分支。原内联红色气泡因视觉上像 AI
            回复消息、缺乏统一性被移除（chatbot / SOP 同步统一）。streamError
            状态在 store 内仍保留供 preservedError finally 重置逻辑使用。
          -->
        </div>
      </template>
    </div>

    <!-- Scroll to bottom button (anchored above input) -->
    <ScrollToBottomBtn
      :visible="scrollFollow.isInterrupted.value"
      @click="scrollFollow.resume(containerRef!)"
    />
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
  /* padding-bottom 从 200 加到 240：输入框缩高后 input-stage ≈ 196 + fade 28 = 224 被遮，
     240 留 16px 余量让最后一条消息的复制按钮等工具栏不被 input 盖住。 */
  padding: 20px 32px 240px;
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

@media (max-width: 768px) {
  .chat-messages {
    padding: 16px;
  }

  .messages-container {
    gap: 16px;
  }
}
</style>
