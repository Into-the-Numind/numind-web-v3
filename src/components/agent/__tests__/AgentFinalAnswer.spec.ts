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

  it('renders COS image + docx as in-place artifact cards between the prose segments (#1/#4)', () => {
    const cosImg =
      'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/run1/chart.png?q-sign-time=1'
    const cosDocx =
      'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/run1/report.docx?q-sign-time=1'
    // intro prose → COS image → middle prose → COS docx → outro prose
    const markdown = `# 分析结论\n\n核心见下图。\n\n![趋势图](${cosImg})\n\n中间说明。\n\n[下载报告](${cosDocx})\n\n结尾。`

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
    // #2: display name is the markdown alt / link text, not the COS object-key tail.
    expect(cards[0].text()).toBe('趋势图')
    expect(cards[0].attributes('data-mime')).toBe('image/png')
    expect(cards[1].text()).toBe('下载报告')
    expect(cards[1].attributes('data-mime')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    // The segments render in place: prose → card → prose → card → prose. Walk the
    // rendered children of .final-answer and assert the cards sit BETWEEN the
    // prose blocks (not all bunched at the end).
    const fa = wrapper.find('.final-answer').element
    const segmentEls = Array.from(fa.children).filter(
      (el) => el.classList.contains('markdown-body') || el.classList.contains('stub-artifact')
    )
    const kinds = segmentEls.map((el) =>
      el.classList.contains('stub-artifact') ? 'artifact' : 'prose'
    )
    expect(kinds).toEqual(['prose', 'artifact', 'prose', 'artifact', 'prose'])

    // No prose segment leaks a raw COS url, and no inline COS <img> survives.
    const proseHtml = wrapper
      .findAll('.markdown-body')
      .map((b) => b.html())
      .join('')
    expect(proseHtml).toContain('分析结论')
    expect(proseHtml).toContain('核心见下图')
    expect(proseHtml).toContain('中间说明')
    expect(proseHtml).not.toContain('agent-outputs/run1/chart.png')
    expect(proseHtml).not.toContain('agent-outputs/run1/report.docx')
    expect(wrapper.find('.markdown-body img').exists()).toBe(false)
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

  it('multiple consecutive COS images render as one responsive grid, not separate cards (#3 M1)', () => {
    const cos = (n: string) =>
      `https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/run1/${n}.png?q-sign-time=1`
    // three images back-to-back (blank lines only between them)
    const markdown = `配图如下：\n\n![图一](${cos('a')})\n\n![图二](${cos('b')})\n\n![图三](${cos('c')})`

    const wrapper = mount(AgentFinalAnswer, {
      props: { markdown },
      global: { stubs: { AgentImagePreview: true } }
    })

    // one grid container holding all three images; no separate artifact cards
    const grid = wrapper.find('.image-grid')
    expect(grid.exists()).toBe(true)
    expect(grid.findAll('.image-grid__img')).toHaveLength(3)
    expect(grid.findAll('figure.image-grid__cell')).toHaveLength(3)
  })

  it('a single COS image stays a single S2 artifact card, not a grid (#3)', () => {
    const cosImg =
      'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/run1/only.png?q-sign-time=1'
    const markdown = `仅一张图：\n\n![唯一图](${cosImg})`

    const wrapper = mount(AgentFinalAnswer, {
      props: { markdown },
      global: {
        stubs: {
          AgentImagePreview: true,
          AgentArtifactItem: { props: ['artifact'], template: '<div class="stub-artifact" />' }
        }
      }
    })

    expect(wrapper.find('.image-grid').exists()).toBe(false)
    expect(wrapper.findAll('.stub-artifact')).toHaveLength(1)
  })
})
