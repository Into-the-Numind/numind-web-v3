/**
 * StepOutput 组件单元测试
 *
 * 覆盖：
 *
 * 空状态 (2)：
 *   1. 无 thinking / 无 content / 非 streaming → 显示 empty hint
 *   2. 自定义 emptyHint
 *
 * Content 渲染 (4)：
 *   3. content 非空 → 渲染 Markdown 到 prose 区
 *   4. content 是 Markdown 格式 → 被 renderMarkdown 处理为 HTML
 *   5. XSS 向量被 DOMPurify 清洗
 *   6. null content 视为空
 *
 * Thinking 折叠面板 (5)：
 *   7. thinking 空时不渲染面板
 *   8. thinking 非空时渲染面板
 *   9. 非 streaming 时默认折叠
 *  10. streaming 时默认展开
 *  11. 点击 header 切换折叠
 *
 * Streaming 状态 (3)：
 *  12. streaming=true 且无 content 时显示光标占位
 *  13. streaming=true 且有 content 时正常渲染内容（无占位）
 *  14. streaming true→false 时思维链自动折叠
 *
 * ScrollFollow 集成 (2)：
 *  15. 组件暴露 scrollFollow 和 scrollContainerRef
 *  16. content 变化触发 checkAndScroll（通过 spy 验证）
 *
 * ARIA (2)：
 *  17. thinking header 的 aria-expanded 跟随折叠状态
 *  18. empty state / streaming 占位 的语义
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import StepOutput from '../StepOutput.vue'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('StepOutput — 空状态', () => {
  it('无 thinking / content / 非 streaming 时显示 emptyHint 默认文案', () => {
    const wrapper = mount(StepOutput, { props: {} })
    expect(wrapper.find('.step-output-empty').exists()).toBe(true)
    expect(wrapper.find('.step-output-empty').text()).toBe('等待执行…')
  })

  it('支持自定义 emptyHint', () => {
    const wrapper = mount(StepOutput, {
      props: { emptyHint: '请先输入内容并点击下一步' }
    })
    expect(wrapper.find('.step-output-empty').text()).toBe('请先输入内容并点击下一步')
  })
})

describe('StepOutput — Content 渲染', () => {
  it('content 非空时渲染 Markdown 到 prose 区', () => {
    const wrapper = mount(StepOutput, {
      props: { content: 'Hello World' }
    })
    const contentDiv = wrapper.find('.step-output-content')
    expect(contentDiv.exists()).toBe(true)
    expect(contentDiv.html()).toContain('Hello World')
    expect(contentDiv.classes()).toContain('prose')
  })

  it('content Markdown 格式被渲染为 HTML', () => {
    const wrapper = mount(StepOutput, {
      props: { content: '# Title\n**bold**' }
    })
    const html = wrapper.find('.step-output-content').html()
    expect(html).toContain('<h1>')
    expect(html).toContain('<strong>')
  })

  it('XSS 向量被 DOMPurify 清洗', () => {
    const wrapper = mount(StepOutput, {
      props: { content: '<script>alert(1)</script>Hello' }
    })
    const html = wrapper.find('.step-output-content').html()
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert(1)')
    expect(html).toContain('Hello')
  })

  it('null content 视为空', () => {
    const wrapper = mount(StepOutput, {
      props: { content: null }
    })
    expect(wrapper.find('.step-output-content').exists()).toBe(false)
    expect(wrapper.find('.step-output-empty').exists()).toBe(true)
  })
})

describe('StepOutput — Thinking 折叠面板', () => {
  it('thinking 空时不渲染面板', () => {
    const wrapper = mount(StepOutput, {
      props: { content: '有内容' }
    })
    expect(wrapper.find('.step-output-thinking').exists()).toBe(false)
  })

  it('thinking 非空时渲染面板', () => {
    const wrapper = mount(StepOutput, {
      props: { thinking: '思考过程...', content: '结果' }
    })
    expect(wrapper.find('.step-output-thinking').exists()).toBe(true)
    expect(wrapper.find('.step-output-thinking-title').exists()).toBe(true)
  })

  it('非 streaming 时默认折叠（显示"思考过程"标题）', () => {
    const wrapper = mount(StepOutput, {
      props: { thinking: '思考', streaming: false }
    })
    expect(wrapper.find('.step-output-thinking').classes()).toContain('is-collapsed')
    expect(wrapper.find('.step-output-thinking-title').text()).toBe('思考过程')
    // 折叠时 v-show 隐藏内容
    const contentEl = wrapper.find('.step-output-thinking-content')
    expect((contentEl.element as HTMLElement).style.display).toBe('none')
  })

  it('streaming 时默认展开（显示"思考中…"）', () => {
    const wrapper = mount(StepOutput, {
      props: { thinking: '思考', streaming: true }
    })
    expect(wrapper.find('.step-output-thinking').classes()).not.toContain('is-collapsed')
    expect(wrapper.find('.step-output-thinking-title').text()).toBe('思考中…')
  })

  it('点击 header 切换折叠状态', async () => {
    const wrapper = mount(StepOutput, {
      props: { thinking: '思考', streaming: false }
    })
    // 初始折叠
    expect(wrapper.find('.step-output-thinking').classes()).toContain('is-collapsed')

    // 点击展开
    await wrapper.find('.step-output-thinking-header').trigger('click')
    expect(wrapper.find('.step-output-thinking').classes()).not.toContain('is-collapsed')

    // 再次点击折叠
    await wrapper.find('.step-output-thinking-header').trigger('click')
    expect(wrapper.find('.step-output-thinking').classes()).toContain('is-collapsed')
  })
})

describe('StepOutput — Streaming 状态', () => {
  it('streaming=true 且无 content 时显示光标占位', () => {
    const wrapper = mount(StepOutput, {
      props: { streaming: true, content: '' }
    })
    expect(wrapper.find('.step-output-streaming-placeholder').exists()).toBe(true)
    expect(wrapper.find('.step-output-cursor').exists()).toBe(true)
  })

  it('streaming=true 且有 content 时显示内容（无占位）', () => {
    const wrapper = mount(StepOutput, {
      props: { streaming: true, content: '已生成部分内容' }
    })
    expect(wrapper.find('.step-output-streaming-placeholder').exists()).toBe(false)
    expect(wrapper.find('.step-output-content').html()).toContain('已生成部分内容')
  })

  it('streaming true→false 时思维链自动折叠', async () => {
    const wrapper = mount(StepOutput, {
      props: { thinking: '思考', streaming: true }
    })
    expect(wrapper.find('.step-output-thinking').classes()).not.toContain('is-collapsed')

    // 流式结束
    await wrapper.setProps({ streaming: false })
    expect(wrapper.find('.step-output-thinking').classes()).toContain('is-collapsed')
  })
})

describe('StepOutput — ScrollFollow 集成', () => {
  it('组件 mount 后暴露 scrollFollow 和 scrollContainerRef', () => {
    const wrapper = mount(StepOutput, {
      props: { content: '内容' }
    })
    const exposed = wrapper.vm as unknown as {
      scrollFollow: { isInterrupted: { value: boolean } }
      scrollContainerRef: { value: HTMLDivElement | null }
    }
    expect(exposed.scrollFollow).toBeDefined()
    expect(exposed.scrollFollow.isInterrupted.value).toBe(false)
    expect(exposed.scrollContainerRef).toBeDefined()
  })

  it('content 变化触发 checkAndScroll（通过 scrollTop 变化验证）', async () => {
    const wrapper = mount(StepOutput, {
      props: { content: '初始内容' },
      attachTo: document.body
    })

    // 模拟一个可滚动的容器
    const scrollEl = wrapper.find('.step-output-scroll').element as HTMLElement
    Object.defineProperty(scrollEl, 'scrollHeight', {
      value: 2000,
      writable: true,
      configurable: true
    })
    Object.defineProperty(scrollEl, 'clientHeight', {
      value: 500,
      writable: true,
      configurable: true
    })
    Object.defineProperty(scrollEl, 'scrollTop', {
      value: 100,
      writable: true,
      configurable: true
    })

    // content 变化 → scrollFollow.checkAndScroll 会调 scrollTop = scrollHeight
    await wrapper.setProps({ content: '初始内容\n\n新追加的内容' })
    await nextTick()
    await flushPromises()

    // scrollTop 被设置为 scrollHeight（因为 Following 状态下自动滚到底）
    expect(scrollEl.scrollTop).toBe(2000)

    wrapper.unmount()
  })
})

describe('StepOutput — ARIA', () => {
  it('thinking header aria-expanded 跟随折叠状态', async () => {
    const wrapper = mount(StepOutput, {
      props: { thinking: '思考', streaming: false }
    })
    const header = wrapper.find('.step-output-thinking-header')
    // 初始折叠 → aria-expanded=false
    expect(header.attributes('aria-expanded')).toBe('false')

    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('true')
  })

  it('streaming 占位有 aria-label', () => {
    const wrapper = mount(StepOutput, {
      props: { streaming: true, content: '' }
    })
    expect(wrapper.find('.step-output-streaming-placeholder').attributes('aria-label')).toBe(
      'AI 正在生成中'
    )
  })
})
