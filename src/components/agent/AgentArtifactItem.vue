<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, FileText, X } from 'lucide-vue-next'

interface Props {
  artifact: {
    id: number
    filename: string
    url: string
    mime: string
  }
}

const props = defineProps<Props>()

const isImage = computed<boolean>(() => props.artifact.mime.startsWith('image/'))

const showPreview = ref(false)

const openPreview = (): void => {
  showPreview.value = true
}

const closePreview = (): void => {
  showPreview.value = false
}

const handleDownload = (): void => {
  const a = document.createElement('a')
  a.href = props.artifact.url
  a.download = props.artifact.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
</script>

<template>
  <div class="artifact-item">
    <div v-if="isImage" class="image-wrap">
      <img :src="artifact.url" :alt="artifact.filename" class="thumb" @click="openPreview" />
      <p class="filename">{{ artifact.filename }}</p>
    </div>

    <div v-else class="file-row">
      <FileText :size="20" class="file-icon" />
      <span class="filename">{{ artifact.filename }}</span>
      <button class="download-btn" @click="handleDownload" aria-label="下载文件">
        <Download :size="16" />
      </button>
    </div>

    <!-- 图片预览 modal -->
    <Teleport to="body">
      <div v-if="showPreview" class="preview-overlay" @click="closePreview">
        <button class="preview-close" @click.stop="closePreview" aria-label="关闭预览">
          <X :size="20" />
        </button>
        <img :src="artifact.url" :alt="artifact.filename" class="preview-img" @click.stop />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.artifact-item {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px 0;
}

.image-wrap {
  cursor: pointer;
}

.thumb {
  max-width: 240px;
  max-height: 160px;
  border-radius: 6px;
  object-fit: cover;
  display: block;
}

.filename {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  color: var(--color-primary, #2563eb);
  flex-shrink: 0;
}

.file-row .filename {
  flex: 1;
  margin: 0;
  font-size: 13px;
  color: var(--color-text, #1f2937);
}

.download-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted, #6b7280);
  padding: 4px;
  border-radius: 4px;
}

.download-btn:hover {
  background: #f3f4f6;
  color: var(--color-primary, #2563eb);
}

.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
}
</style>
