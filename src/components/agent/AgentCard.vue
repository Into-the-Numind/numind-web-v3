<script setup lang="ts">
import type { AgentSkill } from '@/types/agent'
import AppButton from '@/components/common/AppButton.vue'

interface Props {
  agent: AgentSkill
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'start', agentId: number): void
}>()
</script>

<template>
  <article class="agent-card">
    <div class="emoji">{{ agent.emoji ?? '🤖' }}</div>
    <h3 class="name">{{ agent.name }}</h3>
    <p class="description">{{ agent.description }}</p>
    <div class="card-footer">
      <AppButton @click="emit('start', agent.id)">开始使用</AppButton>
    </div>
  </article>
</template>

<style scoped>
.agent-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.agent-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}

.emoji {
  font-size: 32px;
  margin-bottom: 12px;
}

.name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 8px;
}

.description {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  line-height: 1.5;
  margin: 0 0 16px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  margin-top: auto;
}
</style>
