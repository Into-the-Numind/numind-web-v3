<script setup lang="ts">
import type { RecentSession } from '@/types/agent'
import AppButton from '@/components/common/AppButton.vue'

interface Props {
  sessions: RecentSession[]
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'continue', sessionId: string): void
  (e: 'view', sessionId: string): void
}>()

const relativeTime = (iso?: string): string => {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 2) return '昨天'
  return new Date(iso).toLocaleDateString('zh-CN')
}

const isContinuable = (status: RecentSession['status']): boolean => {
  return status === 'running' || status === 'pending'
}
</script>

<template>
  <section v-if="sessions.length > 0" class="recent-sessions">
    <h2 class="section-title">最近使用</h2>
    <ul class="list">
      <li v-for="s in sessions" :key="s.session_id" class="row">
        <span class="row-emoji">{{ s.agent_emoji ?? '🤖' }}</span>
        <div class="row-main">
          <p class="row-name">{{ s.agent_name }}</p>
          <p class="row-preview">{{ s.preview_text }}</p>
        </div>
        <span class="row-time">{{ relativeTime(s.last_active_at) }}</span>
        <div class="row-action">
          <AppButton
            v-if="isContinuable(s.status)"
            variant="secondary"
            @click="emit('continue', s.session_id)"
            >继续</AppButton
          >
          <AppButton v-else variant="secondary" @click="emit('view', s.session_id)">查看</AppButton>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.recent-sessions {
  margin-top: 40px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 12px;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: grid;
  grid-template-columns: 32px 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
}

.row-emoji {
  font-size: 20px;
}

.row-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0;
}

.row-preview {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.row-time {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  white-space: nowrap;
}

@media (max-width: 600px) {
  .row {
    grid-template-columns: 32px 1fr;
    grid-template-rows: auto auto;
    gap: 4px 12px;
  }

  .row-time {
    grid-column: 2;
    grid-row: 2;
  }

  .row-action {
    grid-column: 1 / -1;
    margin-top: 8px;
  }
}
</style>
