<template>
  <MainLayout>
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
  </MainLayout>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'

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
  margin: -36px -40px;
  width: calc(100% + 80px);
  height: calc(100% + 72px);
}

.config-tabs {
  display: flex;
  gap: 4px;
  padding: 20px 28px 0;
  border-bottom: 1px solid var(--color-border, #e2e4ea);
  flex-shrink: 0;
  background: var(--color-surface, #fff);
}

.config-tab {
  padding: 10px 18px;
  font-size: 0.875rem;
  color: var(--color-text-secondary, #5f6577);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all var(--transition-fast, 150ms ease);
  border-radius: var(--radius-sm, 6px) var(--radius-sm, 6px) 0 0;
}

.config-tab:hover {
  color: var(--color-text, #1a1d26);
  background: var(--color-surface-hover, #f3f4f8);
}

.config-tab.active {
  color: var(--color-primary, #26a86d);
  border-bottom-color: var(--color-primary, #26a86d);
  font-weight: 600;
  background: transparent;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px;
}
</style>
