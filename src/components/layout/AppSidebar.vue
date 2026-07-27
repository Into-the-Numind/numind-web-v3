<template>
  <aside class="sidebar" :class="{ collapsed, animating }" @transitionend="onTransitionEnd">
    <!-- Logo（org-branding：动态机构品牌名，无名称兜底"有数AI"） -->
    <div class="sidebar-logo" @click="collapsed && toggle()">
      <div class="logo-mark">{{ brandInitial }}</div>
      <span class="logo-text">{{ userStore.displayBrandName }}</span>
    </div>

    <!-- Navigation -->
    <nav class="nav-menu">
      <RouterLink
        v-for="(item, index) in menuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
        :style="{ '--item-index': index }"
        :data-tooltip="collapsed ? item.title : undefined"
      >
        <svg
          v-if="item.icon === 'workspace'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
        <svg
          v-else-if="item.icon === 'history'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7V12L15 15" />
        </svg>
        <svg
          v-else-if="item.icon === 'customers'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M16 21V19C16 16.7909 14.2091 15 12 15H6C3.79086 15 2 16.7909 2 19V21" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21V19C22 17.1362 20.7252 15.5701 19 15.126" />
          <path
            d="M16 3.12602C17.7252 3.57006 19 5.13616 19 7.00002C19 8.86388 17.7252 10.43 16 10.874"
          />
        </svg>
        <svg
          v-else-if="item.icon === 'knowledge'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 19.5C4 18.1193 5.11929 17 6.5 17H20" />
          <path d="M6.5 2H20V22H6.5C5.11929 22 4 20.8807 4 19.5V4.5C4 3.11929 5.11929 2 6.5 2Z" />
          <path d="M8 7H16" />
          <path d="M8 11H13" />
        </svg>
        <svg
          v-else-if="item.icon === 'monitor'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg
          v-else-if="item.icon === 'xhs'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 5h18M3 12h18M3 19h12" />
          <circle cx="19" cy="19" r="2" />
        </svg>
        <svg
          v-else-if="item.icon === 'meeting'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
          <path d="M12 18v3" />
          <path d="M8 21h8" />
        </svg>
        <svg
          v-else-if="item.icon === 'config'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
          />
        </svg>
        <svg
          v-else-if="item.icon === 'membership'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 2l2.39 6.9H22l-5.8 4.26 2.22 6.84L12 15.9l-6.42 4.1L7.8 13.16 2 8.9h7.61z" />
        </svg>
        <!-- skill icon (skill-3tier-visibility T4): 子账户「我的技能」入口 -->
        <svg
          v-else-if="item.icon === 'skill'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v.3h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
        </svg>
        <svg
          v-else-if="item.icon === 'marketplace'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 9L5 4H19L21 9" />
          <path d="M4 9V20H20V9" />
          <path d="M3 9H21" />
          <path d="M9 14C9 15.6569 10.3431 17 12 17C13.6569 17 15 15.6569 15 14" />
        </svg>
        <svg
          v-else-if="item.icon === 'settings'"
          class="nav-icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
          />
        </svg>
        <span class="nav-label">{{ item.title }}</span>
      </RouterLink>
    </nav>

    <!-- Toggle -->
    <div class="sidebar-bottom">
      <button
        class="toggle-btn"
        :data-tooltip="collapsed ? '展开导航' : undefined"
        @click="toggle()"
      >
        <svg
          class="toggle-icon"
          :class="{ flipped: collapsed }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12H3M3 12L9 6M3 12L9 18" />
        </svg>
        <span class="toggle-label">折叠</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useSidebarState } from '@/composables/useSidebarState'

const route = useRoute()
const userStore = useUserStore()
const { collapsed, toggle: toggleCollapsed } = useSidebarState()
const animating = ref(false)

const showMeetingCopilotHomeEntry = false
const showSkillMarketplaceHomeEntry = false

// org-branding：折叠态 logo-mark 取品牌名首字（Array.from 兼容代理对/emoji）
const brandInitial = computed(() => Array.from(userStore.displayBrandName)[0] || '有')

const toggle = () => {
  animating.value = true
  toggleCollapsed()
}

const onTransitionEnd = (e: TransitionEvent) => {
  if (e.propertyName === 'width') {
    animating.value = false
  }
}

onMounted(() => {
  userStore.fetchUserInfo()
})

