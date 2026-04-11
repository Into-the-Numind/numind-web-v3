/**
 * useFileUpload — 文件上传分流处理 composable
 *
 * ## 职责
 *
 * 用户在步骤输入区上传文件（点击上传按钮 / 拖拽），分流处理：
 *   - **图片** (.jpg/.jpeg/.png/.gif/.webp/.bmp/.svg) → POST /v1/ali/vision/analyze（OCR）
 *   - **文档** (.pdf/.txt/.md/.docx/.doc/.rtf) → POST /v1/pdf/convert-to-text
 *   - **其他** → 拒绝 + error 反馈
 *
 * ## 关键设计：分离 baseText 和 uploadResults
 *
 * 等价复刻 legacy `textareaBaseText` / `textareaImageResults` Map（legacy 行 2956-2959）。
 *
 * 防止并发上传互相覆盖用户手输内容。用户的 textarea 最终值 = baseText + 所有 uploadResults 拼接：
 *
 * ```
 * textarea.value = baseText + '\n\n' + [fileA_result, fileB_result, fileC_result].join('\n\n')
 * ```
 *
 * 调用方负责：
 *   1. 初始化 baseText（如果有）
 *   2. 用户输入 textarea 时更新 baseText
 *   3. 上传完成时读取 compose() 拼接结果写回 textarea
 *
 * ## 文件大小限制（实测后端）
 *
 * - 图片：**7MB**（后端 `/v1/ali/vision/analyze` 硬限，阿里百炼约束）
 * - 文档：**10MB**（后端 `pdf/pdf.go MaxFileSize = 10 * 1024 * 1024`）
 *
 * spec §6 原本写 20MB 是**错的**，本实现以后端实测为准。
 *
 * ## 前置约束：必须已有 runId + nodeId
 *
 * 两个后端端点都要求 `run_id` 和 `node_id` 作为 form 参数。Draft 模式（尚未
 * lazyCreateRun）不能调用这两个 API。调用方必须：
 *   1. 首先调用 `useDraftLifecycle.lazyCreateRun(templateId)` 创建后端 draft run
 *   2. 然后才能用拿到的 runId + 当前 nodeId 调用 useFileUpload.handleFiles
 *
 * 如果调用方在没有 runId 的情况下调用，本 composable 会 reject 并设置 lastError。
 *
 * 详见 spec §6 + 实测后端 controller
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { uploadImageForOCR, uploadFileForText } from '@/api/sop'

/** 支持的图片扩展名（小写，含点） */
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])
/** 支持的文档扩展名 */
const DOCUMENT_EXTS = new Set(['.pdf', '.txt', '.md', '.docx', '.doc', '.rtf'])

/** 图片大小上限（后端阿里百炼硬限 7MB） */
const IMAGE_MAX_BYTES = 7 * 1024 * 1024
/** 文档大小上限（后端 MaxFileSize 10MB） */
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

/** 获取小写扩展名（含点），如 "file.PDF" → ".pdf" */
function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  if (idx === -1) return ''
  return filename.slice(idx).toLowerCase()
}

/**
 * 分类文件类型
 */
function classifyFile(file: File): 'image' | 'document' | 'unsupported' {
  const ext = getExtension(file.name)
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (DOCUMENT_EXTS.has(ext)) return 'document'
  return 'unsupported'
}

/** 单个文件的上传状态 */
export interface UploadItem {
  /** 本地生成的临时 id，用于 UI 显示 */
  localId: string
  file: File
  /**
   * 文件分类。
   * - 'image' / 'document' 是可上传的有效类型
   * - 'unsupported' 表示扩展名不在白名单，item.status 必然为 'error'
   */
  kind: 'image' | 'document' | 'unsupported'
  status: 'pending' | 'uploading' | 'success' | 'error'
  /** 成功时的识别结果文本 */
  result?: string
  /** 错误信息 */
  error?: string
  /** 后端返回的 file_id（图片 OCR 会返回） */
  fileId?: number
}

export interface UseFileUploadReturn {
  /** 所有已处理文件的条目（含正在处理中的） */
  items: Ref<UploadItem[]>
  /** 用户手输内容（调用方双向绑定 textarea） */
  baseText: Ref<string>
  /** 是否有文件正在上传 */
  isUploading: ComputedRef<boolean>
  /** 最近一次错误信息（供调用方显示 toast） */
  lastError: Ref<string>
  /**
   * 处理一批文件（由 input[type=file] change 或 drop 事件触发）
   *
   * 必须已有 runId + nodeId。并发上传所有有效文件，任何文件失败不影响其他文件。
   */
  handleFiles: (files: File[] | FileList, runId: number, nodeId: number) => Promise<void>
  /** 移除某个已上传条目 */
  removeItem: (localId: string) => void
  /** 清空所有上传条目（切换步骤 / 新 run 时调用） */
  clearItems: () => void
  /**
   * 组合 baseText 和所有成功上传的结果，返回最终 textarea 应该展示的文本。
   */
  compose: () => string
}

