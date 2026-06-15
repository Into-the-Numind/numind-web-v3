<script setup lang="ts">
/**
 * Renders a tool_group's calls as flat timeline lines (no card, no collapse, no
 * "已运行 N 步" header). Consecutive tool_group messages render their lines with no
 * chrome, so together with the interspersed thinking blocks they read as ONE
 * continuous, open, readable process timeline — the same on the streaming and the
 * polling (answer-resume) paths. Replaces the old collapsed giant card.
 */
import { computed } from 'vue'
import type { ToolCallAggregate } from '@/types/agent'
import AgentToolCallItem from './AgentToolCallItem.vue'

interface Props {
  toolGroups: ToolCallAggregate[]
}
const props = defineProps<Props>()

// #6: ask_user_question is a yield tool — it emits a StateUse but the run then
// pauses and never produces a result, so its timeline line would spin forever
// ("等你回答一个问题"还在转圈). It is already represented by the QuestionPrompt card,
// so drop it from the tool timeline entirely (covers streaming / polling / reload —
// this is the single render entry point).
const visibleGroups = computed(() =>
  props.toolGroups.filter((g) => g.tool_name !== 'ask_user_question')
)
</script>

<template>
  <div class="tool-timeline" v-if="visibleGroups.length > 0">
    <AgentToolCallItem v-for="group in visibleGroups" :key="group.tool_call_id" :group="group" />
  </div>
</template>

<style scoped>
.tool-timeline {
  display: flex;
  flex-direction: column;
  /* small gap so each tool line's tinted background reads as a separate
     rectangle (issue2 visual separation) without breaking the flat timeline. */
  gap: 3px;
}
</style>
