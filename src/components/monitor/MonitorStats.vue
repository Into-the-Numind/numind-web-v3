<template>
  <div class="monitor-stats">
    <div class="stat-card">
      <span class="stat-label">监控博主</span>
      <span class="stat-value">
        {{ stats?.active_bloggers ?? '-' }}
        <span v-if="stats" class="stat-sub">/ {{ stats.total_bloggers }}</span>
      </span>
    </div>
    <div class="stat-card">
      <span class="stat-label">本周新笔记</span>
      <span class="stat-value">{{ stats?.notes_this_week ?? '-' }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">简报总数</span>
      <span class="stat-value">{{ stats?.total_briefings ?? '-' }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">最近简报</span>
      <div v-if="stats?.latest_briefing" class="latest-briefing">
        <span class="latest-title">{{ stats.latest_briefing.title }}</span>
        <span class="latest-date">{{ formatDate(stats.latest_briefing.created_at) }}</span>
      </div>
      <span v-else class="stat-value stat-empty">暂无</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMonitorStore } from '@/stores/monitor'
import { storeToRefs } from 'pinia'

const store = useMonitorStore()
const { stats } = storeToRefs(store)

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric'
  })
}
</script>

<style scoped>
.monitor-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-lg) var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.stat-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: 500;
}

.stat-value {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text);
}

.stat-sub {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--text-muted);
}

.stat-empty {
  color: var(--text-muted);
  font-weight: 400;
  font-size: var(--text-sm);
}

.latest-briefing {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.latest-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.latest-date {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .monitor-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
