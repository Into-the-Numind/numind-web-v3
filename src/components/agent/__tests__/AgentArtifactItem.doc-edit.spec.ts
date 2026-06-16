import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    }
  })
}

// 编辑器是页面级右侧面板（AgentChatView 第三栏）。卡片不再有独立编辑按钮，
// 而是整张可点击：canEdit 时打 data-testid="doc-open-card" + 类 file-row--clickable。
const openCard = '[data-testid="doc-open-card"]'

beforeEach(() => {
  setActivePinia(createPinia())
  flag.enabled = true
  vi.clearAllMocks()
})

describe('AgentArtifactItem 打开编辑入口（AC1）', () => {
  it('flag 开 + 文本类(docx) → 卡片可点击打开', () => {
    expect(mountItem(DOCX, 'report.docx').find(openCard).exists()).toBe(true)
  })

  it('flag 开 + 文本类(md) → 可点击', () => {
    expect(mountItem('text/markdown', 'note.md').find(openCard).exists()).toBe(true)
  })

  it('flag 开 + 文本类(txt) → 可点击', () => {
    expect(mountItem('text/plain', 'note.txt').find(openCard).exists()).toBe(true)
  })

  it('flag 开 + 文本类(html, 走 isHtml 分支) → 可点击', () => {
    expect(mountItem('text/html', 'page.html').find(openCard).exists()).toBe(true)
  })

  it('flag 开 + 非文本类(xlsx) → 不可点击', () => {
    expect(
      mountItem('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx')
        .find(openCard)
        .exists()
    ).toBe(false)
  })

  it('flag 开 + 非文本类(pptx) → 不可点击', () => {
    expect(
      mountItem(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'a.pptx'
      )
        .find(openCard)
        .exists()
    ).toBe(false)
  })

  it('flag 开 + 非文本类(csv) → 不可点击', () => {
    expect(mountItem('text/csv', 'data.csv').find(openCard).exists()).toBe(false)
  })

  it('flag 开 + 非文本类(png) → 不可点击', () => {
    expect(mountItem('image/png', 'chart.png').find(openCard).exists()).toBe(false)
  })

  it('flag 开 + 非文本类(pdf) → 不可点击', () => {
    expect(mountItem('application/pdf', 'a.pdf').find(openCard).exists()).toBe(false)
  })

  it('flag 关 + 文本类 → 不可点击（休眠隔离）', () => {
    flag.enabled = false
    expect(mountItem(DOCX, 'report.docx').find(openCard).exists()).toBe(false)
  })

  it('点击卡片 → 调用 documentsStore.open（带 source_url/filename/mime）', async () => {
    const store = useDocumentsStore()
    const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
    const w = mountItem(DOCX, 'report.docx')
    await w.find(openCard).trigger('click')
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith({
      source_url: 'https://x/agent-outputs/7/1-report.docx',
      filename: 'report.docx',
      mime: DOCX
    })
  })

  it('非文本类卡片点击 → 不触发 open', async () => {
    const store = useDocumentsStore()
    const openSpy = vi.spyOn(store, 'open').mockResolvedValue({} as never)
    const w = mountItem('application/pdf', 'a.pdf')
    // pdf 卡片仍可点（下载/预览按钮），但不应触发 open
    await w.find('.file-row').trigger('click')
    expect(openSpy).not.toHaveBeenCalled()
  })
})
