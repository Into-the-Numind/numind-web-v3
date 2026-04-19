<script setup lang="ts">
import { Library, User, MessageCircle, Menu } from 'lucide-vue-next'
import SalesStageDropdown from './SalesStageDropdown.vue'

defineProps<{
  title: string
  showConfigButtons: boolean
}>()

const emit = defineEmits<{
  openKb: []
  openProfile: []
  openChatStyle: []
  toggleSidebar: []
}>()
</script>

<template>
  <header class="main-header">
    <div class="header-left">
      <h2 class="session-title">{{ title }}</h2>
    </div>
    <div class="header-right">
      <template v-if="showConfigButtons">
        <button class="header-btn" title="知识库" @click="emit('openKb')">
          <Library :size="18" />
        </button>
        <button class="header-btn" title="客户档案" @click="emit('openProfile')">
          <User :size="18" />
        </button>
        <button class="header-btn" title="语言风格" @click="emit('openChatStyle')">
          <MessageCircle :size="18" />
        </button>
        <SalesStageDropdown />
      </template>
      <button class="header-btn mobile-menu-btn" @click="emit('toggleSidebar')">
        <Menu :size="18" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.main-header {
  height: 52px;
  margin: 0;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: none;
  border-radius: 0;
  box-shadow: none;
  z-index: 50;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  overflow: hidden;
  flex: 1;
  padding-right: 24px;
}

.session-title {
  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.header-btn:hover {
  background: rgba(0, 0, 0, 0.04);
  color: var(--text);
}

.header-btn.active {
  background: rgba(37, 167, 105, 0.1);
  color: var(--primary);
}

/* Tooltips */
.header-btn::after {
  position: absolute;
  top: calc(100% + 10px);
  right: 50%;
  transform: translateX(50%) translateY(4px);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s;
  pointer-events: none;
  z-index: 100;
}

.header-btn:hover::after {
  opacity: 1;
  visibility: visible;
  transform: translateX(50%) translateY(0);
}

.mobile-menu-btn {
  display: none;
}

@media (max-width: 768px) {
  .main-header {
    padding: env(safe-area-inset-top, 0px) 12px 0 52px;
    height: calc(52px + env(safe-area-inset-top, 0px));
  }

  .header-left {
    padding-right: 12px;
  }

  .session-title {
    font-size: 14px;
  }

  .header-right {
    gap: 4px;
  }

  .header-btn {
    width: 34px;
    height: 34px;
  }

  .mobile-menu-btn {
    display: flex;
  }

  /* Hide tooltips on mobile */
  .header-btn::after {
    display: none;
  }
}
</style>
