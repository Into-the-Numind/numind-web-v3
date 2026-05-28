<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount, computed } from 'vue'
import type { AgentMessage, AssistantMessage } from '@/types/agent'
import { useScrollFollow } from '@/composables/useScrollFollow'
import AgentMessageItem from './AgentMessageItem.vue'
import { ChevronDown } from 'lucide-vue-next'

interface Props {
  messages: AgentMessage[]
  readOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), { readOnly: false })

const scroller = ref<HTMLDivElement | null>(null)
const scrollFollow = useScrollFollow()

// 精准计算当前处于 streaming 状态的助理消息文本长度（合并思考过程 reasoning 与回答 markdown）
const streamingMessageText = computed<string>(() => {
  const streamingMsg = props.messages.find(
    (m): m is AssistantMessage => m.type === 'assistant' && !!(m as any).isStreaming
  )
  if (!streamingMsg) return ''
  return (streamingMsg.markdown || '') + (streamingMsg.reasoning || '')
})

// 监听流式输出文本增长，在 Following 状态下实时平滑滚动到底部
watch(streamingMessageText, () => {
  nextTick(() => {
    if (scroller.value) {
      scrollFollow.checkAndScroll(scroller.value)
    }
  })
})

// 新增消息（如新节点执行、用户消息发送、系统通知等导致 length 变化）时，自动触发跳到底部并重置跟随状态
watch(
  () => props.messages.length,
  async () => {
    await nextTick()
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
    <div ref="scroller" class="scroller">
      <div class="messages-container">
        <AgentMessageItem v-for="msg in messages" :key="msg.id" :msg="msg" :read-only="readOnly" />
      </div>
    </div>
    <!-- 当用户手动向上滚动打断跟随状态时，显示优美的“跳回底部”按钮 -->
    <button
      v-if="scrollFollow.isInterrupted.value"
      class="back-to-bottom"
      @click="scrollFollow.resume(scroller!)"
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
