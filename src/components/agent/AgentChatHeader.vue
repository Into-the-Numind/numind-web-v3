<script setup lang="ts">
import type { AgentSkill } from '@/types/agent'

interface Props {
  agent: AgentSkill | null
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'toggle-sidebar'): void
}>()
</script>

<template>
  <header class="agent-chat-header">
    <div class="left">
      <button class="sidebar-toggle" @click="emit('toggle-sidebar')" aria-label="切换侧边栏">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <h2 class="name">{{ agent?.name ?? 'AI 助手' }}</h2>
    </div>
  </header>
</template>

<style scoped>
.agent-chat-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: var(--bg, #fff);
  border-bottom: 1px solid hsla(160, 20%, 88%, 0.5);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);
}

.left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebar-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
  align-items: center;
  justify-content: center;
}

.sidebar-toggle:hover {
  background: var(--surface-hover, rgba(0, 0, 0, 0.04));
  color: var(--text);
}

.name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0;
}

/* 移动端响应式布局 */
@media (max-width: 768px) {
  .sidebar-toggle {
    display: flex;
  }
}
</style>
