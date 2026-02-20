<template>
  <article class="message-item" :class="[`role-${message.role}`]">
    <div class="message-meta">
      <span class="message-role">{{ roleLabel }}</span>
      <span v-if="timeText" class="message-time">{{ timeText }}</span>
    </div>
    <div class="message-bubble">
      {{ message.content }}
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SalesMessage } from '@/api/sales'

const props = defineProps<{
  message: SalesMessage
}>()

const roleLabel = computed(() => {
  if (props.message.role === 'assistant') return '销售助手'
  if (props.message.role === 'user') return '你'
  return '系统'
})

const timeText = computed(() => {
  if (!props.message.createdAt) return ''
  const date = new Date(props.message.createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
})
</script>

<style scoped>
.message-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.message-role {
  font-weight: 700;
  color: var(--text-secondary);
}

.message-time {
  color: var(--text-muted);
}

.message-bubble {
  max-width: min(86%, 760px);
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid var(--border-light);
  background: var(--surface);
  color: var(--text);
  white-space: pre-wrap;
  line-height: 1.6;
}

.role-user {
  align-items: flex-end;
}

.role-user .message-meta {
  justify-content: flex-end;
}

.role-user .message-bubble {
  background: linear-gradient(135deg, hsl(158 65% 44%), hsl(158 60% 38%));
  border-color: transparent;
  color: #fff;
}

.role-assistant .message-bubble {
  background: linear-gradient(180deg, #ffffff 0%, hsl(158 35% 97%) 100%);
}

.role-system .message-bubble {
  background: hsl(47 100% 96%);
  border-color: hsl(45 90% 82%);
  color: hsl(35 50% 30%);
}
</style>

