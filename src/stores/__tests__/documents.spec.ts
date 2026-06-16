import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useDocumentsStore } from '../documents'
import type { DocumentDTO } from '@/types/document'

vi.mock('@/api/documents', () => ({
  openDocument: vi.fn(),
  getDocument: vi.fn(),
  saveDocument: vi.fn(),
  exportDocument: vi.fn()
}))

import { openDocument, saveDocument, exportDocument } from '@/api/documents'

const dto: DocumentDTO = {
  id: 5,
  title: 'r',
  content_md: '# x',
  source_object_key: 'agent-outputs/7/1-r.md',
  parse_method: 'direct',
  created_at: '',
  updated_at: ''
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('documents store', () => {
  it('open 成功设置 current', async () => {
    ;(openDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: dto
    })
    const s = useDocumentsStore()
    const r = await s.open({ source_url: 'u', filename: 'r.md', mime: 'text/markdown' })
    expect(r.id).toBe(5)
    expect(s.current?.content_md).toBe('# x')
    expect(s.loading).toBe(false)
    expect(s.error).toBeNull()
  })

  it('open 失败设置 error 并抛出', async () => {
    ;(openDocument as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('原文件已过期，无法打开')
    )
    const s = useDocumentsStore()
    await expect(s.open({ source_url: 'u', filename: 'r.md' })).rejects.toThrow()
    expect(s.error).toBe('原文件已过期，无法打开')
    expect(s.loading).toBe(false)
  })

  it('scheduleSave debounce 1.5s 后 flush', async () => {
    vi.useFakeTimers()
    ;(openDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: dto
    })
    ;(saveDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { id: 5, updated_at: '' }
    })
    const s = useDocumentsStore()
    await s.open({ source_url: 'u', filename: 'r.md', mime: 'text/markdown' })

    s.scheduleSave('# edited')
    expect(s.saveState).toBe('saving')
    expect(saveDocument).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1500)
    expect(saveDocument).toHaveBeenCalledWith(5, { content_md: '# edited' })
    expect(s.saveState).toBe('saved')
    expect(s.current?.content_md).toBe('# edited')
    vi.useRealTimers()
  })

  it('多次快速编辑只触发一次保存（debounce 合并）', async () => {
    vi.useFakeTimers()
    ;(openDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: dto
    })
    ;(saveDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { id: 5, updated_at: '' }
    })
    const s = useDocumentsStore()
    await s.open({ source_url: 'u', filename: 'r.md', mime: 'text/markdown' })

    s.scheduleSave('# a')
    s.scheduleSave('# b')
    s.scheduleSave('# c')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveDocument).toHaveBeenCalledTimes(1)
    expect(saveDocument).toHaveBeenCalledWith(5, { content_md: '# c' })
    vi.useRealTimers()
  })

  it('保存失败设置 saveState=error', async () => {
    vi.useFakeTimers()
    ;(openDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: dto
    })
    ;(saveDocument as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('保存失败'))
    const s = useDocumentsStore()
    await s.open({ source_url: 'u', filename: 'r.md', mime: 'text/markdown' })
    s.scheduleSave('# e')
    await vi.advanceTimersByTimeAsync(1500)
    expect(s.saveState).toBe('error')
    vi.useRealTimers()
  })

  it('exportAs 触发下载', async () => {
    ;(openDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: dto
    })
    ;(exportDocument as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['x'], { type: 'text/markdown' })
    )
    const s = useDocumentsStore()
    await s.open({ source_url: 'u', filename: 'r.md', mime: 'text/markdown' })

    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await s.exportAs('md')
    expect(exportDocument).toHaveBeenCalledWith(5, 'md')
    expect(clickSpy).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x') // 防内存泄漏
    clickSpy.mockRestore()
  })

  it('慢保存期间的编辑不丢失（lost-update 回归）', async () => {
    ;(openDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: dto
    })
    const s = useDocumentsStore()
    await s.open({ source_url: 'u', filename: 'r.md', mime: 'text/markdown' })

    vi.useFakeTimers()
    let resolveFirst!: (v: unknown) => void
    ;(saveDocument as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveFirst = res as (v: unknown) => void
          })
      )
      .mockResolvedValue({ code: 0, message: 'ok', data: { id: 5, updated_at: '' } })

    // 第一次保存 'A' 开始（慢），inflight
    s.scheduleSave('A')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveDocument).toHaveBeenCalledTimes(1)

    // 飞行期间编辑成 'B'
    s.scheduleSave('B')

    // 第一次（'A'）保存完成 → finally 检测到 pendingContent='B' → 重排
    resolveFirst({ code: 0, message: 'ok', data: { id: 5, updated_at: '' } })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1500)

    expect(saveDocument).toHaveBeenCalledTimes(2)
    expect(saveDocument).toHaveBeenLastCalledWith(5, { content_md: 'B' })
    expect(s.current?.content_md).toBe('B')
    vi.useRealTimers()
  })

  it('飞行期间切换文档：A 的保存完成不污染 B（身份守卫回归）', async () => {
    // 切换时 open() 会调 flushOnUnload()（keepalive fetch）——stub 掉避免 jsdom 报错。
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true }))
    )
    const docA: DocumentDTO = { ...dto, id: 5, content_md: 'A-orig' }
    const docB: DocumentDTO = { ...dto, id: 8, content_md: 'B-orig' }
    ;(openDocument as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ code: 0, message: 'ok', data: docA })
      .mockResolvedValueOnce({ code: 0, message: 'ok', data: docB })

    let resolveSaveA!: (v: unknown) => void
    ;(saveDocument as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveSaveA = res as (v: unknown) => void
        })
    )

    const s = useDocumentsStore()
    await s.open({ source_url: 'a', filename: 'A.md', mime: 'text/markdown' })

    // 编辑 A 并启动 flush（不 await：saveDocument 故意挂起，flush 停在 inflight）
    s.scheduleSave('A-edited')
    const flushP = s.flush()
    await Promise.resolve() // 让 flush 跑到 await saveDocument（inflight=true）
    expect(saveDocument).toHaveBeenCalledWith(5, { content_md: 'A-edited' })

    // 切换到 B（open 内部 flush 因 inflight 守卫 no-op；flushOnUnload keepalive 兜底 A）
    await s.open({ source_url: 'b', filename: 'B.md', mime: 'text/markdown' })
    expect(s.current?.id).toBe(8)

    // A 的慢保存现在完成 → 身份守卫必须阻止把 'A-edited' 写进 B
    resolveSaveA({ code: 0, message: 'ok', data: { id: 5, updated_at: '' } })
    await flushP

    expect(s.current?.id).toBe(8)
    expect(s.current?.content_md).toBe('B-orig') // 未被 A 污染
    vi.unstubAllGlobals()
  })

  it('open 用请求文件名（去扩展名）设 pendingTitle', async () => {
    ;(openDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: dto
    })
    const s = useDocumentsStore()
    const p = s.open({ source_url: 'u', filename: '本周工作小结.docx', mime: '' })
    // pendingTitle 在 open 解析期间即可用于面板标题（去扩展名）
    await p
    expect(s.pendingTitle).toBe('本周工作小结')
  })

  it('reset 清空状态', async () => {
    ;(openDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: dto
    })
    const s = useDocumentsStore()
    await s.open({ source_url: 'u', filename: 'r.md', mime: 'text/markdown' })
    s.reset()
    expect(s.current).toBeNull()
    expect(s.saveState).toBe('idle')
  })
})
