<script setup lang="ts">
import { computed } from 'vue'
import type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  PlanMessage,
  ToolGroupMessage,
  ArtifactMessage,
  FinalAnswerMessage,
  SystemMessage
} from '@/types/agent'

interface Props {
  msg: AgentMessage
  readOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), { readOnly: false })

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
    <div class="bubble">
      <p class="text">{{ asUser.text }}</p>
      <div v-if="asUser.attachments && asUser.attachments.length > 0" class="user-atts">
        <span v-for="a in asUser.attachments" :key="a.id" class="att"> 📎 {{ a.filename }} </span>
      </div>
    </div>
  </div>

  <!-- Assistant text -->
  <div v-else-if="asAssistant" class="msg msg-assistant">
    <span class="avatar">🤖</span>
    <div class="bubble">
      <p class="text">{{ asAssistant.markdown }}</p>
    </div>
  </div>

  <!-- Plan card (placeholder — T10 实装 AgentPlanCard.vue 后接线) -->
  <div v-else-if="asPlan" class="msg msg-plan">
    <span class="avatar">🤖</span>
    <!-- TODO: 接 T10 AgentPlanCard 组件 -->
    <div class="plan-placeholder">
      <p class="plan-title">📋 我的计划</p>
      <ol class="plan-steps">
        <li v-for="(step, idx) in asPlan.plan_steps" :key="idx">{{ step }}</li>
      </ol>
    </div>
  </div>

  <!-- Tool group (placeholder — T10 实装 AgentToolCallList 后接线) -->
  <div v-else-if="asToolGroup" class="msg msg-tool-group">
    <span class="avatar">🤖</span>
    <!-- TODO: 接 T10 AgentToolCallList 组件 -->
    <div class="tool-placeholder">
      <p v-for="tc in asToolGroup.tool_calls" :key="tc.tool_call_id" class="tool-line">
        <span class="tool-icon">{{
          tc.current_state === 'result'
            ? '✓'
            : tc.current_state === 'error'
              ? '⚠️'
              : tc.current_state === 'rejected'
                ? '✕'
                : '⋯'
        }}</span>
        <span class="tool-msg">{{ tc.events[tc.events.length - 1]?.message ?? '...' }}</span>
      </p>
    </div>
  </div>

  <!-- Artifact (placeholder — T11 实装 AgentArtifactItem 后接线) -->
  <div v-else-if="asArtifact" class="msg msg-artifact">
    <span class="avatar">🤖</span>
    <!-- TODO: 接 T11 AgentArtifactItem 组件 -->
    <div class="artifact-placeholder">
      <a :href="asArtifact.artifact.url" target="_blank">📄 {{ asArtifact.artifact.filename }}</a>
    </div>
  </div>

  <!-- Final answer (placeholder — T11 实装 AgentFinalAnswer + AgentFeedbackBar) -->
  <div v-else-if="asFinalAnswer" class="msg msg-final">
    <span class="avatar">🤖</span>
    <!-- TODO: 接 T11 AgentFinalAnswer + AgentFeedbackBar -->
    <div class="final-placeholder">
      <p class="final-text">{{ asFinalAnswer.markdown }}</p>
    </div>
  </div>

  <!-- System (本组件直接实现，不外置) -->
  <div v-else-if="asSystem" class="msg msg-system">
    <p class="system-text">🤖 {{ systemText }}</p>
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

.msg-user .bubble {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 14px;
  max-width: 80%;
}

.msg-user .text {
  margin: 0;
  font-size: 14px;
  color: #1f2937;
  white-space: pre-wrap;
}

.user-atts {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.att {
  font-size: 12px;
  color: #6b7280;
  background: #fff;
  border: 1px solid #e5e7eb;
  padding: 2px 8px;
  border-radius: 10px;
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
}

.msg-assistant .bubble {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 14px;
  max-width: 80%;
}

.plan-placeholder,
.tool-placeholder,
.artifact-placeholder,
.final-placeholder {
  flex: 1;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 16px;
}

.plan-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.plan-steps {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: #4b5563;
}

.plan-steps li {
  margin-bottom: 4px;
}

.tool-line {
  margin: 4px 0;
  font-size: 13px;
  color: #6b7280;
}

.tool-icon {
  margin-right: 6px;
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
</style>