const menuItems = computed(() => {
  const items: { path: string; title: string; icon: string }[] = [
    { path: '/', title: '工作区', icon: 'workspace' },
    { path: '/sop', title: '运行记录', icon: 'history' }
  ]

  if (userStore.isParentUser) {
    items.push({ path: '/customers', title: '客户管理', icon: 'customers' })
  }

  items.push({ path: '/knowledge', title: '知识库', icon: 'knowledge' })
  items.push({ path: '/xhs', title: '选题库', icon: 'xhs' })
  // 竞品监控暂时隐藏（开发中，未对用户开放）
  // items.push({ path: '/monitor', title: '竞品监控', icon: 'monitor' })

  // 会议副驾 (meeting-copilot) — 代码与路由保留，首页功能栏先隐藏。
  if (
    showMeetingCopilotHomeEntry &&
    import.meta.env.VITE_ENABLE_MEETING_COPILOT === 'true'
  ) {
    items.push({ path: '/meeting', title: '会议副驾', icon: 'meeting' })
  }

  if (userStore.isParentUser) {
    items.push({ path: '/config', title: '配置中心', icon: 'config' })
    // 技能市场代码保留，首页功能栏先隐藏。
    if (showSkillMarketplaceHomeEntry) {
      items.push({ path: '/marketplace', title: '技能市场', icon: 'marketplace' })
    }
  } else {
    // skill-3tier-visibility T4: 子账户没有「配置中心」全入口，但可管理自己的个人技能。
    // 直接给一个「我的技能」入口指向 /config/skills（该路由已对子账户开放）。
    items.push({ path: '/config/skills', title: '我的技能', icon: 'skill' })
  }

  items.push({ path: '/settings', title: '设置', icon: 'settings' })

  return items
})

const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<style scoped>
/*
 * Sidebar Expand/Collapse Animation System
 *
 * Easing tokens:
 *   --ease-spring:  slight overshoot → lively but not bouncy
 *   --ease-decel:   fast start, gentle stop → elegant settle
 *
 * Choreography (collapse):
 *   1. Text opacity fades out instantly (120ms)
 *   2. Text max-width + gap shrink (240ms, delayed 0ms)
 *   3. Sidebar width shrinks (360ms spring)
 *   4. Icons get a subtle scale pulse via keyframe
 *
 * Choreography (expand):
 *   1. Sidebar width grows (360ms spring)
 *   2. Text max-width + gap grow (280ms, starts with width)
 *   3. Text opacity fades in (180ms, delayed 200ms → appears after space opens)
 */

.sidebar {
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-decel: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-width: 360ms;

  width: 220px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 36px 0 16px;
  flex-shrink: 0;
  overflow: hidden;
  background: hsla(160, 30%, 96%, 0.65);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-right: 1px solid hsla(160, 20%, 88%, 0.5);
  transition: width var(--duration-width) var(--ease-spring);
  will-change: width;
}

.sidebar.collapsed {
  width: 68px;
}

/* ===== Logo ===== */
.sidebar-logo {
  margin-bottom: 36px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  white-space: nowrap;
  transition: gap 280ms var(--ease-decel);
}

.collapsed .sidebar-logo {
  cursor: pointer;
  padding: 0 16px;
  gap: 0;
}

.logo-mark {
  width: 38px;
  height: 38px;
  min-width: 38px;
  border-radius: 12px;
  background: hsl(160, 60%, 40%);
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  box-shadow: none;
  flex-shrink: 0;
  transition: transform 400ms var(--ease-spring);
}

/* Pulse on toggle — driven by .animating */
.animating .logo-mark {
  animation: logo-breathe 400ms var(--ease-spring) both;
}

@keyframes logo-breathe {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(0.9);
  }
  100% {
    transform: scale(1);
  }
}

.collapsed .logo-mark:hover {
  transform: scale(1.05);
}

.logo-text {
  display: inline-block;
  font-size: 14px;
  font-weight: 700;
  color: hsl(160, 45%, 25%);
  font-family: var(--font-sans);
  letter-spacing: 0.01em;
  opacity: 1;
  max-width: 180px;
  overflow: hidden;
  /* Expand: opacity appears after space opens */
  transition:
    opacity 180ms var(--ease-decel) 200ms,
    max-width 280ms var(--ease-decel);
}

.collapsed .logo-text {
  opacity: 0;
  max-width: 0;
  /* Collapse: opacity disappears first */
  transition:
    opacity 120ms ease-out,
    max-width 240ms var(--ease-decel) 40ms;
}

/* ===== Navigation ===== */
.nav-menu {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 100%;
  padding: 0 12px;
}

.nav-item {
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
  transition:
    color 200ms ease,
    background 200ms ease,
    gap 280ms var(--ease-decel);
  cursor: pointer;
}

.collapsed .nav-item {
  padding: 11px 16px;
  gap: 0;
}

