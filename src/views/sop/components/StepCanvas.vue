<script setup lang="ts">
/**
 * StepCanvas — SOP 运行页主区路由器（F4 + F11）
 *
 * 职责：根据 store.isViewingTrailingChat 决定渲染 SopStepView 还是 TrailingChat。
 *
 * F11 扩展：
 *   - 直接渲染 TrailingChat（不再占位）
 *   - 透传 SopStepView 的 execute/stop/copy/regenerate/primary/secondary/return-current/error
 *     以及 TrailingChat 的 chat-send/chat-stop/chat-error 事件到 F11 主容器
 *
 * 结构对应 mockup 01-active-and-history.html 的 .main / .canvas。
 * 详见 spec §5.2 + plan F4 / F11。
 */
import { computed } from 'vue'
import { useSopRunStore } from '@/stores/sopRun'
import type { ChatBubbleMessage } from './ChatBubble.vue'
import SopStepView from './SopStepView.vue'
import TrailingChat from './TrailingChat.vue'

interface Props {
  ensureRun?: () => Promise<number | null>
  currentStep?: number
  currentStepName?: string
  inputLabel?: string
  inputHint?: string
  /** trailing chat 是否正在流式 */
  chatStreaming?: boolean
  /** trailing chat 的流式占位消息 */
  chatStreamingMessage?: ChatBubbleMessage | null
  /** 用户刚发送的消息（立即显示） */
  chatPendingUserMessage?: ChatBubbleMessage | null
  /** 父容器 onDone 后递增以触发 TrailingChat 重新拉取历史（F11 P1-3 fix） */
  chatReloadTrigger?: number
}

withDefaults(defineProps<Props>(), {
  ensureRun: undefined,
  currentStep: 1,
  currentStepName: '',
  inputLabel: '你的输入',
  inputHint: '必填 · 直接粘贴草稿即可',
  chatStreaming: false,
  chatStreamingMessage: null,
  chatPendingUserMessage: null,
  chatReloadTrigger: 0
})

const store = useSopRunStore()

const isViewingTrailingChat = computed(() => store.isViewingTrailingChat)
const viewingNode = computed(() => store.viewingNode)
const viewingStepStatus = computed(() => store.viewingStepStatus)

defineEmits<{
  // Step view
  execute: [text: string]
  copy: []
  regenerate: []
  primary: []
  secondary: []
  'return-current': []
  error: [msg: string]
  // Trailing chat
  'chat-send': [text: string]
  'chat-stop': []
  'chat-error': [msg: string]
}>()
</script>

<template>
  <section class="main">
    <div class="canvas">
      <SopStepView
        v-if="!isViewingTrailingChat"
        :node="viewingNode"
        :status="viewingStepStatus"
        :ensure-run="ensureRun"
        :current-step="currentStep"
        :current-step-name="currentStepName"
        :input-label="inputLabel"
        :input-hint="inputHint"
        @execute="(text: string) => $emit('execute', text)"
        @copy="$emit('copy')"
        @regenerate="$emit('regenerate')"
        @primary="$emit('primary')"
        @secondary="$emit('secondary')"
        @return-current="$emit('return-current')"
        @error="(msg: string) => $emit('error', msg)"
      />
      <TrailingChat
        v-else
        :run-id="store.currentRun?.id ?? null"
        :conversation-id="store.currentRun?.conversation_id ?? ''"
        :streaming="chatStreaming"
        :streaming-message="chatStreamingMessage"
        :pending-user-message="chatPendingUserMessage"
        :reload-trigger="chatReloadTrigger"
        @send="(text: string) => $emit('chat-send', text)"
        @stop="$emit('chat-stop')"
        @error="(msg: string) => $emit('chat-error', msg)"
      />
    </div>
  </section>
</template>

<style scoped>
/* 主区容器 —— 对齐 mockup 01 .main / .canvas
 * 说明：间距使用 .sop-run-view-v2 scope 内暴露的 --space-* token。
 */
.main {
  display: flex;
  flex-direction: column;
  /* 生产环境: 微绿灰底色，让毛玻璃卡片浮起来 */
  background: var(--bg);
  flex: 1;
}

/* 非 trailing 模式：无内部滚动，内容自然撑高，由 body/window 滚动。
 * SOP step view 场景下的主 UX —— 使整页作为单一滚动上下文。*/
.canvas {
  padding: var(--space-3xl) calc(var(--space-4xl) + var(--space-sm)) var(--space-4xl);
  font-family: var(--font-sans);
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* trailing chat 模式：保持固定视口高度，让 TrailingChat 内部独立滚动
 * （聊天输入框需贴底、历史消息自滚才能用）。
 * TopBar 56px 已由 sticky 占位，这里减去它得到 chat 可视区域。*/
.canvas:has(> [data-testid='trailing-chat']) {
  padding: 0;
  height: calc(100vh - 56px);
  overflow: hidden;
  align-items: stretch;
}
</style>
