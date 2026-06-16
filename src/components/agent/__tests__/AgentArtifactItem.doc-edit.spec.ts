import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 控制 feature flag；保留真实 isEditable。
const flag = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/utils/editableArtifact', async (orig) => {
  const actual = await orig<typeof import('@/utils/editableArtifact')>()
  return { ...actual, isDocumentSystemEnabled: () => flag.enabled }
})

import AgentArtifactItem from '../AgentArtifactItem.vue'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function mountItem(mime: string, filename: string) {
  return mount(AgentArtifactItem, {
    props: {
      artifact: { id: 1, filename, url: `https://x/agent-outputs/7/1-${filename}`, mime }
    },
    global: {
      // 懒加载模态 stub 掉，避免拉入 Milkdown 重依赖
      stubs: { DocumentEditorModal: { template: '<div class="dem-stub" />' } }
    }
  })
}

const editBtn = '[data-testid="doc-edit-btn"]'

beforeEach(() => {
  flag.enabled = true
})

describe('AgentArtifactItem 打开编辑入口（AC1）', () => {
  it('flag 开 + 文本类(docx) → 显示打开编辑', () => {
    expect(mountItem(DOCX, 'report.docx').find(editBtn).exists()).toBe(true)
  })

  it('flag 开 + 文本类(md) → 显示', () => {
    expect(mountItem('text/markdown', 'note.md').find(editBtn).exists()).toBe(true)
  })

  it('flag 开 + 文本类(txt) → 显示', () => {
    expect(mountItem('text/plain', 'note.txt').find(editBtn).exists()).toBe(true)
  })

  it('flag 开 + 文本类(html, 走 isHtml 分支) → 显示', () => {
    expect(mountItem('text/html', 'page.html').find(editBtn).exists()).toBe(true)
  })

  it('flag 开 + 非文本类(xlsx) → 不显示', () => {
    expect(
      mountItem('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx')
        .find(editBtn)
        .exists()
    ).toBe(false)
  })

  it('flag 开 + 非文本类(pptx) → 不显示', () => {
    expect(
      mountItem(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'a.pptx'
      )
        .find(editBtn)
        .exists()
    ).toBe(false)
  })

  it('flag 开 + 非文本类(csv) → 不显示', () => {
    expect(mountItem('text/csv', 'data.csv').find(editBtn).exists()).toBe(false)
  })

  it('flag 开 + 非文本类(png) → 不显示', () => {
    expect(mountItem('image/png', 'chart.png').find(editBtn).exists()).toBe(false)
  })

  it('flag 开 + 非文本类(pdf) → 不显示', () => {
    expect(mountItem('application/pdf', 'a.pdf').find(editBtn).exists()).toBe(false)
  })

  it('flag 关 + 文本类 → 不显示（休眠隔离）', () => {
    flag.enabled = false
    expect(mountItem(DOCX, 'report.docx').find(editBtn).exists()).toBe(false)
  })

  it('点击打开编辑 → 渲染编辑器模态', async () => {
    const w = mountItem(DOCX, 'report.docx')
    expect(w.find('.dem-stub').exists()).toBe(false)
    await w.find(editBtn).trigger('click')
    await flushPromises()
    expect(w.find('.dem-stub').exists()).toBe(true)
  })
})
