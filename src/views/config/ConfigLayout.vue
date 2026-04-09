<template>
  <div class="config-layout">
    <div class="config-tabs">
      <router-link
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        class="config-tab"
        :class="{ active: isActive(tab.path) }"
      >
        {{ tab.label }}
      </router-link>
    </div>
    <div class="config-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { label: '智能体管理', path: '/config/chatbots' },
  { label: 'SOP 管理', path: '/config/sop-templates' },
  { label: '知识库管理', path: '/config/knowledge-bases' }
]

function isActive(path: string) {
  return route.path.startsWith(path)
}
</script>

<style scoped>
.config-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-tabs {
  display: flex;
  gap: 4px;
  padding: 16px 24px 0;
  border-bottom: 1px solid var(--border, #e5e7eb);
  flex-shrink: 0;
}

.config-tab {
  padding: 8px 16px;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.config-tab:hover {
  color: var(--text, #111827);
}

.config-tab.active {
  color: var(--primary, #3b82f6);
  border-bottom-color: var(--primary, #3b82f6);
  font-weight: 500;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
</style>
