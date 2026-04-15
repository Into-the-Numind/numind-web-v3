<script setup lang="ts">
import { ArrowDown } from 'lucide-vue-next'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <div class="scroll-btn-wrapper">
    <button class="scroll-to-bottom-btn" :class="{ visible }" @click="emit('click')">
      <ArrowDown :size="16" />
      <span>回到底部</span>
    </button>
  </div>
</template>

<style scoped>
.scroll-btn-wrapper {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 175px;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 25;
}

.scroll-to-bottom-btn {
  padding: 8px 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 999px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: all 0.25s ease;
}

.scroll-to-bottom-btn.visible {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.scroll-to-bottom-btn:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(37, 167, 105, 0.2);
  color: var(--primary);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.scroll-to-bottom-btn:active {
  transform: scale(0.96);
}

@media (max-width: 768px) {
  .scroll-to-bottom-btn {
    padding: 10px 18px;
    font-size: 14px;
  }
}
</style>
