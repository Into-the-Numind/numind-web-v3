<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import AgentFeedbackBar from './AgentFeedbackBar.vue'
import { Copy, Check } from 'lucide-vue-next'

interface Props {
  markdown: string
  runId?: number
  initialFeedback?: 'positive' | 'negative' | null
  initialNote?: string
}

const props = withDefaults(defineProps<Props>(), {
  runId: undefined,
  initialFeedback: null,
  initialNote: ''
})

const html = computed<string>(() => renderMarkdown(props.markdown))

const previewImageUrl = ref<string | null>(null)

const handleImageClick = (e: MouseEvent): void => {
  const target = e.target as HTMLElement
  if (target.tagName === 'IMG') {
    previewImageUrl.value = (target as HTMLImageElement).src
  }
}

const closePreview = (): void => {
  previewImageUrl.value = null
}

const copied = ref(false)

const copyText = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.markdown)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = props.markdown
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
    } catch {
      // silently ignore
    }
  }
}
</script>

<template>
  <div class="final-answer">
    <!-- eslint-disable-next-line vue/no-v-html (markdown 已 DOMPurify sanitize) -->
    <div class="markdown-body" v-html="html" @click="handleImageClick"></div>
    <div class="feedback-section">
      <div class="feedback-left">
        <AgentFeedbackBar
          :run-id="runId"
          :initial-feedback="initialFeedback"
          :initial-note="initialNote"
        />
      </div>
      <div class="feedback-right">
        <button
          class="ai-action-btn"
          :class="{ copied: copied }"
          @click="copyText"
          title="复制回答"
        >
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
          <span>{{ copied ? '已复制' : '复制' }}</span>
        </button>
      </div>
    </div>

    <!-- 全屏图片大图预览 Modal -->
    <Teleport to="body">
      <div v-if="previewImageUrl" class="image-preview-overlay" @click="closePreview">
        <div class="image-preview-content">
          <img :src="previewImageUrl" class="preview-img" alt="预览大图" />
          <button class="close-btn" @click.stop="closePreview" aria-label="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="close-icon"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.final-answer {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  width: 100%;
}

.markdown-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text, #1f2937);
}

/* Markdown 分割线：AI/用户输出的横向分割线在前端完全隐藏 */
.markdown-body :deep(hr) {
  display: none !important;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 16px 0 8px;
  color: var(--color-text, #1f2937);
}

.markdown-body :deep(p) {
  margin: 8px 0;
}

.markdown-body :deep(code) {
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #b91c1c;
}

.markdown-body :deep(pre) {
  background: #1f2937;
  color: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 6px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: #f9fafb;
}

.feedback-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.feedback-left {
  display: flex;
  align-items: center;
}

.feedback-right {
  display: flex;
  align-items: center;
}

.ai-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  color: var(--text-muted, #6b7280);
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-action-btn:hover {
  color: var(--primary, #2563eb);
  border-color: var(--primary, #2563eb);
  background: rgba(37, 167, 105, 0.04);
}

.ai-action-btn.copied {
  color: var(--primary, #2563eb);
  border-color: var(--primary, #2563eb);
  background: rgba(37, 167, 105, 0.08);
}

/* 缩略图展现样式 */
.markdown-body :deep(img) {
  max-width: 240px;
  max-height: 180px;
  border-radius: 8px;
  cursor: zoom-in;
  border: 1px solid #e5e7eb;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: block;
  margin: 8px 0;
  object-fit: cover;
  background: var(--surface-low, #f9fafb);
}

.markdown-body :deep(img:hover) {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 全屏大图遮罩层 — 毛玻璃和淡入动画 */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

.image-preview-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: zoomIn 0.2s ease;
}

.preview-img {
  max-width: 100%;
  max-height: 90vh;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  object-fit: contain;
}

.close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  outline: none;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.close-icon {
  width: 16px;
  height: 16px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes zoomIn {
  from { transform: scale(0.95); }
  to { transform: scale(1); }
}
</style>
