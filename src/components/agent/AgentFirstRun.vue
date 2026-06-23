<script setup lang="ts">
import type { AgentSkill } from '@/types/agent'

interface Props {
  agent: AgentSkill
}

const props = defineProps<Props>()

const welcomeText = (): string => {
  return props.agent.welcome_message?.trim() || `你好，我是${props.agent.name}，有什么可以帮你的？`
}
</script>

<template>
  <div class="first-run">
    <div class="first-run__identity">
      <span class="first-run__emoji">{{ agent.emoji ?? '🤖' }}</span>
      <span class="first-run__name">{{ agent.name }}</span>
    </div>
    <h1 class="first-run__hero">{{ welcomeText() }}</h1>
  </div>
</template>

<style scoped>
.first-run {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  text-align: center;
}

.first-run__identity {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 6px var(--space-md);
  border-radius: var(--radius-pill);
  background: var(--surface-tint);
  border: 1px solid var(--border);
}

.first-run__emoji {
  font-size: 18px;
  line-height: 1;
}

.first-run__name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.first-run__hero {
  margin: 0;
  max-width: 680px;
  font-family: var(--font-sans);
  font-size: var(--text-3xl);
  font-weight: 600;
  line-height: var(--line-height-tight);
  color: var(--text);
  letter-spacing: -0.01em;
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .first-run__hero {
    font-size: var(--text-2xl);
  }
}
</style>
