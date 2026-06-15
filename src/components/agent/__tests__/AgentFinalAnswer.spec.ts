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

  it('shows a download button in the enlarged preview', async () => {
    const markdown = '![测试图](https://example.com/test.png)'
    const wrapper = mount(AgentFinalAnswer, {
      props: {
        markdown
      },
      global: {
        stubs: {
          Teleport: true
        }
      }
    })

    await wrapper.find('.markdown-body img').trigger('click')
    // 放大预览里有一个独立的下载按钮
    expect(wrapper.find('.download-btn').exists()).toBe(true)
  })

  it('renders COS-generated image + docx as artifact cards, dropping them from the prose (#2a)', () => {
    const cosImg =
      'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/run1/chart.png?q-sign-time=1'
    const cosDocx =
      'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/run1/report.docx?q-sign-time=1'
    const markdown = `# 分析结论\n\n核心见下图。\n\n![趋势图](${cosImg})\n\n[下载报告](${cosDocx})`

    const wrapper = mount(AgentFinalAnswer, {
      props: { markdown },
      global: {
        stubs: {
          AgentImagePreview: true,
          // stub the artifact card so we can inspect its props directly
          AgentArtifactItem: {
            props: ['artifact'],
            template:
              '<div class="stub-artifact" :data-mime="artifact.mime">{{ artifact.filename }}</div>'
          }
        }
      }
    })

    // two artifact cards, in document order
    const cards = wrapper.findAll('.stub-artifact')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toBe('chart.png')
    expect(cards[0].attributes('data-mime')).toBe('image/png')
    expect(cards[1].text()).toBe('report.docx')
    expect(cards[1].attributes('data-mime')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    // prose keeps the heading/body but the original COS nodes are gone
    const body = wrapper.find('.markdown-body')
    expect(body.html()).toContain('分析结论')
    expect(body.html()).toContain('核心见下图')
    expect(body.html()).not.toContain('agent-outputs/run1/chart.png')
    expect(body.html()).not.toContain('agent-outputs/run1/report.docx')
    // no inline COS <img> in the markdown body — it became a card instead
    expect(body.find('img').exists()).toBe(false)
  })

  it('renders rich markdown structure (headings/list/blockquote/hr) without breaking (#3)', () => {
    const markdown = [
      '# 一级标题',
      '## 二级标题',
      '正文 **加粗** 段落。',
      '',
      '- 列表项一',
      '- 列表项二',
      '',
      '> 引用块内容',
      '',
      '---',
      '',
      '结尾段落。'
    ].join('\n')

    const wrapper = mount(AgentFinalAnswer, {
      props: { markdown },
      global: { stubs: { AgentImagePreview: true } }
    })

    const body = wrapper.find('.markdown-body')
    expect(body.exists()).toBe(true)
    // structure survives the render pipeline (the polish is CSS-only, so the DOM
    // shape must be intact for the styling to land)
    expect(body.find('h1').exists()).toBe(true)
    expect(body.find('h2').exists()).toBe(true)
    expect(body.find('strong').exists()).toBe(true)
    expect(body.findAll('li')).toHaveLength(2)
    expect(body.find('blockquote').exists()).toBe(true)
    // hr renders (previously display:none — P1-B made it a real divider)
    expect(body.find('hr').exists()).toBe(true)
  })
})
