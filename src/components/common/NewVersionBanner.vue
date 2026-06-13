<script setup lang="ts">
/**
 * NewVersionBanner — agent-wait-ux 5b.
 *
 * A non-blocking pill that appears when a newer frontend bundle has been
 * deployed while this tab stayed open. The user refreshes on their own terms
 * (we never force a reload that could interrupt in-progress work) or dismisses
 * it. Mounted once globally in App.vue.
 */
import { ref } from 'vue'
import { useVersionCheck } from '@/composables/useVersionCheck'

const { updateAvailable, reload } = useVersionCheck()
const dismissed = ref(false)
</script>

<template>
  <Transition name="version-banner">
    <div v-if="updateAvailable && !dismissed" class="version-banner" role="status">
      <span class="version-banner__text">有新版本啦，刷新即可使用最新功能</span>
      <button type="button" class="version-banner__refresh" @click="reload">刷新</button>
      <button
        type="button"
        class="version-banner__dismiss"
        aria-label="忽略"
        @click="dismissed = true"
      >
        ×
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.version-banner {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 16px;
  background: var(--surface);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius-full, 9999px);
  box-shadow: var(--shadow-md);
  font-size: 14px;
  color: var(--text, #1f2330);
}

.version-banner__text {
  white-space: nowrap;
}

.version-banner__refresh {
  padding: 4px 14px;
  border: none;
  border-radius: var(--radius-full, 9999px);
  background: var(--primary);
  color: var(--primary-foreground, #fff);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.version-banner__refresh:hover {
  background: var(--primary-hover);
}

.version-banner__dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.version-banner__dismiss:hover {
  background: var(--surface-hover);
}

.version-banner-enter-active,
.version-banner-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.version-banner-enter-from,
.version-banner-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}
</style>
