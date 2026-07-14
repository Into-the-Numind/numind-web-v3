<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { useAgentChatStore } from '@/stores/agentChat'
import { useFeishuStore } from '@/stores/feishu'
import { isGenerationStalled } from '@/utils/agentGeneration'
import type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  PlanMessage,
  ToolGroupMessage,
  ArtifactMessage,
  FinalAnswerMessage,
  SystemMessage,
  QuestionPromptMessage,
  ExternalActionMessage
} from '@/types/agent'
import type { AnswerItemPayload } from '@/api/agent'
import AgentPlanCard from './AgentPlanCard.vue'
import AgentToolCallList from './AgentToolCallList.vue'
import AgentArtifactItem from './AgentArtifactItem.vue'
import AgentFinalAnswer from './AgentFinalAnswer.vue'
import AgentImagePreview from './AgentImagePreview.vue'
import QuestionPrompt from './QuestionPrompt.vue'
import FeishuActionCard from './FeishuActionCard.vue'
import { useImagePreview } from '@/composables/useImagePreview'
import ThinkingBlock from '@/components/sales/ThinkingBlock.vue'
import { Copy, Check, Paperclip, LoaderCircle, ChevronDown, ChevronRight } from 'lucide-vue-next'

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
const emit = defineEmits<{
  'answer-submitted': [runId: number, answers: Record<string, AnswerItemPayload>]
}>()

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
// `external_action` is the sole interactive external
// authorization/confirmation path. A question_prompt remains a genuine in-app
// question. Legacy auth prompts stay visible as a non-interactive notice: an
// ordinary Agent answer could regenerate their original tool call, and their
// old URL must never become actionable again.
const asQuestionPrompt = computed<QuestionPromptMessage | null>(() =>
  props.msg.type === 'question_prompt' && (props.msg as QuestionPromptMessage).pause_type !== 'auth'
    ? (props.msg as QuestionPromptMessage)
    : null
)
const asLegacyAuthPrompt = computed<QuestionPromptMessage | null>(() =>
  props.msg.type === 'question_prompt' && (props.msg as QuestionPromptMessage).pause_type === 'auth'
    ? (props.msg as QuestionPromptMessage)
    : null
)
const asExternalAction = computed<ExternalActionMessage | null>(() =>
  props.msg.type === 'external_action' ? props.msg : null
)

const feishuStore = useFeishuStore()
const feishuActionBusy = ref(false)
const feishuActionError = ref('')

// A server-issued replacement action is a fresh recoverable step. Do not leave
// a prior local transport error attached to its new URL/session.
watch(
  () => [asExternalAction.value?.operation_id, asExternalAction.value?.session_id],
  () => {
    feishuActionError.value = ''
  }
)

function externalActionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function handleExternalResume(
  operationID: string,
  action: 'user_completed' | 'confirmed' | 'cancelled' = 'user_completed'
): Promise<void> {
  const externalAction = asExternalAction.value
  if (!externalAction || props.readOnly || feishuActionBusy.value) return
  feishuActionBusy.value = true
  feishuActionError.value = ''
  try {
    if (action === 'user_completed') {
      await store.resumeFeishuOperation(operationID)
    } else {
      await store.resumeFeishuOperation(operationID, action)
    }
  } catch (error) {
    feishuActionError.value = externalActionErrorMessage(error, '暂时无法继续飞书操作，请稍后重试。')
  } finally {
    feishuActionBusy.value = false
  }
}

