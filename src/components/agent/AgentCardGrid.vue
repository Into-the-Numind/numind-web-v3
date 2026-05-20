<script setup lang="ts">
import { computed } from 'vue'
import type { AgentSkill } from '@/types/agent'
import AgentCard from './AgentCard.vue'
import AppButton from '@/components/common/AppButton.vue'

interface Props {
  loading?: boolean
  error?: string | null
  agents?: AgentSkill[]
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
  agents: () => []
})

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'select', agentId: number): void
}>()

const state = computed<'loading' | 'error' | 'empty' | 'list'>(() => {
  if (props.loading) return 'loading'
  if (props.error) return 'error'
  if (props.agents.length === 0) return 'empty'
  return 'list'
})
</script>

<template>
  <div class="agent-card-grid">
    <!-- Loading skeleton (3 cards) -->
    <div v-if="state === 'loading'" class="grid">
      <div v-for="i in 3" :key="i" class="skeleton-card" aria-label="加载中">
        <div class="skeleton-emoji"></div>
        <div class="skeleton-line skeleton-line-title"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-line-short"></div>
        <div class="skeleton-button"></div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="state === 'error'" class="empty-state">
      <div class="empty-icon">⚠️</div>
      <p class="empty-title">加载失败</p>
      <p class="empty-subtitle">{{ error }}</p>
      <AppButton @click="emit('retry')">重试</AppButton>
    </div>

    <!-- Empty -->
    <div v-else-if="state === 'empty'" class="empty-state">
      <div class="empty-icon">🤖</div>
      <p class="empty-title">暂无可用助手</p>
      <p class="empty-subtitle">请联系老师为你配置 AI 助手</p>
    </div>

    <!-- List -->
    <div v-else class="grid">
      <AgentCard
        v-for="agent in agents"
        :key="agent.id"
        :agent="agent"
        @start="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.agent-card-grid {
  width: 100%;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}

@media (max-width: 480px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

.skeleton-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 20px;
  min-height: 200px;
}

.skeleton-emoji {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: linear-gradient(90deg, #f3f4f6, #e5e7eb, #f3f4f6);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  margin-bottom: 16px;
}

.skeleton-line {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f3f4f6, #e5e7eb, #f3f4f6);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  margin-bottom: 10px;
}

.skeleton-line-title {
  height: 18px;
  width: 50%;
}

.skeleton-line-short {
  width: 70%;
}

.skeleton-button {
  height: 36px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f3f4f6, #e5e7eb, #f3f4f6);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  margin-top: 16px;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.empty-state {
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 8px;
}

.empty-subtitle {
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 20px;
}
</style>
