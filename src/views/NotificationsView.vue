<!--
  NotificationsView — 通知中心列表（notification-center）

  路由：/notifications（requiresAuth）。由 Sidebar 的 NotificationBell 导航进入。

  4 态：loading（skeleton）/ empty（"暂无通知"）/ error（retry）/ success（列表）。
  列表项：标题 + 未读高亮（圆点 + 加粗）+ 发布时间 + survey 标记。点击 → /notifications/:id。
-->
<template>
  <MainLayout>
    <div class="notifications-view" data-testid="notifications-view">
      <header class="page-header">
        <h1 class="page-title">通知中心</h1>
      </header>

      <!-- loading skeleton -->
      <div v-if="store.loading" class="skeleton-list" data-testid="notifications-loading">
        <div v-for="n in 4" :key="n" class="skeleton-item">
          <div class="sk-line sk-title"></div>
          <div class="sk-line sk-meta"></div>
        </div>
      </div>

      <!-- error + retry -->
      <div v-else-if="store.error" class="state-block error" data-testid="notifications-error">
        <p class="state-text">{{ store.error }}</p>
        <AppButton variant="secondary" size="sm" data-testid="notifications-retry" @click="reload">
          重试
        </AppButton>
      </div>

      <!-- empty -->
      <div
        v-else-if="store.list.length === 0"
        class="state-block empty"
        data-testid="notifications-empty"
      >
        <BellOff :size="40" :stroke-width="1.4" class="empty-icon" />
        <p class="state-text">暂无通知</p>
      </div>

      <!-- success: 列表 -->
      <ul v-else class="notice-list" data-testid="notifications-list">
        <li
          v-for="item in store.list"
          :key="item.id"
          class="notice-item"
          :class="{ unread: !item.is_read }"
          :data-testid="`notice-item-${item.id}`"
          @click="openDetail(item.id)"
        >
          <span
            v-if="!item.is_read"
            class="unread-dot"
            data-testid="unread-dot"
            aria-label="未读"
          ></span>
          <div class="notice-body">
            <div class="notice-title-row">
              <span class="notice-title" :class="{ bold: !item.is_read }">{{ item.title }}</span>
              <span v-if="item.type === 'survey'" class="survey-tag" data-testid="survey-tag"
                >问卷</span
              >
            </div>
            <span class="notice-time">{{ formatTime(item.published_at) }}</span>
          </div>
        </li>
      </ul>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { BellOff } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { useAnnouncementsStore } from '@/stores/announcements'

const router = useRouter()
const store = useAnnouncementsStore()

function reload() {
  store.loadAnnouncements({ page: 1, page_size: 20 })
}

function openDetail(id: number) {
  router.push(`/notifications/${id}`)
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  reload()
})
</script>

<style scoped>
.notifications-view {
  max-width: 760px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: var(--space-6);
}

.page-title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text);
}

/* ===== Skeleton ===== */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.skeleton-item {
  padding: var(--space-4);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sk-line {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 50%, #eef0f4 75%);
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk-title {
  width: 55%;
}

.sk-meta {
  width: 28%;
  height: 10px;
}

@keyframes sk-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* ===== State blocks (empty / error) ===== */
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-12) var(--space-4);
  text-align: center;
}

.empty-icon {
  color: var(--color-text-muted);
}

.state-text {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* ===== List ===== */
.notice-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.notice-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.notice-item:hover {
  border-color: var(--color-accent-light);
  background: var(--color-surface-hover);
}

.notice-item.unread {
  border-color: var(--color-accent-soft);
}

.unread-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}

.notice-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.notice-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.notice-title {
  font-size: var(--text-base);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-title.bold {
  font-weight: 700;
}

.survey-tag {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-link);
  font-size: var(--text-xs);
  font-weight: 600;
}

.notice-time {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>
