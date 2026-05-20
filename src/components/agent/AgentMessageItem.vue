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
import AgentPlanCard from './AgentPlanCard.vue'
import AgentToolCallList from './AgentToolCallList.vue'
import AgentArtifactItem from './AgentArtifactItem.vue'
import AgentFinalAnswer from './AgentFinalAnswer.vue'

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

  <!-- Plan card -->
  <div v-else-if="asPlan" class="msg msg-plan">
    <span class="avatar">🤖</span>
    <div class="content-wrap">
      <AgentPlanCard :steps="asPlan.plan_steps" />
    </div>
  </div>

  <!-- Tool group -->
  <div v-else-if="asToolGroup" class="msg msg-tool-group">
    <span class="avatar">🤖</span>
    <div class="content-wrap">
      <AgentToolCallList :tool-groups="asToolGroup.tool_calls" />
    </div>
  </div>

  <!-- Artifact -->
  <div v-else-if="asArtifact" class="msg msg-artifact">
    <span class="avatar">🤖</span>
    <div class="content-wrap">
      <AgentArtifactItem :artifact="asArtifact.artifact" />
    </div>
  </div>

  <!-- Final answer -->
  <div v-else-if="asFinalAnswer" class="msg msg-final">
    <span class="avatar">🤖</span>
    <div class="content-wrap">
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
</style>
