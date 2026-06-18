<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  PlanMessage,
  ToolGroupMessage,
  ArtifactMessage,
  FinalAnswerMessage,
  SystemMessage,
  QuestionPromptMessage
} from '@/types/agent'
import type { AnswerItemPayload } from '@/api/agent'
import AgentPlanCard from './AgentPlanCard.vue'
import AgentToolCallList from './AgentToolCallList.vue'
import AgentArtifactItem from './AgentArtifactItem.vue'
import AgentFinalAnswer from './AgentFinalAnswer.vue'
import AgentImagePreview from './AgentImagePreview.vue'
import QuestionPrompt from './QuestionPrompt.vue'
import { useImagePreview } from '@/composables/useImagePreview'
import ThinkingBlock from '@/components/sales/ThinkingBlock.vue'
import { Copy, Check } from 'lucide-vue-next'

interface Props {
  msg: AgentMessage
  readOnly?: boolean
  /** True when this agent-flow message continues the previous one — render with no
   *  avatar and tight spacing so the turn reads as one continuous timeline. */
  continued?: boolean
}

const props = withDefaults(defineProps<Props>(), { readOnly: false, continued: false })

// Bubble QuestionPrompt's answer-submitted up to AgentChatView (via
// AgentMessageList) so it can resume the run. Carries the answered question's
// run_id + the answers map so the view can stream the resumed leg (issue4).
defineEmits<{ 'answer-submitted': [runId: number, answers: Record<string, AnswerItemPayload>] }>()

const copied = ref(false)

const copyText = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
    } catch {
      // silently ignore
    }
  }
}

const renderedMarkdown = computed<string>(() => {
  return renderMarkdown(asAssistant.value?.markdown || '')
})

// 流式助手气泡里内联渲染的图片（markdown ![](url)）点击放大，与 AgentFinalAnswer
// 保持一致的预览/下载体验（共享 useImagePreview + AgentImagePreview）。
const { previewImageUrl, handleImageClick, closePreview } = useImagePreview()

const thinkingFinished = computed<boolean>(() => {
  if (asAssistant.value?.isStreaming) {
    return !!asAssistant.value.markdown
  }
  return true
})

// Type guard helpers (discriminated union 收窄)
const asUser = computed<UserMessage | null>(() => (props.msg.type === 'user' ? props.msg : null))
const asAssistant = computed<AssistantMessage | null>(() =>
  props.msg.type === 'assistant' ? props.msg : null
)
const asPlan = computed<PlanMessage | null>(() => (props.msg.type === 'plan' ? props.msg : null))
const asToolGroup = computed<ToolGroupMessage | null>(() =>
  props.msg.type === 'tool_group' ? props.msg : null
)
const asArtifact = computed<ArtifactMessage | null>(() =>
  props.msg.type === 'artifact' ? props.msg : null
)
const asFinalAnswer = computed<FinalAnswerMessage | null>(() =>
  props.msg.type === 'final_answer' ? props.msg : null
)
const asSystem = computed<SystemMessage | null>(() =>
  props.msg.type === 'system' ? props.msg : null
)
const asQuestionPrompt = computed<QuestionPromptMessage | null>(() =>
  props.msg.type === 'question_prompt' ? (props.msg as QuestionPromptMessage) : null
)

const systemText = computed<string>(() => {
  const sys = asSystem.value
  if (!sys) return ''
  if (sys.markdown) return sys.markdown
  switch (sys.system_subtype) {
    case 'restored':
      return '你正在查看之前的对话'
    case 'stuck':
      return '仍在处理中，复杂调研可能需要几分钟，请耐心等待…'
    case 'cancelled':
      return '好的，已停止。之前生成的内容你可以直接保存。'
    case 'failed':
      return '我尝试了几次但没成功，建议换种问法或联系老师。'
    case 'retry':
      return '我换种方式试试...'
    default:
      return ''
  }
})
</script>