async function handleExternalRefresh(sessionID: string): Promise<void> {
  const externalAction = asExternalAction.value
  if (!externalAction || props.readOnly || feishuActionBusy.value) return
  const sessionEpoch = store.currentSessionEpoch()
  const operationID = externalAction.operation_id
  const actionSessionID = externalAction.session_id
  const runID = externalAction.run_id
  feishuActionBusy.value = true
  feishuActionError.value = ''
  try {
    const refreshed = await feishuStore.refreshAction(sessionID)
    const currentAction = asExternalAction.value
    // The request can return after navigation, reset, or a server-issued
    // replacement card. Its one-time URL must only update the exact action
    // that initiated it within the same route/session epoch.
    if (
      !store.isCurrentSessionEpoch(sessionEpoch) ||
      !currentAction ||
      currentAction.operation_id !== operationID ||
      currentAction.session_id !== actionSessionID ||
      currentAction.run_id !== runID
    ) {
      return
    }
    // Refresh replaces a URL for this same durable operation. Route the result
    // through the existing allowlisted stream reducer so the original message is
    // updated in place and no user bubble or ordinary answer is ever created.
    if (refreshed.operation_id !== operationID) {
      throw new Error('飞书操作已更新，请使用对话中的最新步骤。')
    }
    store.applyStreamEvent({
      type: 'external_action',
      seq: externalAction.seq ?? 0,
      ts: new Date().toISOString(),
      run_id: runID,
      data: { provider: 'lark', ...refreshed }
    }, sessionEpoch)
  } catch (error) {
    feishuActionError.value = externalActionErrorMessage(error, '暂时无法刷新飞书链接，请稍后重试。')
  } finally {
    feishuActionBusy.value = false
  }
}

// 问题三: while the streaming assistant bubble sits token-silent (the LLM is composing
// a tool call's args / file content), the bare blinking caret reads as frozen. A 1s
// ticker re-evaluates isStalled so the caret upgrades to an explicit "正在生成…"
// indicator once the silence crosses the threshold AND no tool is active yet (a running
// tool's timeline line owns the liveness signal). nowMs is in Date.now()'s domain to
// match the store's lastStreamDeltaAt.
const store = useAgentChatStore()
const nowMs = ref(Date.now())
let stallTicker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  stallTicker = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (stallTicker) clearInterval(stallTicker)
})
const isGenerating = computed<boolean>(() =>
  isGenerationStalled(
    !!asAssistant.value?.isStreaming,
    store.hasActiveToolCall,
    store.lastStreamDeltaAt,
    nowMs.value
  )
)

