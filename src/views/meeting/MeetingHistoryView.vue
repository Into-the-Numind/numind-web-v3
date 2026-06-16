<!--
  MeetingHistoryView — 历史会议列表 (SPEC §0.4 / §5)

  - DataTable 表格布局 (ui-ux §1: 管理/列表类页面必须用表格, 禁卡片网格)
  - 4 状态 (ui-ux §2):
      loading → DataTable 内置 skeleton
      empty   → DataTable 内置空态 + 顶部 CTA「开始新会议」
      error   → 独立 error 块 + retry
      success → 表格 + 分页
  - 行点击 → 进入详情:
      ended  → /meeting/summary/:id
      active → /meeting/live/:id (继续进行中的会议)
-->
<template>
  <MainLayout>
    <div class="history-view">
      <header class="history-head">
        <div class="head-text">
          <h1 class="history-title">历史会议</h1>
          <p class="history-subtitle">查看过往会议的纪要、转写与录音回放。</p>
        </div>
        <AppButton variant="hero" @click="goNew">开始新会议</AppButton>
      </header>

      <!-- error 4 态 -->
      <div v-if="loadError" class="error-block">
        <div class="error-icon">😢</div>
        <h2 class="error-title">加载历史失败</h2>
        <p class="error-msg">{{ loadError }}</p>
        <AppButton @click="retry">重试</AppButton>
      </div>

      <!-- loading / empty / success 由 DataTable 处理 -->
      <DataTable
        v-else
        :columns="columns"
        :data="meeting.sessions"
        :loading="meeting.loadingList"
        :total="meeting.sessionsTotal"
        :page="page"
        :page-size="pageSize"
        row-key="id"
        empty-text="还没有会议记录，点右上角「开始新会议」试试"
        clickable
        @update:page="onPageChange"
        @row-click="onRowClick"
      >
        <template #cell-title="{ row }">
          <span class="cell-title">{{ row.title || '未命名会议' }}</span>
        </template>

        <template #cell-status="{ row }">
          <span class="status-pill" :class="`status-pill--${row.status}`">
            {{ row.status === 'ended' ? '已结束' : '进行中' }}
          </span>
        </template>

        <template #cell-duration="{ row }">
          {{ formatDuration(row.duration_seconds) }}
        </template>

        <template #cell-started_at="{ row }">
          {{ formatDate(row.started_at || row.created_at) }}
        </template>

        <template #cell-action="{ row }">
          <span class="row-action">{{ row.status === 'ended' ? '查看纪要 →' : '继续 →' }}</span>
        </template>
      </DataTable>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'
import DataTable, { type Column } from '@/components/common/DataTable.vue'
import AppButton from '@/components/common/AppButton.vue'
import { useMeetingStore } from '@/stores/meeting'
import type { MeetingSession } from '@/types/meeting'

const router = useRouter()
const meeting = useMeetingStore()

const page = ref(1)
const pageSize = 20
const loadError = ref('')

const columns: Column[] = [
  { key: 'title', title: '会议标题', align: 'left' },
  { key: 'status', title: '状态', width: '110px', align: 'center' },
  { key: 'duration', title: '时长', width: '120px', align: 'center' },
  { key: 'started_at', title: '开始时间', width: '180px', align: 'center' },
  { key: 'action', title: '', width: '120px', align: 'right' }
]

const load = async (): Promise<void> => {
  loadError.value = ''
  await meeting.loadHistory(page.value, pageSize)
  // store.error reflects the failed action; only treat as a hard error when the
  // list came back empty AND an error was recorded (network/server failure).
  if (meeting.error && meeting.sessions.length === 0) {
    loadError.value = meeting.error
  }
}

const retry = async (): Promise<void> => {
  await load()
}

const onPageChange = (p: number): void => {
  page.value = p
  void load()
}

const onRowClick = (row: MeetingSession): void => {
  if (row.status === 'ended') {
    router.push({ name: 'meeting-summary', params: { id: String(row.id) } })
  } else {
    router.push({ name: 'meeting-live', params: { id: String(row.id) } })
  }
}

const goNew = (): void => {
  router.push({ name: 'meeting-setup' })
}

const formatDuration = (sec: number): string => {
  if (!sec || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s} 秒`
  return `${m} 分 ${s} 秒`
}
const formatDate = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
.history-view {
  max-width: 1000px;
  margin: 0 auto;
}

.history-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.head-text {
  min-width: 0;
}
.history-title {
  font-family: var(--font-sans);
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  margin: 0 0 6px;
}
.history-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.cell-title {
  font-weight: 600;
  color: var(--text);
}

.status-pill {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
}
.status-pill--ended {
  background: var(--surface-tint);
  color: var(--text-secondary);
}
.status-pill--active {
  background: var(--accent-ultra-soft);
  color: var(--color-primary);
}

.row-action {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
}

/* error block (DataTable handles loading/empty/success) */
.error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}
.error-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.error-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px;
}
.error-msg {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 20px;
}

@media (max-width: 768px) {
  .history-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
