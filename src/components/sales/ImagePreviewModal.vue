<script setup lang="ts">
import { X } from 'lucide-vue-next'

const props = defineProps<{
  open: boolean
  imageUrl: string
}>()

const emit = defineEmits<{
  close: []
}>()

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="image-preview-modal open" @click="onOverlayClick">
      <div class="image-preview-content">
        <img :src="props.imageUrl" alt="图片预览" />
        <button class="image-preview-close" aria-label="关闭预览" @click="emit('close')">
          <X :size="22" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@import '@/assets/styles/sales-modal.css';
</style>

<style scoped>
/* ==================== Image Preview Modal ==================== */
.image-preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.image-preview-modal.open {
  opacity: 1;
}

.image-preview-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: modalZoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalZoomIn {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.image-preview-content img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.image-preview-close {
  position: absolute;
  top: -50px;
  right: -50px;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: all 0.2s ease;
  backdrop-filter: blur(4px);
}

.image-preview-close:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

@media (max-width: 768px) {
  .image-preview-close {
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.5);
  }
}
</style>
