<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { X, Download } from 'lucide-vue-next'

/**
 * AgentImagePreview — 全屏图片放大预览 + 下载
 *
 * agent mode 里生成的图片以 markdown `![](url)` 内联渲染（见 AgentFinalAnswer /
 * AgentMessageItem 的 .markdown-body）。点击内联缩略图后由父组件把图片 URL 传入
 * 本组件的 `url` prop，弹出全屏大图；提供「下载」「关闭」两个操作。
 *
 * 抽成共享组件而非在两处各写一遍 overlay，避免重复（最初 AgentFinalAnswer 自带
 * overlay 但无下载按钮，AgentMessageItem 的流式气泡则完全没有放大能力）。
 */
const props = defineProps<{
  /** 当前预览的图片 URL；为 null 时不渲染任何内容 */
  url: string | null
}>()

const emit = defineEmits<{ close: [] }>()

/**
 * 从（通常是带签名 query 的跨域 COS）URL 推导一个干净的下载文件名。
 * 只有 URL 可用（内联 <img> 只暴露 src），所以从 pathname 取末段并剥离 query。
 */
function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url, window.location.origin).pathname
    const base = path.substring(path.lastIndexOf('/') + 1)
    return base ? decodeURIComponent(base) : 'image.png'
  } catch {
    return 'image.png'
  }
}

/**
 * 跨域安全下载：COS 预签名 URL 是跨域的，浏览器会忽略 <a download>，若不加
 * target=_blank 会把当前 app 标签页导航到原始文件。用一个无 opener 的新标签页
 * 触发下载，保留 app 会话。（与 AgentArtifactItem.handleDownload 同一模式。）
 */
function handleDownload(): void {
  if (!props.url) return
  const a = document.createElement('a')
  a.href = props.url
  a.download = filenameFromUrl(props.url)
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.url) emit('close')
}

// Register the Esc listener only while a preview is actually open. Each
// AgentMessageItem / AgentFinalAnswer mounts one AgentImagePreview, so a long
// conversation would otherwise accumulate one idle document listener per message.
watch(
  () => props.url,
  (url) => {
    if (url) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="url"
      class="image-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      @click="emit('close')"
    >
      <div class="image-preview-content" @click.stop>
        <img :src="url" class="preview-img" alt="预览大图" />
        <div class="image-preview-actions">
          <button
            class="image-action-btn download-btn"
            aria-label="下载图片"
            title="下载图片"
            @click.stop="handleDownload"
          >
            <Download :size="18" />
          </button>
          <button
            class="image-action-btn close-btn"
            aria-label="关闭预览"
            title="关闭"
            @click.stop="emit('close')"
          >
            <X :size="18" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
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
  z-index: var(--z-modal);
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
  border-radius: var(--agent-radius-inner, 8px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  object-fit: contain;
}

/* 操作按钮组：叠在图片右上角，下载 + 关闭。
   叠在图片内（而非图片上方 -48px）以免高图把按钮顶出可视区。 */
.image-preview-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 10px;
}

.image-action-btn {
  /* 深色半透明底，保证在任意亮度的图片上都可见 */
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: white;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition:
    background 0.2s ease,
    transform 0.2s ease;
  outline: none;
}

.image-action-btn:hover {
  background: rgba(0, 0, 0, 0.68);
  transform: scale(1.08);
}

.image-action-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.7);
  outline-offset: 2px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes zoomIn {
  from {
    transform: scale(0.95);
  }
  to {
    transform: scale(1);
  }
}
</style>
