<script setup lang="ts">
import { X, Loader2 } from 'lucide-vue-next'
import type { ImageUploadItem } from '@/api/sales'

defineProps<{
  images: ImageUploadItem[]
}>()

const emit = defineEmits<{
  remove: [index: number]
  preview: [url: string]
}>()
</script>

<template>
  <div v-if="images.length > 0" class="image-preview-strip">
    <div
      v-for="(img, index) in images"
      :key="img.previewUrl || index"
      class="image-preview-item"
      :class="img.status"
    >
      <img :src="img.previewUrl" alt="上传图片预览" @click="emit('preview', img.previewUrl)" />
      <div v-if="img.status === 'processing'" class="image-processing-overlay">
        <Loader2 :size="20" class="spin-icon" />
      </div>
      <div v-if="img.status === 'error'" class="image-error-overlay">
        <span>OCR 失败</span>
      </div>
      <button class="image-remove-btn" aria-label="移除图片" @click.stop="emit('remove', index)">
        <X :size="12" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.image-preview-strip {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  overflow-x: auto;
  flex-shrink: 0;
}

.image-preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.image-preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
}

.image-preview-item.processing {
  border-color: rgba(37, 167, 105, 0.3);
}

.image-preview-item.success {
  border-color: rgba(37, 167, 105, 0.5);
}

.image-preview-item.error {
  border-color: rgba(239, 68, 68, 0.5);
}

.image-processing-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.image-error-overlay {
  position: absolute;
  inset: 0;
  background: rgba(239, 68, 68, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 11px;
  font-weight: 500;
}

.image-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.image-preview-item:hover .image-remove-btn {
  opacity: 1;
}

.image-remove-btn:hover {
  background: rgba(239, 68, 68, 0.8);
}
</style>
