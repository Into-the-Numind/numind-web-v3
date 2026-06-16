<!--
  NotificationMegaphone — 工作区右上角通知入口（notif-dropdown）

  放在 HomeView 右上角。喇叭 icon + 未读数字角标；点击展开下拉列表面板，
  点列表某条 → 弹出 NotificationModal 看详情/填问卷。看过即不再提醒（is_read）。

  ## Feature flag
  仅当 import.meta.env.VITE_ENABLE_NOTIFICATIONS === 'true' 时渲染（prod 默认不设 → 隐藏）。

  ## 行为
  - 挂载后 refreshUnread() + 60s 轮询；卸载清定时器。
  - 点喇叭 toggle 下拉；打开时 loadAnnouncements()（重置第 1 页）。
  - 下拉列表滚动到底 → loadMore() append 下一页（不跳转、无"查看全部"）。
  - 点列表外区域 / Esc 关闭下拉。
  - 点某条 → 关下拉、开弹窗（弹窗内 markRead 后红点/角标减少）。
-->
<template>
  <div v-if="enabled" ref="rootEl" class="megaphone" data-testid="notification-megaphone">
    <button
      type="button"
      class="mp-btn"
      :class="{ active: open }"
      aria-label="通知"
      data-testid="megaphone-btn"
      @click="toggle"
    >
      <Bell :size="20" :stroke-width="1.7" />
      <span
        v-if="store.unreadCount > 0"
        class="mp-badge"
        data-testid="megaphone-badge"
        :aria-label="`${store.unreadCount} 条未读通知`"
        >{{ badgeText }}</span
      >
    </button>

    <!-- 下拉面板 -->
    <Transition name="mp-pop">
      <div v-if="open" class="mp-panel" data-testid="megaphone-panel">
        <header class="mp-panel-head">
          <span class="mp-panel-title">通知</span>
        </header>

        <!-- loading（首页） -->
        <div v-if="store.loading" class="mp-skeleton" data-testid="megaphone-loading">
          <div v-for="n in 3" :key="n" class="mp-sk-item">
            <div class="sk-line sk-title"></div>
            <div class="sk-line sk-meta"></div>
          </div>
        </div>

        <!-- error -->
        <div
          v-else-if="store.error && store.list.length === 0"
          class="mp-state"
          data-testid="megaphone-error"
        >
          <p class="mp-state-text">{{ store.error }}</p>
          <AppButton variant="secondary" size="sm" @click="reload">重试</AppButton>
        </div>

        <!-- empty -->
        <div v-else-if="store.list.length === 0" class="mp-state" data-testid="megaphone-empty">
          <BellOff :size="32" :stroke-width="1.4" class="mp-empty-icon" />
          <p class="mp-state-text">暂无通知</p>
          <AppButton
            variant="secondary"
            size="sm"
            data-testid="megaphone-empty-refresh"
            @click="reload"
            >刷新</AppButton
          >
        </div>

        <!-- success：列表（滚动到底 append） -->
        <ul v-else ref="listEl" class="mp-list" data-testid="megaphone-list" @scroll="onScroll">
          <li
            v-for="item in store.list"
            :key="item.id"
            class="mp-item"
            :class="{ unread: !item.is_read }"
            :data-testid="`megaphone-item-${item.id}`"
            @click="openDetail(item.id)"
          >
            <span v-if="!item.is_read" class="mp-dot" aria-label="未读"></span>
            <div class="mp-item-body">
              <div class="mp-item-title-row">
                <span class="mp-item-title" :class="{ bold: !item.is_read }">{{ item.title }}</span>
                <span v-if="item.type === 'survey'" class="mp-tag">问卷</span>
              </div>
              <span class="mp-item-time">{{ formatTime(item.published_at) }}</span>
            </div>
          </li>

          <!-- 加载更多指示 -->
          <li v-if="store.loadingMore" class="mp-loadmore" data-testid="megaphone-loadmore">
            加载中…
          </li>
          <li v-else-if="!store.hasMore && store.list.length > 0" class="mp-end">没有更多了</li>
        </ul>
      </div>
    </Transition>

    <!-- 详情弹窗 -->
    <NotificationModal v-model="modalOpen" :announcement-id="selectedId" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { Bell, BellOff } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import NotificationModal from '@/components/notification/NotificationModal.vue'
import { useAnnouncementsStore } from '@/stores/announcements'

const store = useAnnouncementsStore()

// Feature flag gate — prod 构建不设此变量则整组件不渲染。
const enabled = import.meta.env.VITE_ENABLE_NOTIFICATIONS === 'true'

const open = ref(false)
const modalOpen = ref(false)
const selectedId = ref<number | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const badgeText = computed(() => (store.unreadCount > 99 ? '99+' : String(store.unreadCount)))

function toggle() {
  open.value = !open.value
  if (open.value) reload()
}

function reload() {
  store.loadAnnouncements()
}

function openDetail(id: number) {
  selectedId.value = id
  modalOpen.value = true
  open.value = false // 关下拉，聚焦弹窗
}

// 列表滚动到接近底部 → 加载下一页（append）
function onScroll() {
  const el = listEl.value
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
    store.loadMore()
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 点下拉外区域关闭（弹窗打开时不处理，弹窗有自己的遮罩）
function onDocClick(e: MouseEvent) {
  if (!open.value) return
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) {
    open.value = false
  }
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}

const POLL_MS = 60_000
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!enabled) return
  store.refreshUnread()
  timer = setInterval(() => store.refreshUnread(), POLL_MS)
  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.megaphone {
  position: relative;
  display: inline-flex;
}

.mp-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  /* 绿边与卡片边框同色；铃铛字形用卡片图标的更深绿，更醒目 */
  border: 1px solid hsl(158, 50%, 78%);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: hsl(160, 50%, 62%);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background var(--transition-fast),
    border-color var(--transition-fast);
}

.mp-btn:hover {
  color: var(--color-accent-link);
  border-color: var(--color-accent-light);
  background: var(--color-surface-hover);
}

.mp-btn.active {
  color: var(--color-accent-link);
  border-color: var(--color-accent-soft);
  background: var(--color-accent-soft);
}

.mp-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--color-danger, #ef4444);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--color-surface, #fff);
}

.mp-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 360px;
  max-width: calc(100vw - var(--space-8));
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e8e9ee);
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-lg, 0 25px 50px -12px rgba(0, 0, 0, 0.15));
  z-index: 1000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mp-panel-head {
  flex-shrink: 0;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border-light);
}

.mp-panel-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text);
}

.mp-list {
  list-style: none;
  margin: 0;
  padding: var(--space-2);
  /* 固定最大高度 + 内部滚动（滚动到底 append） */
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.mp-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.mp-item:hover {
  background: var(--color-surface-hover);
}

.mp-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-danger, #ef4444);
}

.mp-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mp-item-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.mp-item-title {
  font-size: var(--text-sm);
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-item-title.bold {
  font-weight: 700;
}

.mp-tag {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-link);
  font-size: var(--text-xs);
  font-weight: 600;
}

.mp-item-time {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.mp-loadmore,
.mp-end {
  list-style: none;
  text-align: center;
  padding: var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

/* skeleton + state */
.mp-skeleton {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.mp-sk-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.sk-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 50%, #eef0f4 75%);
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk-title {
  width: 60%;
}

.sk-meta {
  width: 30%;
  height: 9px;
}

@keyframes sk-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.mp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-4);
  text-align: center;
}

.mp-empty-icon {
  color: var(--color-text-muted);
}

.mp-state-text {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* dropdown pop transition */
.mp-pop-enter-active,
.mp-pop-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.mp-pop-enter-from,
.mp-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
