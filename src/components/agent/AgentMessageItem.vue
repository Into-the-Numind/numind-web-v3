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
import AgentPlanCard from './AgentPlanCard.vue'
import AgentToolCallList from './AgentToolCallList.vue'
import AgentArtifactItem from './AgentArtifactItem.vue'
import AgentFinalAnswer from './AgentFinalAnswer.vue'
import QuestionPrompt from './QuestionPrompt.vue'
import ThinkingBlock from '@/components/sales/ThinkingBlock.vue'
import { Copy, Check } from 'lucide-vue-next'

interface Props {
  msg: AgentMessage
  readOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), { readOnly: false })

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
      return '任务似乎卡住了，可能需要稍等...'
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
        <p class="text">{{ asUser.text }}</p>
        <div v-if="(asUser.attachments ?? []).length > 0" class="user-atts">
          <span v-for="a in asUser.attachments ?? []" :key="a.url" class="att">
            📎 {{ a.filename }}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Assistant text -->
  <div v-else-if="asAssistant" class="msg msg-assistant">
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
        />
        <!-- eslint-disable-next-line vue/no-v-html (markdown 已 DOMPurify sanitize) -->
        <div class="markdown-body" v-html="renderedMarkdown"></div>
        <span v-if="asAssistant.isStreaming" class="streaming-cursor" aria-hidden="true">▎</span>
      </div>
    </div>
  </div>

  <!-- Plan card -->
  <div v-else-if="asPlan" class="msg msg-plan">
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
  <div v-else-if="asToolGroup" class="msg msg-tool-group">
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
  <div v-else-if="asArtifact" class="msg msg-artifact">
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
  <div v-else-if="asFinalAnswer" class="msg msg-final">
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
      />
      <AgentFinalAnswer
        :markdown="asFinalAnswer.markdown"
        :run-id="asFinalAnswer.run_id"
        :initial-feedback="asFinalAnswer.feedback"
        :initial-note="asFinalAnswer.feedback_note"
      />
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
        :question="asQuestionPrompt.question"
        :options="asQuestionPrompt.options"
        :header="asQuestionPrompt.header"
        :multi-select="asQuestionPrompt.multi_select"
        :answered="asQuestionPrompt.answer_status === 'answered'"
      />
    </div>
  </div>
</template>

<style scoped>
.msg {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
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
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.22);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
  color: var(--primary, #2563eb);
  animation: blink-cursor 1s linear infinite;
  user-select: none;
  margin-left: 2px;
  vertical-align: middle;
}
</style>
