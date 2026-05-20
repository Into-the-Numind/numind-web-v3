<script setup lang="ts">
import { computed } from 'vue'
import type { RecentSession } from '@/types/agent'
import AppButton from '@/components/common/AppButton.vue'

interface Props {
  sessions: RecentSession[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'continue', sessionId: number): void
  (e: 'view', sessionId: number): void
}>()

interface Group {
  label: string
  items: RecentSession[]
}

// 分组：今天 / 昨天 / 本周 / 更早
const groupedSessions = computed<Group[]>(() => {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000)
  // 本周：周一为周首
  const weekday = (startOfToday.getDay() + 6) % 7 // 0=Mon, 6=Sun
  const startOfWeek = new Date(startOfToday.getTime() - weekday * 86_400_000)

  const today: RecentSession[] = []
  const yesterday: RecentSession[] = []
  const thisWeek: RecentSession[] = []
  const earlier: RecentSession[] = []

  for (const s of props.sessions) {
    const t = new Date(s.last_active_at).getTime()
    if (t >= startOfToday.getTime()) today.push(s)
    else if (t >= startOfYesterday.getTime()) yesterday.push(s)
    else if (t >= startOfWeek.getTime()) thisWeek.push(s)
    else earlier.push(s)
  }

  const groups: Group[] = []
  if (today.length) groups.push({ label: '今天', items: today })
  if (yesterday.length) groups.push({ label: '昨天', items: yesterday })
  if (thisWeek.length) groups.push({ label: '本周', items: thisWeek })
  if (earlier.length) groups.push({ label: '更早', items: earlier })
  return groups
})

const timeOfDay = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const isContinuable = (status: RecentSession['status']): boolean => {
  return status === 'running' || status === 'pending'
}
</script>

<template>
  <div class="history-groups">
    <div v-if="groupedSessions.length === 0" class="empty">
      <p>暂无历史会话</p>
    </div>
    <section v-for="g in groupedSessions" :key="g.label" class="group">
      <h3 class="group-title">{{ g.label }}</h3>
      <ul class="group-list">
        <li v-for="s in g.items" :key="s.session_id" class="row">
          <span class="row-emoji">{{ s.agent_emoji ?? '🤖' }}</span>
          <div class="row-main">
            <p class="row-name">{{ s.agent_name }} · {{ timeOfDay(s.last_active_at) }}</p>
            <p class="row-preview">{{ s.preview_text }}</p>
          </div>
          <div class="row-action">
            <AppButton
              v-if="isContinuable(s.status)"
              variant="secondary"
              @click="emit('continue', s.session_id)"
              >继续</AppButton
            >
            <AppButton v-else variant="secondary" @click="emit('view', s.session_id)"
              >查看</AppButton
            >
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.history-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.group-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: grid;
  grid-template-columns: 32px 1fr auto;
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

.empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-muted, #6b7280);
}

@media (max-width: 600px) {
  .row {
    grid-template-columns: 32px 1fr;
    grid-template-rows: auto auto;
  }
  .row-action {
    grid-column: 1 / -1;
    margin-top: 8px;
  }
}
</style>
