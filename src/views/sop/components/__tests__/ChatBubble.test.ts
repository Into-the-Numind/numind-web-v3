/**
 * ChatBubble 组件单元测试
 *
 * 覆盖：
 *
 * 用户消息 (3)：
 *   1. 渲染 role='user' 的右侧气泡
 *   2. 用户消息不渲染 thinking 面板
 *   3. 用户消息不渲染操作按钮
 *
 * 助手消息 (4)：
 *   4. 渲染 role='assistant' 的左侧气泡
 *   5. Markdown 内容被 renderMarkdown 渲染
 *   6. thinking 非空时渲染折叠面板
 *   7. 点击 thinking header 切换折叠
 *
 * Streaming (3)：
 *   8. streaming=true 且无内容 → 显示光标占位
 *   9. streaming=true 且有内容 → 显示内容无占位
 *  10. streaming=true 时不显示操作按钮
 *
 * 操作按钮 (4)：
 *  11. assistant + 非 streaming + 非临时 → 显示按钮
 *  12. 点击复制触发 copy emit
 *  13. 点击重新生成触发 regenerate emit
 *  14. 临时消息（id 是字符串）不显示操作按钮
 *
 * XSS (1)：
 *  15. content 中的 <script> 被剥离
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatBubble, { type ChatBubbleMessage } from '../ChatBubble.vue'

function makeMessage(overrides: Partial<ChatBubbleMessage> = {}): ChatBubbleMessage {
  return {
    id: 1,
    role: 'assistant',
    content: '你好！',
    thinking: '',
    ...overrides
  }
}

describe('ChatBubble — 用户消息', () => {
  it('渲染 role=user 的右侧气泡', () => {
    const wrapper = mount(ChatBubble, {
      props: { message: makeMessage({ id: 1, role: 'user', content: '我有个问题' }) }
    })
    expect(wrapper.classes()).toContain('chat-bubble--user')
    // 用户消息不显示 avatar（Gemini 风格）
    expect(wrapper.find('.chat-bubble-avatar--user').exists()).toBe(false)
    expect(wrapper.html()).toContain('我有个问题')
  })

  it('用户消息不渲染 thinking 面板（即使 thinking 非空）', () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({
          id: 1,
          role: 'user',
          content: '问题',
          thinking: '这不应该显示'
        })
      }
    })
    expect(wrapper.find('.chat-bubble-thinking').exists()).toBe(false)
  })

  it('用户消息不渲染操作按钮', () => {
    const wrapper = mount(ChatBubble, {
      props: { message: makeMessage({ role: 'user', content: '问题' }) }
    })
    expect(wrapper.find('.chat-bubble-actions').exists()).toBe(false)
  })
})

describe('ChatBubble — 助手消息', () => {
  it('渲染 role=assistant 的左侧气泡', () => {
    const wrapper = mount(ChatBubble, {
      props: { message: makeMessage({ role: 'assistant', content: '你好' }) }
    })
    expect(wrapper.classes()).toContain('chat-bubble--assistant')
    expect(wrapper.find('.chat-bubble-avatar--assistant').exists()).toBe(true)
  })

  it('Markdown 内容被 renderMarkdown 渲染', () => {
    const wrapper = mount(ChatBubble, {
      props: { message: makeMessage({ content: '# 标题\n**加粗**' }) }
    })
    const html = wrapper.find('.chat-bubble-text').html()
    expect(html).toContain('<h1>')
    expect(html).toContain('<strong>')
  })

  it('thinking 非空时渲染折叠面板', () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({
          role: 'assistant',
          content: '结果',
          thinking: '推理过程'
        })
      }
    })
    expect(wrapper.find('.chat-bubble-thinking').exists()).toBe(true)
  })

  it('点击 thinking header 切换折叠状态', async () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({
          role: 'assistant',
          content: '结果',
          thinking: '推理'
        })
      }
    })
    // 非流式默认折叠
    expect(wrapper.find('.chat-bubble-thinking').classes()).toContain('is-collapsed')

    await wrapper.find('.chat-bubble-thinking-header').trigger('click')
    expect(wrapper.find('.chat-bubble-thinking').classes()).not.toContain('is-collapsed')

    await wrapper.find('.chat-bubble-thinking-header').trigger('click')
    expect(wrapper.find('.chat-bubble-thinking').classes()).toContain('is-collapsed')
  })
})

describe('ChatBubble — Streaming', () => {
  it('streaming=true 且无内容无思考 → 显示光标占位', () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({ role: 'assistant', content: '', thinking: '' }),
        streaming: true
      }
    })
    expect(wrapper.find('.chat-bubble-loading').exists()).toBe(true)
    expect(wrapper.find('.chat-bubble-cursor').exists()).toBe(true)
  })

  it('streaming=true 且有内容 → 显示内容无占位', () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({ role: 'assistant', content: '部分内容' }),
        streaming: true
      }
    })
    expect(wrapper.find('.chat-bubble-loading').exists()).toBe(false)
    expect(wrapper.find('.chat-bubble-text').html()).toContain('部分内容')
  })

  it('streaming=true 时不显示操作按钮（即使 assistant + 有内容）', () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({ role: 'assistant', content: '内容' }),
        streaming: true
      }
    })
    expect(wrapper.find('.chat-bubble-actions').exists()).toBe(false)
  })
})

describe('ChatBubble — 操作按钮', () => {
  it('assistant + 非 streaming + 非临时 + 有内容 → 显示按钮', () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({ id: 123, role: 'assistant', content: '结果' }),
        streaming: false
      }
    })
    expect(wrapper.find('.chat-bubble-actions').exists()).toBe(true)
    expect(wrapper.findAll('.chat-bubble-action').length).toBe(1)
  })

  it('点击复制按钮触发 copy emit 携带内容', async () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({ id: 123, role: 'assistant', content: '要复制的内容' })
      }
    })
    const copyBtn = wrapper.findAll('.chat-bubble-action')[0]
    await copyBtn.trigger('click')
    expect(wrapper.emitted('copy')).toBeTruthy()
    expect(wrapper.emitted('copy')?.[0]).toEqual(['要复制的内容'])
  })

  it('临时消息（id 是字符串）不显示操作按钮', () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({
          id: 'temp_xyz',
          role: 'assistant',
          content: '临时内容'
        })
      }
    })
    expect(wrapper.find('.chat-bubble-actions').exists()).toBe(false)
  })
})

describe('ChatBubble — XSS', () => {
  it('content 中的 <script> 被 DOMPurify 剥离', () => {
    const wrapper = mount(ChatBubble, {
      props: {
        message: makeMessage({
          role: 'assistant',
          content: '<script>alert(1)</script>正常内容'
        })
      }
    })
    const html = wrapper.find('.chat-bubble-text').html()
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert(1)')
    expect(html).toContain('正常内容')
  })
})
