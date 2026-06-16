import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ReplayInputCard from '../ReplayInputCard.vue'
import type { SopReplayFile } from '@/views/sop/types'

const docFile: SopReplayFile = {
  id: 1,
  file_name: '产品手册.pdf',
  file_url: 'https://cos.example.com/old/x.pdf?sig=abc',
  file_type: 'application/pdf',
  file_size: 1024,
  file_ext: '.pdf',
  content: '系统抽取的文本预览内容'
}

const imgFile: SopReplayFile = {
  id: 2,
  file_name: '封面.png',
  file_url: 'https://cos.example.com/old/x.png?sig=abc',
  file_type: 'image/png',
  file_size: 512,
  file_ext: '.png'
}

const stubs = { Teleport: true }

describe('ReplayInputCard 上传素材交互（回看）', () => {
  afterEach(() => vi.restoreAllMocks())

  // Rule 11 复现：客户报告「点击上传素材打开新标签显示报错（历史 COS 对象已回收 404）」。
  // 旧行为 = 文档卡是 <button @click=openFile> 调 window.open；本测试断言"不再开新标签"，
  // 在修复前必 FAIL（open 被调 + tagName=BUTTON），修复后 PASS。
  it('点击文档卡不再打开新标签（不调用 window.open，且非可点击 button）', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const w = mount(ReplayInputCard, {
      props: { input: '帮我看这份文件', files: [docFile] },
      global: { stubs }
    })
    const main = w.find('.replay-input__doc-main')
    expect(main.exists()).toBe(true)
    await main.trigger('click')
    expect(openSpy).not.toHaveBeenCalled()
    expect(main.element.tagName).not.toBe('BUTTON')
  })

  it('文档「查看提取文本」展开按钮保留可用（内嵌预览，不依赖 COS）', async () => {
    const w = mount(ReplayInputCard, {
      props: { input: '帮我看这份文件', files: [docFile] },
      global: { stubs }
    })
    expect(w.find('.replay-input__doc-content').exists()).toBe(false)
    const expandBtn = w.find('.replay-input__doc-expand')
    expect(expandBtn.exists()).toBe(true)
    await expandBtn.trigger('click')
    const content = w.find('.replay-input__doc-content')
    expect(content.exists()).toBe(true)
    expect(content.text()).toContain('系统抽取的文本预览内容')
  })

  it('图片缩略图点击仍在页面内放大（AgentImagePreview overlay 出现，不开新标签）', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const w = mount(ReplayInputCard, {
      props: { input: '看图', files: [imgFile] },
      global: { stubs }
    })
    expect(w.find('.image-preview-overlay').exists()).toBe(false)
    const thumb = w.find('.replay-input__thumb')
    expect(thumb.exists()).toBe(true)
    await thumb.trigger('click')
    expect(w.find('.image-preview-overlay').exists()).toBe(true)
    expect(openSpy).not.toHaveBeenCalled()
  })
})