// followup3 FE-3: live "writing code" preview. While the streaming bubble is active
// and a whitelisted generation tool is composing its argument (code/document
// content), the store accumulates that text into activeCodeStream. We show it in a
// collapsible fixed-height monospace box below the "正在生成…" indicator. Default
// expanded; the box auto-scrolls to the tail as content streams in (typewriter feel)
// and disappears the instant the tool finishes (activeCodeStream goes empty).
const codeStream = computed<string>(() =>
  asAssistant.value?.isStreaming ? store.activeCodeStream : ''
)
const codeBoxExpanded = ref(true)
const codeScrollEl = ref<HTMLElement | null>(null)
const toggleCodeBox = (): void => {
  codeBoxExpanded.value = !codeBoxExpanded.value
}
watch(codeStream, async (val, old) => {
  // followup3 FE-3 review (P2): default-expanded must hold for EVERY new tool run,
  // not just the first — reset on each empty→non-empty transition so a box the user
  // collapsed during tool-1 doesn't start collapsed for tool-2.
  if (val && !old) codeBoxExpanded.value = true
  if (!val || !codeBoxExpanded.value) return
  await nextTick()
  const el = codeScrollEl.value
  if (el) el.scrollTop = el.scrollHeight
})

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
            <Paperclip :size="13" class="att-icon" />
            <span class="att-name">{{ a.filename }}</span>
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
        <template v-if="asAssistant.isStreaming">
          <!-- 问题三: token-silent stretch → upgrade the bare caret to an explicit
               "正在生成…" indicator so a long file-generation wait doesn't look frozen.
               followup3 FE-1: leading spinner + text (replaces the trailing pulse dots). -->
          <!-- followup3 FE-3 review (P1): the "正在生成…" indicator must stay visible
               WHILE a tool streams its code (codeStream non-empty) — isGenerating alone
               is suppressed once a tool is active, which would otherwise leave the code
               box with no header label. Show it whenever isGenerating OR codeStream. -->
          <span v-if="isGenerating || codeStream" class="generation-stall" aria-live="polite">
            <LoaderCircle :size="14" class="gen-spinner" aria-hidden="true" />
            <span>正在生成…</span>
            <!-- followup3 fix: the toggle arrow sits inline AFTER "正在生成…", not on
                 the left of the code block; it toggles the left-aligned box below. -->
            <button
              v-if="codeStream"
              type="button"
              class="code-stream-toggle"
              :aria-expanded="codeBoxExpanded"
              aria-label="展开/收起生成过程"
              @click="toggleCodeBox"
            >
              <ChevronDown v-if="codeBoxExpanded" :size="14" />
              <ChevronRight v-else :size="14" />
            </button>
          </span>
          <span v-else class="streaming-cursor" aria-hidden="true">▎</span>
          <!-- followup3 FE-3: live "writing code" box — left-aligned, fixed-height
               monospace scroll box auto-scrolled to tail. The toggle arrow lives in
               the "正在生成…" line above; collapses at the step boundary. -->
          <pre
            v-if="codeStream"
            v-show="codeBoxExpanded"
            ref="codeScrollEl"
            class="code-stream-body"
            >{{ codeStream }}</pre
          >
        </template>
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
  <div v-else-if="asExternalAction" class="msg msg-external-action">
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
      <FeishuActionCard
        :action="asExternalAction"
        :busy="feishuActionBusy || readOnly"
        :error="feishuActionError"
        @resume="handleExternalResume"
        @refresh="handleExternalRefresh"
        @confirmed="(operationID) => handleExternalResume(operationID, 'confirmed')"
        @cancelled="(operationID) => handleExternalResume(operationID, 'cancelled')"
      />
    </div>
  </div>

  <!-- A persisted pre-external-action auth prompt has no safe continuation.
       Keep its history visible without exposing its expired URL or answer API. -->
  <div v-else-if="asLegacyAuthPrompt" class="msg msg-system" data-testid="legacy-feishu-auth-notice">
    <p class="system-text">旧的飞书授权步骤已失效，请重新发起操作，或前往设置更新连接。</p>
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
          (answers) => emit('answer-submitted', asQuestionPrompt!.run_id, answers)
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
  gap: 5px;
}

.att-icon {
  flex-shrink: 0;
  opacity: 0.85;
}

.att-name {
  line-height: 1.3;
}

.msg-assistant,
.msg-plan,
.msg-tool-group,
.msg-artifact,
.msg-final,
.msg-external-action {
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

/* 问题三 / followup3 FE-1: the "正在生成…" indicator shown while the bubble is
   streaming but token-silent (the LLM is composing a tool call / file content).
   A leading spinning loader + label reads as active progress where the static
   caret read as frozen. */
.generation-stall {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary, #5f6577);
  font-size: 13px;
  user-select: none;
}
.gen-spinner {
  flex-shrink: 0;
  color: var(--color-primary, hsl(160, 72%, 40%));
  animation: gen-spin 0.8s linear infinite;
}
@keyframes gen-spin {
  to {
    transform: rotate(360deg);
  }
}

/* followup3 FE-3: the toggle arrow sits inline in the "正在生成…" line (a flex
   child of .generation-stall), not on the left of the code block. */
.code-stream-toggle {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary, #5f6577);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
}
.code-stream-toggle:hover {
  background: var(--surface-low, #f3f4f6);
  color: var(--color-text, #1f2937);
}
/* Left-aligned, full-width, uniformly-rounded code box below the indicator. */
.code-stream-body {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  height: 160px;
  margin: 8px 0 0;
  overflow: auto;
  background: #1f2937;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* The caret is a presence marker; under reduced-motion it stays solid (no blink)
   rather than flashing — still a "the pen is in hand" signal, no motion. The
   spinner likewise degrades to a static (non-rotating) loader glyph. */
@media (prefers-reduced-motion: reduce) {
  .gen-spinner {
    animation: none;
  }
  .streaming-cursor {
    animation: none;
    opacity: 1;
  }
}
</style>
