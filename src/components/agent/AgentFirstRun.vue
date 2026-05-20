<script setup lang="ts">
import type { AgentSkill } from '@/types/agent'

interface Props {
  agent: AgentSkill
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'select-starter', text: string): void
}>()

const welcomeText = (): string => {
  return props.agent.welcome_message?.trim() || `你好！我是${props.agent.name}，有什么可以帮你的？`
}

const starters = (): string[] => {
  return props.agent.conversation_starters ?? []
}
</script>

<template>
  <div class="first-run">
    <div class="avatar">{{ agent.emoji ?? '🤖' }}</div>
    <h2 class="agent-name">{{ agent.name }}</h2>
    <p class="welcome">{{ welcomeText() }}</p>

    <div v-if="starters().length > 0" class="starters" aria-label="conversation starters">
      <p class="starters-hint">你可以直接输入问题，或从下面选一个快速开始：</p>
      <div class="starters-list">
        <button
          v-for="(s, idx) in starters()"
          :key="idx"
          class="starter-btn"
          @click="emit('select-starter', s)"
        >
          {{ s }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.first-run {
  max-width: 720px;
  margin: 0 auto;
  padding: 60px 24px;
  text-align: center;
}

.avatar {
  font-size: 56px;
  margin-bottom: 16px;
}

.agent-name {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 12px;
}

.welcome {
  font-size: 15px;
  color: var(--color-text-muted, #4b5563);
  line-height: 1.6;
  margin: 0 0 32px;
  white-space: pre-wrap;
}

.starters {
  margin-top: 24px;
}

.starters-hint {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 12px;
}

.starters-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.starter-btn {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 20px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--color-text, #374151);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.starter-btn:hover {
  background: #f9fafb;
  border-color: var(--color-primary, #2563eb);
  color: var(--color-primary, #2563eb);
}

/* 移动端：横向滚动 */
@media (max-width: 768px) {
  .first-run {
    padding: 40px 16px;
  }
  .starters-list {
    flex-wrap: nowrap;
    overflow-x: auto;
    justify-content: flex-start;
    padding-bottom: 8px;
    -webkit-overflow-scrolling: touch;
  }
  .starter-btn {
    flex-shrink: 0;
  }
}
</style>
