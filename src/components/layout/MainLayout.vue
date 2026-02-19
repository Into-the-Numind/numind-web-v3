<template>
  <div class="layout">
    <Sidebar />
    <main class="main-content">
      <slot></slot>
    </main>
  </div>
</template>

<script setup lang="ts">
import Sidebar from './AppSidebar.vue'
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
  gap: 0;
  padding: 0;
}

.main-content {
  flex: 1;
  background: #fdfdfd;
  border-radius: 0;
  padding: var(--space-3xl);
  overflow-y: auto;
  box-shadow: none;
  font-family: var(--font-sans);
  min-width: 0;
}

@media (max-width: 1024px) {
  .layout {
    padding: var(--space-lg);
    gap: var(--space-lg);
  }
}

@media (max-width: 768px) {
  .layout {
    flex-direction: column;
    padding: var(--space-md);
    gap: var(--space-md);
  }

  .main-content {
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
  }
}
</style>
