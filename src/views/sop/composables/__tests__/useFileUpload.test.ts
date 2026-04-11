/**
 * useFileUpload 单元测试（16 用例，分 3 组）
 *
 * 基础行为 (8)：
 *   - 图片走 OCR API / 文档走 PDF API
 *   - 不支持扩展名 / 超限 / 空文件 / 缺 runId / 缺 nodeId 拒绝
 *
 * 并发和失败处理 (3)：
 *   - API 失败不影响其他文件 / 两个成功 / 混合类型
 *
 * UI state 和 compose (5)：
 *   - compose 拼接 baseText + 成功结果 / 跳过失败 / 空 baseText /
 *     removeItem / clearItems / 多实例独立
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @/api/sop 模块
vi.mock('@/api/sop', () => ({
  uploadImageForOCR: vi.fn(),
  uploadFileForText: vi.fn()
}))

import { useFileUpload } from '../useFileUpload'
import { uploadImageForOCR, uploadFileForText } from '@/api/sop'

const uploadImageForOCRMock = uploadImageForOCR as unknown as ReturnType<typeof vi.fn>
const uploadFileForTextMock = uploadFileForText as unknown as ReturnType<typeof vi.fn>

/**
 * 构造一个 fake File 对象，可控制 size/name/type
 */
function makeFile(name: string, sizeBytes: number, content: string = 'x'): File {
  // 用指定长度的内容构造 Blob，然后包成 File
  // JSDOM 的 File 支持 size 根据 Blob 内容自动计算
  const blob = new Blob([content.repeat(sizeBytes)], { type: 'application/octet-stream' })
  return new File([blob], name)
}

beforeEach(() => {
  uploadImageForOCRMock.mockReset()
  uploadFileForTextMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useFileUpload — 基础行为', () => {
  it('图片文件走 OCR API，成功后 item.status=success', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: '识别出的文字', file_id: 123 })

    const up = useFileUpload()
    const file = makeFile('photo.jpg', 1024)
    await up.handleFiles([file], 100, 5)

    expect(uploadImageForOCRMock).toHaveBeenCalledTimes(1)
    expect(uploadImageForOCRMock).toHaveBeenCalledWith(file, 100, 5)
    expect(up.items.value.length).toBe(1)
    expect(up.items.value[0].status).toBe('success')
    expect(up.items.value[0].result).toBe('识别出的文字')
    expect(up.items.value[0].fileId).toBe(123)
    expect(up.items.value[0].kind).toBe('image')
  })

  it('文档文件走 PDF API，成功后 item.status=success', async () => {
    uploadFileForTextMock.mockResolvedValue('PDF 提取的文本内容')

    const up = useFileUpload()
    const file = makeFile('doc.pdf', 2048)
    await up.handleFiles([file], 100, 5)

    expect(uploadFileForTextMock).toHaveBeenCalledTimes(1)
    expect(uploadFileForTextMock).toHaveBeenCalledWith(file, 100, 5)
    expect(up.items.value[0].status).toBe('success')
    expect(up.items.value[0].result).toBe('PDF 提取的文本内容')
    expect(up.items.value[0].kind).toBe('document')
  })

  it('不支持的扩展名被拒绝（状态 error，不调 API）', async () => {
    const up = useFileUpload()
    const file = makeFile('archive.zip', 1024)
    await up.handleFiles([file], 100, 5)

    expect(uploadImageForOCRMock).not.toHaveBeenCalled()
    expect(uploadFileForTextMock).not.toHaveBeenCalled()
    expect(up.items.value[0].status).toBe('error')
    expect(up.items.value[0].error).toContain('不支持的文件类型')
    expect(up.lastError.value).toContain('不支持的文件类型')
  })

  it('图片超过 7MB 被拒绝', async () => {
    const up = useFileUpload()
    // 构造一个 8MB 图片
    const file = new File([new Blob([new Uint8Array(8 * 1024 * 1024)])], 'big.jpg')
    await up.handleFiles([file], 100, 5)

    expect(uploadImageForOCRMock).not.toHaveBeenCalled()
    expect(up.items.value[0].status).toBe('error')
    expect(up.items.value[0].error).toContain('7MB')
  })

  it('文档超过 10MB 被拒绝', async () => {
    const up = useFileUpload()
    const file = new File([new Blob([new Uint8Array(11 * 1024 * 1024)])], 'big.pdf')
    await up.handleFiles([file], 100, 5)

    expect(uploadFileForTextMock).not.toHaveBeenCalled()
    expect(up.items.value[0].status).toBe('error')
    expect(up.items.value[0].error).toContain('10MB')
  })

  it('空文件被拒绝', async () => {
    const up = useFileUpload()
    const file = new File([], 'empty.pdf')
    await up.handleFiles([file], 100, 5)

    expect(uploadFileForTextMock).not.toHaveBeenCalled()
    expect(up.items.value[0].status).toBe('error')
    expect(up.items.value[0].error).toContain('为空')
  })

  it('缺少 runId 时拒绝上传', async () => {
    const up = useFileUpload()
    const file = makeFile('photo.jpg', 1024)
    await up.handleFiles([file], 0, 5)

    expect(uploadImageForOCRMock).not.toHaveBeenCalled()
    expect(up.lastError.value).toContain('请先进入节点')
    expect(up.items.value.length).toBe(0)
  })

  it('缺少 nodeId 时拒绝上传', async () => {
    const up = useFileUpload()
    const file = makeFile('photo.jpg', 1024)
    await up.handleFiles([file], 100, 0)

    expect(uploadImageForOCRMock).not.toHaveBeenCalled()
    expect(up.lastError.value).toContain('请先进入节点')
  })
})

