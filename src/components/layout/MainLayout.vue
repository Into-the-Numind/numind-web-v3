<template>
  <div class="layout">
    <Sidebar />
    <main class="main-content">
      <header class="page-header">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <div class="header-actions">
          <slot name="actions"></slot>
        </div>
      </header>
      <div class="page-content">
        <slot></slot>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './Sidebar.vue'

const route = useRoute()

const pageTitle = computed(() => {
  return (route.meta.title as string) || '莫小派工作站'
})
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background: var(--color-bg);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-light);
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-content {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .page-header {
    padding: 16px 20px;
  }

  .page-title {
    font-size: 20px;
  }

  .page-content {
    padding: 16px 20px;
  }
}
</style>
