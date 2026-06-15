<!--
  NotificationBell — 全局通知铃铛入口（notification-center feature）

  放在全局 Sidebar 中（跨所有已登录页面始终可见），点击导航到 /notifications 通知中心。

  ## Feature flag
  仅当 `import.meta.env.VITE_ENABLE_NOTIFICATIONS === 'true'` 时渲染。
  prod 构建默认不设该变量 → 整个组件不渲染（铃铛隐藏）。

  ## 行为
  - 挂载后立即调用 store.refreshUnread() 拉一次未读计数；
  - 每 60s 轮询一次 refreshUnread；卸载时清除定时器；
  - 未读数 > 0 时显示红点徽标；> 99 显示 "99+"；为 0 时隐藏徽标。
-->
<template>
  <RouterLink
    v-if="enabled"
    to="/notifications"
    class="nav-item bell-item"
    :class="{ active: isActive }"
    :data-tooltip="collapsed ? '通知' : undefined"
    data-testid="notification-bell"
  >
    <span class="bell-icon-wrap">
      <Bell class="nav-icon-svg" :size="20" :stroke-width="1.6" />
      <span
        v-if="store.unreadCount > 0"
        class="bell-badge"
        data-testid="notification-bell-badge"
        :aria-label="`${store.unreadCount} 条未读通知`"
        >{{ badgeText }}</span
      >
    </span>
    <span class="nav-label">通知</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Bell } from 'lucide-vue-next'
import { useAnnouncementsStore } from '@/stores/announcements'

// collapsed 仅在模板里通过 :data-tooltip 使用（编译期自动解析），脚本无需引用，故不捕获返回值。
withDefaults(defineProps<{ collapsed?: boolean }>(), {
  collapsed: false
})

const route = useRoute()
const store = useAnnouncementsStore()

// Feature flag gate — prod 构建不设此变量则整组件不渲染。
const enabled = import.meta.env.VITE_ENABLE_NOTIFICATIONS === 'true'

const isActive = computed(() => route.path.startsWith('/notifications'))

const badgeText = computed(() => (store.unreadCount > 99 ? '99+' : String(store.unreadCount)))

const POLL_MS = 60_000
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!enabled) return
  store.refreshUnread()
  timer = setInterval(() => {
    store.refreshUnread()
  }, POLL_MS)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<style scoped>
/* 复用 Sidebar 的 .nav-item / .nav-icon-svg / .nav-label 视觉（这里补充铃铛专属的徽标定位）。 */
.bell-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-radius: 12px;
  color: hsl(160, 18%, 52%);
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-sans);
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 200ms ease,
    background 200ms ease,
    gap 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

.bell-item:hover {
  color: hsl(160, 40%, 36%);
  background: hsla(160, 45%, 50%, 0.1);
}

.bell-item.active {
  color: hsl(160, 60%, 38%);
  background: hsla(160, 50%, 50%, 0.14);
  font-weight: 600;
}

.bell-icon-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.nav-icon-svg {
  width: 20px;
  height: 20px;
  min-width: 20px;
  flex-shrink: 0;
}

.bell-badge {
  position: absolute;
  top: -6px;
  right: -7px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  font-family: var(--font-sans);
  box-shadow: 0 0 0 2px hsla(160, 30%, 96%, 0.9);
}

.nav-label {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  opacity: 1;
}

/* 折叠态：与 Sidebar 一致隐藏文字标签（由父级 .collapsed 控制）。 */
:global(.sidebar.collapsed) .bell-item {
  gap: 0;
}

:global(.sidebar.collapsed) .bell-item .nav-label {
  max-width: 0;
  opacity: 0;
}

/* 移动端：与 Sidebar nav-item 一致竖排，标签常显。 */
@media (max-width: 768px) {
  .bell-item {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 8px;
    font-size: 10px;
    gap: 3px;
    border-radius: 10px;
    min-width: 0;
    flex: 1;
  }

  .bell-item .nav-label {
    max-width: none;
    opacity: 1;
    font-size: 10px;
    line-height: 1.2;
  }

  .nav-icon-svg {
    width: 22px;
    height: 22px;
    min-width: 22px;
  }
}
</style>