/**
 * 生成本地临时 ID
 */
function makeLocalId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function useFileUpload(): UseFileUploadReturn {
  const items = ref<UploadItem[]>([])
  const baseText = ref<string>('')
  const lastError = ref<string>('')

  const isUploading = computed(() =>
    items.value.some((item) => item.status === 'uploading' || item.status === 'pending')
  )

  /**
   * 校验单个文件是否可接受。返回错误信息或 null（表示通过）。
   */
  function validate(file: File): { kind: 'image' | 'document' } | { error: string } {
    const kind = classifyFile(file)
    if (kind === 'unsupported') {
      return {
        error: `不支持的文件类型：${file.name}（仅支持图片 + pdf/txt/md/docx/doc/rtf）`
      }
    }
    const max = kind === 'image' ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES
    if (file.size > max) {
      const mb = (max / 1024 / 1024).toFixed(0)
      return { error: `${file.name} 超过 ${mb}MB 限制` }
    }
    if (file.size === 0) {
      return { error: `${file.name} 为空文件` }
    }
    return { kind }
  }

  async function uploadSingleFile(item: UploadItem, runId: number, nodeId: number): Promise<void> {
    item.status = 'uploading'
    try {
      if (item.kind === 'image') {
        const res = await uploadImageForOCR(item.file, runId, nodeId)
        item.result = res.content
        item.fileId = res.file_id
      } else {
        const text = await uploadFileForText(item.file, runId, nodeId)
        item.result = text
      }
      item.status = 'success'
    } catch (err) {
      item.status = 'error'
      item.error = (err as Error)?.message || '上传失败'
      lastError.value = `${item.file.name}: ${item.error}`
    }
  }

  async function handleFiles(
    files: File[] | FileList,
    runId: number,
    nodeId: number
  ): Promise<void> {
    lastError.value = ''
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    // 前置校验：必须已有 runId + nodeId
    if (!runId || !nodeId) {
      lastError.value = '请先进入节点后再上传文件'
      return
    }

    // 创建条目（校验失败的直接标 error）
    const newItems: UploadItem[] = []
    const validItems: UploadItem[] = []
    for (const file of fileArray) {
      const result = validate(file)
      if ('error' in result) {
        newItems.push({
          localId: makeLocalId(),
          file,
          kind: classifyFile(file), // 保留真实类型：image / document / unsupported
          status: 'error',
          error: result.error
        })
        if (!lastError.value) lastError.value = result.error
      } else {
        const item: UploadItem = {
          localId: makeLocalId(),
          file,
          kind: result.kind,
          status: 'pending'
        }
        newItems.push(item)
        validItems.push(item)
      }
    }

    // 一次性推入（避免 UI 中途闪烁）
    items.value = [...items.value, ...newItems]

    // 并发上传所有有效文件，互不阻塞。
    //
    // **关键**：uploadSingleFile 必须通过 items.value.find() 查找而非用 validItems 的
    // 原始引用。原因：items.value 是 ref<Array>，Vue 3 的深度响应式只代理通过 items.value
    // 读取的对象。validItems 中的是**原始 JS 对象**，直接 mutate 这些对象的 status
    // 属性 **不会触发** Vue 的 reactive effects，导致组件 DOM 不更新。
    //
    // 修复前：组件测试中 chip 永远停留在 'uploading' 状态，因为 status='success'/'error'
    // 的 mutation 发生在 raw object 上，proxy 看不到。
    const validLocalIds = validItems.map((i) => i.localId)
    await Promise.all(
      validLocalIds.map(async (localId) => {
        const proxyItem = items.value.find((i) => i.localId === localId)
        if (proxyItem) {
          await uploadSingleFile(proxyItem, runId, nodeId)
        }
      })
    )
  }

  function removeItem(localId: string): void {
    items.value = items.value.filter((item) => item.localId !== localId)
  }

  function clearItems(): void {
    items.value = []
    lastError.value = ''
  }

  /**
   * 组合 baseText 和所有成功上传的结果。
   *
   * 格式：baseText + 成功上传结果（按上传顺序），中间用双换行分隔。
   */
  function compose(): string {
    const parts: string[] = []
    if (baseText.value.trim()) {
      parts.push(baseText.value.trim())
    }
    for (const item of items.value) {
      if (item.status === 'success' && item.result) {
        parts.push(item.result.trim())
      }
    }
    return parts.join('\n\n')
  }

  return {
    items,
    baseText,
    isUploading,
    lastError,
    handleFiles,
    removeItem,
    clearItems,
    compose
  }
}
