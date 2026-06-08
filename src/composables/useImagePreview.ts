import { ref } from 'vue'

/**
 * useImagePreview — 内联 markdown 图片的「点击放大」状态与点击处理。
 *
 * agent mode 的图片以 `![](url)` 内联渲染在 .markdown-body 里（v-html）。点击其中的
 * <img> 时记录其 src，配合 AgentImagePreview 组件弹出全屏大图 + 下载。
 * 抽成 composable 供 AgentFinalAnswer / AgentMessageItem 复用，避免两处各写一份。
 */
export function useImagePreview() {
  const previewImageUrl = ref<string | null>(null)

  function handleImageClick(e: MouseEvent): void {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      previewImageUrl.value = (target as HTMLImageElement).src
    }
  }

  function closePreview(): void {
    previewImageUrl.value = null
  }

  return { previewImageUrl, handleImageClick, closePreview }
}
