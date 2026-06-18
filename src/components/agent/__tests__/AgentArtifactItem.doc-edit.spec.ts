import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// 控制 feature flag；保留真实 isEditable。
const flag = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/utils/editableArtifact', async (orig) => {
  const actual = await orig<typeof import('@/utils/editableArtifact')>()
  return { ...actual, isDocumentSystemEnabled: () => flag.enabled }
})

// 不真打开（store.open 会调 API）——spy 掉，只断言被正确调用。
vi.mock('@/api/documents', () => ({
  openDocument: vi.fn(),
  getDocument: vi.fn(),
  saveDocument: vi.fn(),
  exportDocument: vi.fn()
}))

import AgentArtifactItem from '../AgentArtifactItem.vue'
import { useDocumentsStore } from '@/stores/documents'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function mountItem(mime: string, filename: string) {
  return mount(AgentArtifactItem, {
    props: {
      artifact: { id: 1, filename, url: `https://x/agent-outputs/7/1-${filename}`, mime }
    },
    attachTo: document.body
  })
}

// 卡片交互模型（followup3）：卡片只有【下载】按钮 + 整卡可点。点击卡片 →
// 可编辑文档(docx/md/txt, flag 开)→打开编辑器(documentsStore.open)；
// HTML 及其余格式(pdf/xlsx/pptx/csv)→提示"暂不支持预览"，不开编辑器、不渲染 iframe。
const card = '[data-testid="artifact-card"]'

beforeEach(() => {
  setActivePinia(createPinia())
  flag.enabled = true
  vi.clearAllMocks()
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('AgentArtifactItem 点击卡片行为（编辑/预览/提示）', () => {
  it('flag 开 + 可编辑(docx) 点击卡片 → documentsStore.open（带 source_url/filename/mime）', async () => {
    const store = useDocumentsStore()
    const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
    const w = mountItem(DOCX, 'report.docx')
    await w.get(card).trigger('click')
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith({
      source_url: 'https://x/agent-outputs/7/1-report.docx',
      filename: 'report.docx',
      mime: DOCX
    })
    w.unmount()
  })

  it('flag 开 + 可编辑(md) 点击卡片 → 开编辑器', async () => {
    const store = useDocumentsStore()
    const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
    const w = mountItem('text/markdown', 'note.md')
    await w.get(card).trigger('click')
    expect(openSpy).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('flag 开 + 可编辑(txt) 点击卡片 → 开编辑器', async () => {
    const store = useDocumentsStore()
    const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
    const w = mountItem('text/plain', 'note.txt')
    await w.get(card).trigger('click')
    expect(openSpy).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('html 点击卡片 → 提示"暂不支持预览"，不开编辑器、不渲染 iframe（followup3）', async () => {
    const store = useDocumentsStore()
    const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
    const w = mountItem('text/html', 'page.html')
    await w.get(card).trigger('click')
    expect(openSpy).not.toHaveBeenCalled()
    expect(document.querySelector('iframe')).toBeNull()
    expect(w.text()).toContain('暂不支持预览')
    w.unmount()
  })

  it('flag 关 + docx 点击卡片 → 不开编辑器（提示不支持）', async () => {
    flag.enabled = false
    const store = useDocumentsStore()
    const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
    const w = mountItem(DOCX, 'report.docx')
    await w.get(card).trigger('click')
    expect(openSpy).not.toHaveBeenCalled()
    expect(w.text()).toContain('暂不支持预览')
    w.unmount()
  })

  it('非预览非编辑(pdf/xlsx/pptx/csv) 点击卡片 → 不开编辑器 + 提示', async () => {
    for (const [mime, name] of [
      ['application/pdf', 'a.pdf'],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx'],
      ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'a.pptx'],
      ['text/csv', 'data.csv']
    ]) {
      const store = useDocumentsStore()
      const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
      const w = mountItem(mime, name)
      await w.get(card).trigger('click')
      expect(openSpy, `${name} 不应开编辑器`).not.toHaveBeenCalled()
      expect(w.text(), `${name} 应提示不支持`).toContain('暂不支持预览')
      w.unmount()
      vi.clearAllMocks()
    }
  })

  it('下载按钮点击 → 不触发编辑/预览（stop 冒泡）', async () => {
    const store = useDocumentsStore()
    const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
    const w = mountItem(DOCX, 'report.docx')
    await w.get('[data-testid="artifact-download"]').trigger('click')
    expect(openSpy).not.toHaveBeenCalled()
    w.unmount()
  })
})
