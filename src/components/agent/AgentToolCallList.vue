<script setup lang="ts">
/**
 * Renders a tool_group's calls as flat timeline lines (no card, no collapse, no
 * "已运行 N 步" header). Consecutive tool_group messages render their lines with no
 * chrome, so together with the interspersed thinking blocks they read as ONE
 * continuous, open, readable process timeline — the same on the streaming and the
 * polling (answer-resume) paths. Replaces the old collapsed giant card.
 */
import type { ToolCallAggregate } from '@/types/agent'
import AgentToolCallItem from './AgentToolCallItem.vue'

interface Props {
  toolGroups: ToolCallAggregate[]
}
defineProps<Props>()
</script>

<template>
  <div class="tool-timeline" v-if="toolGroups.length > 0">
    <AgentToolCallItem v-for="group in toolGroups" :key="group.tool_call_id" :group="group" />
  </div>
</template>

<style scoped>
.tool-timeline {
  display: flex;
  flex-direction: column;
}
</style>