<template>
  <!-- User -->
  <div v-if="asUser" class="msg msg-user">
    <div class="user-bubble-wrap">
      <button
        class="user-copy-btn"
        :class="{ copied: copied }"
        :aria-label="copied ? '已复制' : '复制'"
        @click="copyText(asUser.text)"
      >
        <Check v-if="copied" :size="14" />
        <Copy v-else :size="14" />
      </button>
      <div class="bubble">
        <!-- 问题一: a pure-attachment message (no typed text) must not render an
             empty <p> — that empty paragraph plus .user-atts' border-top left a
             stray divider above the chips. Render text only when present; the
             divider CSS below is then keyed on a preceding .text sibling. -->
        <p v-if="asUser.text" class="text">{{ asUser.text }}</p>
        <div v-if="(asUser.attachments ?? []).length > 0" class="user-atts">
          <span v-for="a in asUser.attachments ?? []" :key="a.url" class="att">
            📎 {{ a.filename }}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Assistant text -->
  <div v-else-if="asAssistant" class="msg msg-assistant" :class="{ continued }">
    <span class="avatar">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="bot-avatar-svg"
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>
    </span>
    <div class="content-wrap">
      <div class="streaming-answer">
        <ThinkingBlock
          v-if="asAssistant.reasoning"
          :content="asAssistant.reasoning"
          :finished="thinkingFinished"
          auto-collapse
        />
        <!-- eslint-disable-next-line vue/no-v-html (markdown 已 DOMPurify sanitize) -->
        <div class="markdown-body" v-html="renderedMarkdown" @click="handleImageClick"></div>
        <span v-if="asAssistant.isStreaming" class="streaming-cursor" aria-hidden="true">▎</span>
      </div>
      <AgentImagePreview :url="previewImageUrl" @close="closePreview" />
    </div>
  </div>

  <!-- Plan card -->
  <div v-else-if="asPlan" class="msg msg-plan" :class="{ continued }">
    <span class="avatar">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="bot-avatar-svg"
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>
    </span>
    <div class="content-wrap">
      <AgentPlanCard :steps="asPlan.plan_steps" />
    </div>
  </div>

  <!-- Tool group -->
  <div v-else-if="asToolGroup" class="msg msg-tool-group" :class="{ continued }">
    <span class="avatar">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="bot-avatar-svg"
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>
    </span>
    <div class="content-wrap">
      <AgentToolCallList :tool-groups="asToolGroup.tool_calls" />
    </div>
  </div>

  <!-- Artifact -->
  <div v-else-if="asArtifact" class="msg msg-artifact" :class="{ continued }">
    <span class="avatar">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="bot-avatar-svg"
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>
    </span>
    <div class="content-wrap">
      <AgentArtifactItem :artifact="asArtifact.artifact" />
    </div>
  </div>

  <!-- Final answer -->
  <div v-else-if="asFinalAnswer" class="msg msg-final" :class="{ continued }">
    <span class="avatar">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="bot-avatar-svg"
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>
    </span>
    <div class="content-wrap">
      <ThinkingBlock
        v-if="asFinalAnswer.reasoning"
        :content="asFinalAnswer.reasoning"
        :finished="true"
        auto-collapse
      />
      <AgentFinalAnswer :markdown="asFinalAnswer.markdown" :run-id="asFinalAnswer.run_id" />
    </div>
  </div>

  <!-- System (本组件直接实现，不外置) -->
  <div v-else-if="asSystem" class="msg msg-system">
    <p class="system-text">{{ systemText }}</p>
  </div>

  <!-- Question prompt (ask_user_question yield) -->
  <div v-else-if="asQuestionPrompt" class="msg msg-question-prompt">
    <span class="avatar">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="bot-avatar-svg"
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>
    </span>
    <div class="content-wrap">
      <QuestionPrompt
        :run-id="asQuestionPrompt.run_id"
        :questions="asQuestionPrompt.questions"
        :answered="asQuestionPrompt.answer_status === 'answered'"
        @answer-submitted="
          (answers) => $emit('answer-submitted', asQuestionPrompt!.run_id, answers)
        "
      />
    </div>
  </div>
</template>

<style scoped>
.msg {
  display: flex;
  gap: 8px;
  /* inter-message spacing is owned by the list container's `gap` (24px); no
     margin-bottom here so it doesn't stack with the gap. */
}

/* Continuation of an agent turn → one continuous timeline under a single avatar:
   hide the repeated avatar (keep its width so content stays aligned) and pull the
   block up tight against the previous flow message (cancels most of the 24px gap). */
.msg.continued {
  margin-top: -19px;
}
.msg.continued .avatar {
  visibility: hidden;
}