.nav-icon-svg {
  width: 20px;
  height: 20px;
  min-width: 20px;
  flex-shrink: 0;
  transition: transform 360ms var(--ease-spring);
}

/* Staggered icon micro-pulse on toggle */
.animating .nav-icon-svg {
  animation: icon-pulse 380ms var(--ease-spring) both;
  animation-delay: calc(60ms + var(--item-index, 0) * 30ms);
}

@keyframes icon-pulse {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

.nav-label {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  opacity: 1;
  /* Expand: staggered fade-in after space opens */
  transition:
    opacity 180ms var(--ease-decel) calc(180ms + var(--item-index, 0) * 25ms),
    max-width 280ms var(--ease-decel);
}

.collapsed .nav-label {
  max-width: 0;
  opacity: 0;
  /* Collapse: quick fade-out, then shrink */
  transition:
    opacity 100ms ease-out,
    max-width 240ms var(--ease-decel) 30ms;
}

.nav-item:hover {
  color: hsl(160, 40%, 36%);
  background: hsla(160, 45%, 50%, 0.1);
}

.nav-item.active {
  color: hsl(160, 60%, 38%);
  background: hsla(160, 50%, 50%, 0.14);
  font-weight: 600;
}

/* ===== Bottom (Toggle + Run) ===== */
.sidebar-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 0 12px;
}

.toggle-btn {
  appearance: none;
  border: none;
  background: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border-radius: 12px;
  color: hsl(160, 18%, 52%);
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  transition:
    color 200ms ease,
    background 200ms ease;
}

.toggle-icon {
  width: 20px;
  height: 20px;
  min-width: 20px;
  flex-shrink: 0;
  transition: transform 400ms var(--ease-spring);
}

.toggle-icon.flipped {
  transform: rotate(180deg);
}

.toggle-label {
  display: inline-block;
  max-width: 80px;
  overflow: hidden;
  opacity: 1;
  transition:
    opacity 180ms var(--ease-decel) 200ms,
    max-width 280ms var(--ease-decel);
}

.collapsed .toggle-label {
  max-width: 0;
  opacity: 0;
  transition:
    opacity 100ms ease-out,
    max-width 240ms var(--ease-decel) 30ms;
}

.toggle-btn:hover {
  color: hsl(160, 40%, 36%);
  background: hsla(160, 45%, 50%, 0.1);
}

.toggle-btn:active {
  background: hsla(160, 45%, 50%, 0.16);
}

/* Micro-pulse on the toggle icon during animation */
.animating .toggle-icon {
  animation: icon-pulse 380ms var(--ease-spring) both;
}

/* ===== Tooltip (collapsed state) ===== */
[data-tooltip] {
  position: relative;
}

[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  padding: 6px 12px;
  background: hsl(160, 20%, 22%);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease;
  z-index: 1000;
}

[data-tooltip]:hover::after {
  opacity: 1;
}

/* ===== Accessibility ===== */
@media (prefers-reduced-motion: reduce) {
  .sidebar,
  .sidebar-logo,
  .logo-mark,
  .logo-text,
  .nav-item,
  .nav-label,
  .nav-icon-svg,
  .toggle-icon,
  .toggle-label {
    transition: none !important;
    animation: none !important;
  }
}

/* ===== Mobile — bottom tab bar ===== */
@media (max-width: 768px) {
  .sidebar,
  .sidebar.collapsed {
    width: 100%;
    height: auto;
    flex-direction: row;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
    gap: 0;
    transition: none;
    will-change: auto;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: hsl(160, 30%, 97%);
    border-right: none;
    border-top: 1px solid hsla(160, 20%, 88%, 0.6);
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.04);
    justify-content: center;
  }

  .sidebar-logo {
    display: none;
  }

  .nav-menu {
    flex-direction: row;
    gap: 0;
    padding: 0;
    flex: 1;
    justify-content: space-around;
  }

  .nav-item {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 8px;
    font-size: 10px;
    gap: 3px;
    border-radius: 10px;
    min-width: 0;
    flex: 1;
    transition:
      color 200ms ease,
      background 200ms ease;
  }

  .nav-icon-svg {
    width: 22px;
    height: 22px;
    min-width: 22px;
    animation: none !important;
  }

  .nav-label {
    max-width: none;
    opacity: 1;
    transition: none;
    font-size: 10px;
    line-height: 1.2;
  }

  .collapsed .nav-label {
    max-width: none;
    opacity: 1;
  }

  .collapsed .nav-item {
    gap: 3px;
  }

  .sidebar-bottom {
    display: none;
  }

  [data-tooltip]::after {
    display: none;
  }
}
</style>
