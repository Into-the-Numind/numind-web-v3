import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { extractFileText } from '@/api/files'

const MAX_FILES = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.doc', '.docx']

export interface DocUploadItem {
  localId: string
  file: File
  fileName: string
  status: 'uploading' | 'success' | 'error'
  result?: string
  error?: string
}

export interface HandleFilesResult {
  rejected: number
  reason: 'limit' | null
}

export interface UseDocUploadReturn {
  items: Ref<DocUploadItem[]>
  isUploading: ComputedRef<boolean>
  handleFiles: (files: File[] | FileList) => Promise<HandleFilesResult>
  removeItem: (localId: string) => void
  clearItems: () => void
  compose: (baseText: string) => string
  handlePaste: (event: ClipboardEvent) => Promise<boolean>
  handleDrop: (event: DragEvent) => void
}

function makeLocalId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  if (idx === -1) return ''
  return filename.slice(idx).toLowerCase()
}

export function useDocUpload(): UseDocUploadReturn {
  const items = ref<DocUploadItem[]>([])

  const isUploading = computed(() => items.value.some((i) => i.status === 'uploading'))

  async function handleFiles(files: File[] | FileList): Promise<HandleFilesResult> {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return { rejected: 0, reason: null }

    // Validate total count
    const remaining = MAX_FILES - items.value.length
    if (remaining <= 0) {
      return { rejected: fileArray.length, reason: 'limit' }
    }
    const toProcess = fileArray.slice(0, remaining)
    const rejectedCount = fileArray.length - toProcess.length

    const newItems: DocUploadItem[] = []
    const validLocalIds: string[] = []

    for (const file of toProcess) {
      const ext = getExtension(file.name)
      const localId = makeLocalId()

      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        newItems.push({
          localId,
          file,
          fileName: file.name,
          status: 'error',
          error: `不支持的文件类型：${ext || '(无扩展名)'}`
        })
        continue
      }

      if (file.size > MAX_FILE_SIZE) {
        newItems.push({
          localId,
          file,
          fileName: file.name,
          status: 'error',
          error: `文件超过 10MB 限制`
        })
        continue
      }

      if (file.size === 0) {
        newItems.push({
          localId,
          file,
          fileName: file.name,
          status: 'error',
          error: '文件为空'
        })
        continue
      }

      newItems.push({
        localId,
        file,
        fileName: file.name,
        status: 'uploading'
      })
      validLocalIds.push(localId)
    }

    // Push all items at once to avoid UI flicker
    items.value = [...items.value, ...newItems]

    // Process valid files in parallel.
    // IMPORTANT: find proxy object via items.value.find() to ensure Vue reactivity.
    await Promise.all(
      validLocalIds.map(async (localId) => {
        const proxyItem = items.value.find((i) => i.localId === localId)
        if (!proxyItem) return
        try {
          const result = await extractFileText(proxyItem.file)
          proxyItem.result = result
          proxyItem.status = 'success'
        } catch (err) {
          proxyItem.status = 'error'
          proxyItem.error = (err as Error)?.message || '解析失败'
        }
      })
    )

    return { rejected: rejectedCount, reason: rejectedCount > 0 ? 'limit' : null }
  }

  function removeItem(localId: string): void {
    items.value = items.value.filter((i) => i.localId !== localId)
  }

  function clearItems(): void {
    items.value = []
  }

  function compose(baseText: string): string {
    const successItems = items.value.filter((i) => i.status === 'success' && i.result)
    if (successItems.length === 0) {
      return baseText
    }

    const parts: string[] = []
    if (baseText.trim()) {
      parts.push(baseText.trim())
    }

    const attachmentParts = successItems.map((i) => `【${i.fileName}】\n${i.result}`)
    parts.push(`---附件内容---\n\n${attachmentParts.join('\n\n')}`)

    return parts.join('\n\n')
  }

  async function handlePaste(event: ClipboardEvent): Promise<boolean> {
    const clipboardFiles = event.clipboardData?.files
    if (!clipboardFiles || clipboardFiles.length === 0) {
      return false
    }
    await handleFiles(clipboardFiles)
    return true
  }

  function handleDrop(event: DragEvent): void {
    const droppedFiles = event.dataTransfer?.files
    if (!droppedFiles || droppedFiles.length === 0) return
    handleFiles(droppedFiles)
  }

  return {
    items,
    isUploading,
    handleFiles,
    removeItem,
    clearItems,
    compose,
    handlePaste,
    handleDrop
  }
}