.msg-user {
  justify-content: flex-end;
}

.user-bubble-wrap {
  position: relative;
  max-width: 80%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-bubble-wrap .bubble {
  max-width: 100% !important;
  background: var(--primary, #2563eb);
  color: white;
  border: none;
  border-radius: 16px;
  border-bottom-right-radius: 4px;
  padding: 10px 14px;
}

.user-copy-btn {
  position: absolute;
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
  margin-right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.msg-user:hover .user-copy-btn {
  opacity: 1;
  visibility: visible;
}

.user-copy-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
  transform: translateY(-50%) scale(1.1);
}

.user-copy-btn.copied {
  visibility: visible;
  opacity: 1;
  color: var(--primary);
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.08);
}

.msg-user .text {
  margin: 0;
  font-size: 14px;
  color: white;
  white-space: pre-wrap;
}

.user-atts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 问题一: the divider + top spacing only make sense when there is text ABOVE the
   chips. A pure-attachment bubble (no .text sibling) shows just the chips, no
   stray rule. */
.text + .user-atts {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.22);
}

.att {
  font-size: 12px;
  color: white;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.28);
  padding: 3px 8px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.msg-assistant,
.msg-plan,
.msg-tool-group,
.msg-artifact,
.msg-final {
  align-items: flex-start;
}

.avatar {
  font-size: 20px;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.bot-avatar-svg {
  width: 18px;
  height: 18px;
  color: hsl(160, 50%, 45%);
}

.msg-assistant .bubble {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 14px;
  max-width: 80%;
}

.content-wrap {
  flex: 1;
  max-width: 80%;
}

.msg-system {
  justify-content: center;
}

.system-text {
  font-style: italic;
  font-size: 13px;
  color: #6b7280;
  margin: 0;
}

.msg-question-prompt {
  align-items: flex-start;
}

/* P2 fix: "mostly visible, briefly off" convention — cursor visible ~50% of
   the time at top/bottom of cycle, off at 50% midpoint. 1s linear smooth fade
   reads cleaner than step-start (which was inverted / cursor invisible at first
   frame). */
@keyframes blink-cursor {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.streaming-answer {
  position: relative;
  width: 100%;
}

.streaming-answer :deep(.markdown-body) {
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text, #1f2937);
}

/* 内联图片缩略图：点击可放大（见 handleImageClick + AgentImagePreview） */
.streaming-answer :deep(.markdown-body img) {
  max-width: 240px;
  max-height: 180px;
  border-radius: 8px;
  cursor: zoom-in;
  border: 1px solid #e5e7eb;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  display: block;
  margin: 8px 0;
  /* contain（非 cover）— AI 生成图比例任意，cover 会裁掉主体；缩略图也要完整展示 */
  object-fit: contain;
  background: var(--surface-low, #f9fafb);
}

.streaming-answer :deep(.markdown-body img:hover) {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.streaming-answer :deep(.markdown-body h1),
.streaming-answer :deep(.markdown-body h2),
.streaming-answer :deep(.markdown-body h3) {
  margin: 16px 0 8px;
  color: var(--color-text, #1f2937);
}

.streaming-answer :deep(.markdown-body p) {
  margin: 8px 0;
}

.streaming-answer :deep(.markdown-body code) {
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #b91c1c;
}

.streaming-answer :deep(.markdown-body pre) {
  background: #1f2937;
  color: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
}

.streaming-answer :deep(.markdown-body pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.streaming-answer :deep(.markdown-body table) {
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
}

.streaming-answer :deep(.markdown-body th),
.streaming-answer :deep(.markdown-body td) {
  border: 1px solid #e5e7eb;
  padding: 6px 12px;
  text-align: left;
}

.streaming-answer :deep(.markdown-body th) {
  background: #f9fafb;
}

.streaming-cursor {
  display: inline-block;
  color: var(--primary, hsl(160, 72%, 40%));
  animation: blink-cursor 1s linear infinite;
  user-select: none;
  margin-left: 2px;
  vertical-align: middle;
}

/* The caret is a presence marker; under reduced-motion it stays solid (no blink)
   rather than flashing — still a "the pen is in hand" signal, no motion. */
@media (prefers-reduced-motion: reduce) {
  .streaming-cursor {
    animation: none;
    opacity: 1;
  }
}
</style>
