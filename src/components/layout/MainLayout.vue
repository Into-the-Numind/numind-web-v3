<template>
  <div class="app-shell">
    <Sidebar />
    <main class="main-panel">
      <slot></slot>
    </main>
  </div>
</template>

<script setup lang="ts">
import Sidebar from './AppSidebar.vue'
</script>

<style scoped>
.app-shell {
  width: 100vw;
  height: 100vh;
  display: flex;
  background: #F0F1F5;
  padding: 0;
  gap: 0;
  overflow: hidden;
}

/*
 * Frosted-glass look WITHOUT backdrop-filter.
 *
 * The old blur(32px) was the sole cause of sidebar-toggle jank:
 * every frame of the width transition forced a full-surface
 * Gaussian blur recomposition on the GPU.
 *
 * Replacement technique — layered semi-transparent backgrounds +
 * inner highlight + shadow depth cues. Zero per-frame cost.
 */
.main-panel {
  flex: 1;
  position: relative;
  background: #FFFFFF;
  border: 1px solid #E8E9EE;
  border-radius: 0;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.03),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.9);
  padding: 36px 40px;
  overflow-y: auto;
  font-family: var(--font-sans);
  min-width: 0;
}

@media (max-width: 768px) {
  .app-shell {
    flex-direction: column;
    padding: 0;
  }

  .main-panel {
    border-radius: 0;
    border: none;
    padding: calc(20px + env(safe-area-inset-top, 0px)) 16px calc(var(--mobile-tab-bar-height, 64px) + 16px);
    box-shadow: none;
    height: 100dvh;
  }
}
</style>
