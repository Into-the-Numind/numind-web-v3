<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ToolCallAggregate } from '@/types/agent'
import AgentToolCallItem from './AgentToolCallItem.vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'

interface Props {
  toolGroups: ToolCallAggregate[]
}

const props = defineProps<Props>()

const ACTIVE_STATES = ['queued', 'use', 'progress']
const hasActiveTools = computed<boolean>(() => {
  return props.toolGroups.some((group) => ACTIVE_STATES.includes(group.current_state))
})

const open = ref(hasActiveTools.value)

watch(hasActiveTools, (active) => {
  open.value = active
})

const summaryText = computed<string>(() => {
  return `已运行 ${props.toolGroups.length} 步`
})

const toggle = (): void => {
  open.value = !open.value
}
</script>

<template>
  <div class="tool-call-list" v-if="toolGroups.length > 0">
    <button class="tool-summary" @click="toggle" :aria-expanded="open">
      <span class="summary-text">{{ summaryText }}</span>
      <component :is="open ? ChevronUp : ChevronDown" :size="16" />
    </button>

    <div v-if="open" class="tool-detail">
      <AgentToolCallItem v-for="group in toolGroups" :key="group.tool_call_id" :group="group" />
    </div>

    <!-- 折叠时只显示最新一条作为预览 -->
    <div v-else class="tool-preview">
      <AgentToolCallItem
        v-for="group in toolGroups.slice(-1)"
        :key="group.tool_call_id"
        :group="group"
        compact
      />
    </div>
  </div>
</template>

<style scoped>
.tool-call-list {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
}

.tool-summary {
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}

.summary-text {
  font-weight: 500;
}

.tool-detail {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-preview {
  margin-top: 6px;
}
</style>
