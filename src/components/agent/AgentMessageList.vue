<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import type { AgentMessage } from '@/types/agent'
import AgentMessageItem from './AgentMessageItem.vue'
import { ChevronDown } from 'lucide-vue-next'

interface Props {
  messages: AgentMessage[]
  readOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), { readOnly: false })

const scroller = ref<HTMLDivElement | null>(null)
const userScrolled = ref(false)
const showBackToBottom = ref(false)

const isAtBottom = (): boolean => {
  const el = scroller.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 30
}

const scrollToBottom = (smooth = true): void => {
  const el = scroller.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

const handleScroll = (): void => {
  if (isAtBottom()) {
    userScrolled.value = false
    showBackToBottom.value = false
  } else {
    userScrolled.value = true
    showBackToBottom.value = true
  }
}

const backToBottom = (): void => {
  scrollToBottom(true)
  userScrolled.value = false
  showBackToBottom.value = false
}

// 新消息到达时自动滚到底（除非用户手动向上滚）
watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (!userScrolled.value) {
      scrollToBottom(true)
    }
  }
)

onMounted(async () => {
  await nextTick()
  scrollToBottom(false)
})
</script>

<template>
  <div class="message-list">
    <div ref="scroller" class="scroller" @scroll="handleScroll">
      <div class="messages-container">
        <AgentMessageItem v-for="msg in messages" :key="msg.id" :msg="msg" :read-only="readOnly" />
      </div>
    </div>
    <button
      v-if="showBackToBottom"
      class="back-to-bottom"
      @click="backToBottom"
      aria-label="回到底部"
    >
      <ChevronDown :size="16" />
      <span>新内容</span>
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
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.back-to-bottom:hover {
  background: var(--color-primary-hover, #1d4ed8);
}
</style>
