import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import AgentFinalAnswer from '../AgentFinalAnswer.vue'

describe('AgentFinalAnswer', () => {
  it('renders markdown successfully and displays images', () => {
    const markdown = '这是一个测试图片：\n![测试图](https://example.com/test.png)'
    const wrapper = mount(AgentFinalAnswer, {
      props: {
        markdown,
        runId: 1
      },
      global: {
        stubs: {
          AgentFeedbackBar: true,
          Teleport: true
        }
      }
    })

    // 验证 Markdown 被渲染为 HTML，并且包含了 <img>
    const img = wrapper.find('.markdown-body img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://example.com/test.png')
  })

  it('triggers preview popup when clicking an image', async () => {
    const markdown = '![测试图](https://example.com/test.png)'
    const wrapper = mount(AgentFinalAnswer, {
      props: {
        markdown
      },
      global: {
        stubs: {
          AgentFeedbackBar: true,
          Teleport: true
        }
      }
    })

    // 点击图片
    const img = wrapper.find('.markdown-body img')
    await img.trigger('click')

    // 验证大图预览模态框已被唤起
    const overlay = wrapper.find('.image-preview-overlay')
    expect(overlay.exists()).toBe(true)

    const previewImg = wrapper.find('.preview-img')
    expect(previewImg.exists()).toBe(true)
    expect(previewImg.attributes('src')).toBe('https://example.com/test.png')
  })

  it('closes preview popup when clicking close button or overlay', async () => {
    const markdown = '![测试图](https://example.com/test.png)'
    const wrapper = mount(AgentFinalAnswer, {
      props: {
        markdown
      },
      global: {
        stubs: {
          AgentFeedbackBar: true,
          Teleport: true
        }
      }
    })

    // 1. 打开预览
    const img = wrapper.find('.markdown-body img')
    await img.trigger('click')
    expect(wrapper.find('.image-preview-overlay').exists()).toBe(true)

    // 2. 点击关闭按钮
    const closeBtn = wrapper.find('.close-btn')
    await closeBtn.trigger('click')
    expect(wrapper.find('.image-preview-overlay').exists()).toBe(false)
  })
})
