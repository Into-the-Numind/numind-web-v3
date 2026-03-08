import { ref, computed, onBeforeUnmount } from 'vue'
import type { ImageUploadItem } from '@/api/sales'
import { ocrImage } from '@/api/sales'

export function useImageUpload(options?: { maxImages?: number }) {
  const maxImages = options?.maxImages ?? 10
  const images = ref<ImageUploadItem[]>([])

  const allReady = computed(() =>
    images.value.length > 0 && images.value.every((img) => img.status === 'success')
  )

  const hasImages = computed(() => images.value.length > 0)

  async function addImage(file: File) {
    if (images.value.length >= maxImages) return

    // Type check
    if (!file.type.startsWith('image/')) return

    images.value.push({
      file,
      previewUrl: URL.createObjectURL(file),
      ocrResult: '',
      status: 'processing'
    })
    // 必须从 reactive 数组取引用，直接操作 push 前的原始对象不会触发 Vue 响应式更新
    const item = images.value[images.value.length - 1]

    try {
      const result = await ocrImage(file)
      item.ocrResult = result.text
      if (result.url) {
        // Replace blob URL with persisted URL
        const oldUrl = item.previewUrl
        item.previewUrl = result.url
        URL.revokeObjectURL(oldUrl)
      }
      item.status = 'success'
    } catch (e) {
      console.error('[imageUpload] OCR failed:', e)
      item.status = 'error'
    }
  }

  function removeImage(index: number) {
    const item = images.value[index]
    if (item?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl)
    }
    images.value.splice(index, 1)
  }

  function clearAll() {
    images.value.forEach((img) => {
      if (img.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl)
    })
    images.value = []
  }

  onBeforeUnmount(() => {
    clearAll()
  })

  function handlePaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          event.preventDefault()
          addImage(file)
        }
      }
    }
  }

  return {
    images,
    allReady,
    hasImages,
    addImage,
    removeImage,
    clearAll,
    handlePaste
  }
}