describe('useFileUpload — 并发和失败处理', () => {
  it('API 失败时 item.status=error，不影响其他文件', async () => {
    uploadImageForOCRMock.mockImplementation(async (file: File) => {
      if (file.name === 'bad.jpg') throw new Error('OCR 服务错误')
      return { content: `good-${file.name}` }
    })

    const up = useFileUpload()
    const goodFile = makeFile('good.jpg', 1024)
    const badFile = makeFile('bad.jpg', 1024)
    await up.handleFiles([goodFile, badFile], 100, 5)

    expect(up.items.value.length).toBe(2)
    const good = up.items.value.find((i) => i.file.name === 'good.jpg')
    const bad = up.items.value.find((i) => i.file.name === 'bad.jpg')
    expect(good?.status).toBe('success')
    expect(good?.result).toBe('good-good.jpg')
    expect(bad?.status).toBe('error')
    expect(bad?.error).toContain('OCR 服务错误')
  })

  it('并发上传两个文件都成功', async () => {
    uploadImageForOCRMock.mockImplementation(async (file: File) => ({
      content: `result-${file.name}`
    }))

    const up = useFileUpload()
    await up.handleFiles([makeFile('a.jpg', 1024), makeFile('b.png', 1024)], 100, 5)

    expect(up.items.value.filter((i) => i.status === 'success').length).toBe(2)
    expect(uploadImageForOCRMock).toHaveBeenCalledTimes(2)
  })

  it('混合图片 + 文档 + 不支持类型', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'image-result' })
    uploadFileForTextMock.mockResolvedValue('pdf-result')

    const up = useFileUpload()
    await up.handleFiles(
      [
        makeFile('a.jpg', 1024),
        makeFile('b.pdf', 1024),
        makeFile('c.zip', 1024) // 不支持
      ],
      100,
      5
    )

    expect(up.items.value.length).toBe(3)
    expect(up.items.value[0].status).toBe('success') // jpg
    expect(up.items.value[1].status).toBe('success') // pdf
    expect(up.items.value[2].status).toBe('error') // zip
    expect(uploadImageForOCRMock).toHaveBeenCalledTimes(1)
    expect(uploadFileForTextMock).toHaveBeenCalledTimes(1)
  })
})

describe('useFileUpload — UI state 和 compose', () => {
  it('compose 拼接 baseText + 成功的结果', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: '图片识别文字' })
    uploadFileForTextMock.mockResolvedValue('文档内容')

    const up = useFileUpload()
    up.baseText.value = '用户手输的内容'
    await up.handleFiles([makeFile('img.jpg', 1024), makeFile('doc.pdf', 1024)], 100, 5)

    const composed = up.compose()
    expect(composed).toContain('用户手输的内容')
    expect(composed).toContain('图片识别文字')
    expect(composed).toContain('文档内容')
    // 顺序：baseText 在前，然后按上传顺序
    expect(composed.indexOf('用户手输的内容')).toBeLessThan(composed.indexOf('图片识别文字'))
    expect(composed.indexOf('图片识别文字')).toBeLessThan(composed.indexOf('文档内容'))
  })

  it('compose 跳过失败的 item', async () => {
    uploadImageForOCRMock.mockImplementation(async (file: File) => {
      if (file.name === 'bad.jpg') throw new Error('fail')
      return { content: `ok-${file.name}` }
    })

    const up = useFileUpload()
    up.baseText.value = 'text'
    await up.handleFiles([makeFile('good.jpg', 1024), makeFile('bad.jpg', 1024)], 100, 5)

    const composed = up.compose()
    expect(composed).toContain('ok-good.jpg')
    expect(composed).not.toContain('bad.jpg')
  })

  it('compose 空 baseText 不影响输出', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'content' })
    const up = useFileUpload()
    await up.handleFiles([makeFile('a.jpg', 1024)], 100, 5)
    expect(up.compose()).toBe('content')
  })

  it('removeItem 移除指定 localId', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'ok' })
    const up = useFileUpload()
    await up.handleFiles([makeFile('a.jpg', 1024), makeFile('b.jpg', 1024)], 100, 5)

    const firstId = up.items.value[0].localId
    up.removeItem(firstId)
    expect(up.items.value.length).toBe(1)
    expect(up.items.value[0].file.name).toBe('b.jpg')
  })

  it('clearItems 清空所有条目 + lastError', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'ok' })
    const up = useFileUpload()
    await up.handleFiles([makeFile('a.jpg', 1024)], 100, 5)
    up.lastError.value = 'some error'
    up.clearItems()
    expect(up.items.value.length).toBe(0)
    expect(up.lastError.value).toBe('')
  })

  it('多实例状态独立', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'ok' })
    const up1 = useFileUpload()
    const up2 = useFileUpload()
    await up1.handleFiles([makeFile('a.jpg', 1024)], 100, 5)
    expect(up1.items.value.length).toBe(1)
    expect(up2.items.value.length).toBe(0) // 独立
  })
})
