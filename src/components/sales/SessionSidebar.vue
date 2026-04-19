<template>
  <aside class="sidebar" :class="{ 'mobile-open': mobileOpen }">
    <!-- 返回首页 -->
    <button type="button" class="nav__back" @click="emit('back')">
      <ArrowLeft :size="16" aria-hidden="true" />
      <span>返回首页</span>
    </button>

    <button class="new-chat-btn" @click="emit('newChat')">
      <Plus :size="18" />
      <span>新对话</span>
    </button>
    <div class="sessions-list">
      <div
        v-for="session in store.sortedSessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === store.currentSessionId }"
        @click="store.switchSession(session.id)"
      >
        <Pin v-if="session.isPinned" :size="16" class="pin-indicator" />
        <MessageSquare v-else :size="16" />
        <span class="session-title">{{ session.title }}</span>
        <div class="session-menu-container">
          <button class="session-menu-btn" @click.stop="toggleMenu(session.id)">
            <MoreVertical :size="16" />
          </button>
          <div class="session-menu-dropdown" :class="{ show: openMenuId === session.id }">
            <button class="session-menu-item" @click.stop="handlePin(session)">
              <PinOff v-if="session.isPinned" :size="14" />
              <Pin v-else :size="14" />
              <span>{{ session.isPinned ? '取消置顶' : '置顶' }}</span>
            </button>
            <button class="session-menu-item" @click.stop="handleRename(session)">
              <Edit3 :size="14" />
              <span>重命名</span>
            </button>
            <button class="session-menu-item danger" @click.stop="handleDelete(session.id)">
              <Trash2 :size="14" />
              <span>删除</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  ArrowLeft,
  Plus,
  MessageSquare,
  Pin,
  PinOff,
  MoreVertical,
  Edit3,
  Trash2
} from 'lucide-vue-next'
import { useSalesStore } from '@/stores/sales'
import type { SalesSession } from '@/api/sales'

defineProps<{
  mobileOpen?: boolean
}>()

const store = useSalesStore()

const emit = defineEmits<{
  back: []
  newChat: []
  rename: [id: number, title: string]
  delete: [id: number]
}>()

const openMenuId = ref<number | null>(null)

function toggleMenu(sessionId: number) {
  openMenuId.value = openMenuId.value === sessionId ? null : sessionId
}

function closeMenus() {
  openMenuId.value = null
}

function handlePin(session: SalesSession) {
  store.togglePinSession(session.id, session.isPinned)
  closeMenus()
}

function handleRename(session: SalesSession) {
  emit('rename', session.id, session.title)
  closeMenus()
}

function handleDelete(sessionId: number) {
  emit('delete', sessionId)
  closeMenus()
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.session-menu-container')) {
    closeMenus()
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>

<style scoped>
.nav__back {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  margin: 0 12px 8px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: hsl(160, 18%, 52%);
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition:
    color 200ms ease,
    background 200ms ease;
}

.nav__back:hover {
  color: hsl(160, 40%, 36%);
  background: hsla(160, 45%, 50%, 0.1);
}

.sidebar {
  width: var(--sidebar-width, 280px);
  height: 100%;
  background: hsla(160, 30%, 96%, 0.65);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-right: 1px solid hsla(160, 20%, 88%, 0.5);
  display: flex;
  flex-direction: column;
  z-index: 10;
  padding-top: 16px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.new-chat-btn {
  margin: 0 12px 12px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md, 10px);
  color: var(--primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.new-chat-btn :deep(svg) {
  width: 18px;
  height: 18px;
  stroke-width: 2;
}

.new-chat-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px;
}

.session-item {
  padding: 12px;
  margin-bottom: 4px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.session-item > :deep(svg) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  stroke-width: 2;
}

.session-item:hover {
  background: hsla(160, 45%, 50%, 0.1);
  color: var(--text);
}

.session-item.active {
  background: hsla(160, 50%, 50%, 0.14);
  color: var(--primary);
  font-weight: 600;
}

.pin-indicator {
  color: var(--primary) !important;
}

.session-title {
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.session-menu-container {
  margin-left: auto;
  position: relative;
}

.session-menu-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  opacity: 0;
  padding: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-menu-btn :deep(svg) {
  width: 16px;
  height: 16px;
  stroke-width: 2;
}

.session-item:hover .session-menu-btn {
  opacity: 1;
}

.session-menu-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.session-menu-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  min-width: 140px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-8px);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 100;
  overflow: hidden;
}

.session-menu-dropdown.show {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.session-menu-item {
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--text);
  font-size: 0.85rem;
  text-align: left;
}

.session-menu-item :deep(svg) {
  width: 14px;
  height: 14px;
  stroke-width: 2;
}

.session-menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.session-menu-item.danger {
  color: #ef4444;
}

.session-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.08);
}

/* ===== Mobile ===== */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 280px;
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 25;
    background: hsla(160, 30%, 96%, 0.95);
    backdrop-filter: blur(24px) saturate(1.4);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
    padding-top: 60px;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.1);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }

  .session-menu-btn {
    opacity: 1;
  }
}
</style>
