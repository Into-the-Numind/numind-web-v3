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
