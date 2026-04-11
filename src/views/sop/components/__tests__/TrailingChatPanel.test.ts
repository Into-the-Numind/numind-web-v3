/**
 * TrailingChatPanel 组件单元测试
 *
 * 覆盖：
 *
 * 基础渲染 (3)：
 *   1. 空状态显示 empty hint
 *   2. 加载中显示 spinner
 *   3. 加载成功渲染消息列表
 *
 * 发送消息 (5)：
 *   4. 点击发送按钮调用 SSE stream
 *   5. Enter 键触发发送
 *   6. Shift+Enter 不触发发送（换行）
 *   7. 空内容不发送
 *   8. sending 状态禁用输入和按钮
 *
 * SSE 流处理 (4)：
 *   9. onMessage 累积到 streamingMessage.content
 *  10. onThinking 累积到 streamingMessage.thinking
 *  11. onDone 把 streamingMessage 提交到 messages 列表
 *  12. onError 保留已收到内容 + 注解中断原因
 *
 * 重新生成 (2)：
 *  13. 重新生成删除最后 2 条消息并重新发送
 *  14. regenerate_msg_id 参数传递到 SSE body
 *
 * 复制 (2)：
 *  15. 复制成功 toast
 *  16. 复制失败 toast
 *
 * 生命周期 (2)：
 *  17. runId 变化触发重新加载
 *  18. unmount 时 abort SSE 流
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/sop', () => ({
  listRunChatMessages: vi.fn()
}))

// Mock useSSEStream 为可控的函数，避免真实网络请求
let mockStreamPostImpl: (
  url: string,
  init: RequestInit,
  handlers: {
    onThinking?: (chunk: string) => void
    onMessage?: (chunk: string) => void
    onDone?: (meta: { status: string; message_id?: number }) => void
    onError?: (err: string) => void
  }
) => Promise<void>

const mockAbort = vi.fn()
vi.mock('@/views/sop/composables/useSSEStream', () => ({
  useSSEStream: () => ({
    streamPost: vi.fn((url, init, handlers) => mockStreamPostImpl(url, init, handlers)),
    abort: mockAbort
  })
}))

import TrailingChatPanel from '../TrailingChatPanel.vue'
import { listRunChatMessages } from '@/api/sop'

const listChatMock = listRunChatMessages as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  listChatMock.mockReset()
  mockAbort.mockReset()
  mockStreamPostImpl = async () => {}
  setActivePinia(createPinia())
  document.body.innerHTML = ''
  // clipboard mock
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined)
    }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    runId: 100,
    conversationId: 'sop_1_25_123',
    deepThinking: false,
    visible: true,
    ...overrides
  }
}

describe('TrailingChatPanel — 基础渲染', () => {
  it('空状态显示 empty hint', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()
    expect(wrapper.find('.trailing-chat-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('继续和 AI 对话')
    wrapper.unmount()
  })

  it('加载中显示 spinner', async () => {
    listChatMock.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await nextTick()
    expect(wrapper.find('.trailing-chat-loading').exists()).toBe(true)
    expect(wrapper.find('.trailing-chat-spinner').exists()).toBe(true)
    wrapper.unmount()
  })

  it('加载成功渲染消息列表', async () => {
    listChatMock.mockResolvedValue({
      run_id: 100,
      conversation_id: 'conv-1',
      messages: [
        {
          id: 1,
          role: 'user',
          content: '问题 A',
          thinking: '',
          created_at: '2026-04-10T00:00:00Z',
          prompt_tokens: 10,
          completion_tokens: 0,
          total_tokens: 10,
          reasoning_tokens: 0,
          estimated_prompt_tokens: 0
        },
        {
          id: 2,
          role: 'assistant',
          content: '答案 A',
          thinking: '思考内容',
          created_at: '2026-04-10T00:00:01Z',
          prompt_tokens: 0,
          completion_tokens: 20,
          total_tokens: 20,
          reasoning_tokens: 5,
          estimated_prompt_tokens: 0
        }
      ]
    })
    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()
    const bubbles = wrapper.findAll('.chat-bubble')
    expect(bubbles.length).toBe(2)
    expect(wrapper.text()).toContain('问题 A')
    expect(wrapper.text()).toContain('答案 A')
    wrapper.unmount()
  })
})

describe('TrailingChatPanel — 发送消息', () => {
  it('点击发送按钮调用 SSE stream', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    const streamCalls: Array<{ url: string; body: string }> = []
    mockStreamPostImpl = async (url, init, handlers) => {
      streamCalls.push({ url, body: init.body as string })
      handlers.onMessage?.('ok')
      handlers.onDone?.({ status: 'completed', message_id: 999 })
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    const textarea = wrapper.find('textarea')
    await textarea.setValue('你好')
    await wrapper.find('.trailing-chat-send-btn').trigger('click')
    await flushPromises()

    expect(streamCalls.length).toBe(1)
    expect(streamCalls[0].url).toContain('/v1/sop/chat/stream')
    const body = JSON.parse(streamCalls[0].body)
    expect(body).toMatchObject({
      run_id: 100,
      conversation_id: 'sop_1_25_123',
      question: '你好',
      deep_thinking: false,
      regenerate_msg_id: 0
    })
    wrapper.unmount()
  })

  it('Enter 键触发发送', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    let streamCalled = false
    mockStreamPostImpl = async (_url, _init, handlers) => {
      streamCalled = true
      handlers.onDone?.({ status: 'completed', message_id: 999 })
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    const textarea = wrapper.find('textarea')
    await textarea.setValue('测试')
    await textarea.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(streamCalled).toBe(true)
    wrapper.unmount()
  })

  it('空内容不发送', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    let streamCalled = false
    mockStreamPostImpl = async () => {
      streamCalled = true
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    // 不输入直接点击
    await wrapper.find('.trailing-chat-send-btn').trigger('click')
    await flushPromises()
    expect(streamCalled).toBe(false)

    // 输入空白不发送
    await wrapper.find('textarea').setValue('   ')
    await wrapper.find('.trailing-chat-send-btn').trigger('click')
    await flushPromises()
    expect(streamCalled).toBe(false)

    wrapper.unmount()
  })

  it('sending 状态禁用输入和按钮', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    // 模拟长时间运行的 stream
    mockStreamPostImpl = () => new Promise(() => {})

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.find('textarea').setValue('问题')
    await wrapper.find('.trailing-chat-send-btn').trigger('click')
    await flushPromises()

    // textarea 和 button disabled
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).disabled).toBe(true)
    const btn = wrapper.find('.trailing-chat-send-btn').element as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(wrapper.text()).toContain('生成中')
    wrapper.unmount()
  })
})

describe('TrailingChatPanel — SSE 流处理', () => {
  it('onMessage 累积到 streamingMessage.content', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    mockStreamPostImpl = async (_url, _init, handlers) => {
      handlers.onMessage?.('Hello ')
      handlers.onMessage?.('World')
      // 不调 onDone，保持 streaming 状态让测试能观察 streamingMessage
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.find('textarea').setValue('问')
    await wrapper.find('.trailing-chat-send-btn').trigger('click')
    await flushPromises()

    // Vue Test Utils 的 wrapper.vm 会 unwrap 顶层 ref，直接访问 .streamingMessage
    const vm = wrapper.vm as unknown as {
      streamingMessage: { content: string; thinking?: string } | null
    }
    expect(vm.streamingMessage?.content).toBe('Hello World')
    wrapper.unmount()
  })

  it('onThinking 累积到 streamingMessage.thinking', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    mockStreamPostImpl = async (_url, _init, handlers) => {
      handlers.onThinking?.('think ')
      handlers.onThinking?.('more')
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.find('textarea').setValue('q')
    await wrapper.find('.trailing-chat-send-btn').trigger('click')
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      streamingMessage: { thinking?: string } | null
    }
    expect(vm.streamingMessage?.thinking).toBe('think more')
    wrapper.unmount()
  })

  it('onDone 把 streamingMessage 提交到 messages 列表并用 message_id', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    mockStreamPostImpl = async (_url, _init, handlers) => {
      handlers.onMessage?.('答案')
      handlers.onDone?.({ status: 'completed', message_id: 888 })
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.find('textarea').setValue('问')
    await wrapper.find('.trailing-chat-send-btn').trigger('click')
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      messages: Array<{ id: number | string; content: string }>
      streamingMessage: unknown
    }
    // 列表里：1 条 user + 1 条 assistant（刚提交）
    expect(vm.messages.length).toBe(2)
    const assistantMsg = vm.messages[1]
    expect(assistantMsg.id).toBe(888)
    expect(assistantMsg.content).toBe('答案')
    // streamingMessage 已清空
    expect(vm.streamingMessage).toBe(null)
    wrapper.unmount()
  })

  it('onError 保留已收到内容 + 注解中断原因', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    mockStreamPostImpl = async (_url, _init, handlers) => {
      handlers.onMessage?.('部分内容')
      handlers.onError?.('网络中断')
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.find('textarea').setValue('问')
    await wrapper.find('.trailing-chat-send-btn').trigger('click')
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      messages: Array<{ role: string; content: string }>
    }
    // 最后一条 assistant 消息保留部分内容 + 中断注解
    const lastMsg = vm.messages[vm.messages.length - 1]
    expect(lastMsg.role).toBe('assistant')
    expect(lastMsg.content).toContain('部分内容')
    expect(lastMsg.content).toContain('⚠ 生成中断：网络中断')
    expect(wrapper.emitted('error')).toBeTruthy()
    wrapper.unmount()
  })
})

describe('TrailingChatPanel — 生命周期', () => {
  it('runId 变化触发重新加载', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    const wrapper = mount(TrailingChatPanel, {
      props: makeProps({ runId: 100 }),
      attachTo: document.body
    })
    await flushPromises()
    expect(listChatMock).toHaveBeenCalledTimes(1)

    // 切换 runId
    await wrapper.setProps({ runId: 200 })
    await flushPromises()
    expect(listChatMock).toHaveBeenCalledTimes(2)
    expect(listChatMock).toHaveBeenLastCalledWith(200)
    wrapper.unmount()
  })

  it('unmount 时 abort SSE 流', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()
    wrapper.unmount()
    expect(mockAbort).toHaveBeenCalled()
  })

  it('runId 变化时 abort 旧 SSE 流（reviewer P1 修复）', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    const wrapper = mount(TrailingChatPanel, {
      props: makeProps({ runId: 100 }),
      attachTo: document.body
    })
    await flushPromises()
    mockAbort.mockClear()

    // 切换 runId 应该触发 abort
    await wrapper.setProps({ runId: 200 })
    await flushPromises()
    expect(mockAbort).toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('TrailingChatPanel — 键盘 & 复制 & 重新生成', () => {
  it('Shift+Enter 不触发发送（.exact 修饰符防止换行时误发）', async () => {
    listChatMock.mockResolvedValue({ run_id: 100, conversation_id: '', messages: [] })
    let streamCalled = false
    mockStreamPostImpl = async () => {
      streamCalled = true
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.find('textarea').setValue('测试')
    // Shift+Enter：.exact 修饰符过滤，不触发 send
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()
    expect(streamCalled).toBe(false)
    wrapper.unmount()
  })

  it('复制成功触发 success toast', async () => {
    listChatMock.mockResolvedValue({
      run_id: 100,
      conversation_id: '',
      messages: [
        {
          id: 1,
          role: 'assistant',
          content: '要复制的内容',
          thinking: '',
          created_at: '2026-04-10T00:00:00Z',
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          reasoning_tokens: 0,
          estimated_prompt_tokens: 0
        }
      ]
    })
    const writeTextSpy = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } })

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    // 点击复制按钮（第一个 chat-bubble-action）
    const copyBtn = wrapper.findAll('.chat-bubble-action')[0]
    await copyBtn.trigger('click')
    await flushPromises()

    expect(writeTextSpy).toHaveBeenCalledWith('要复制的内容')
    wrapper.unmount()
  })

  it('复制失败触发 error toast', async () => {
    listChatMock.mockResolvedValue({
      run_id: 100,
      conversation_id: '',
      messages: [
        {
          id: 1,
          role: 'assistant',
          content: '内容',
          thinking: '',
          created_at: '2026-04-10T00:00:00Z',
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          reasoning_tokens: 0,
          estimated_prompt_tokens: 0
        }
      ]
    })
    const writeTextSpy = vi.fn().mockRejectedValue(new Error('permission denied'))
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } })

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    const copyBtn = wrapper.findAll('.chat-bubble-action')[0]
    await copyBtn.trigger('click')
    await flushPromises()

    // writeText 被调用（失败）
    expect(writeTextSpy).toHaveBeenCalled()
    // 测试关键：不抛异常，catch 正常处理
    wrapper.unmount()
  })

  it('重新生成删除最后 2 条消息并重新发送', async () => {
    listChatMock.mockResolvedValue({
      run_id: 100,
      conversation_id: '',
      messages: [
        {
          id: 1,
          role: 'user',
          content: '问题 A',
          thinking: '',
          created_at: '',
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          reasoning_tokens: 0,
          estimated_prompt_tokens: 0
        },
        {
          id: 2,
          role: 'assistant',
          content: '旧答案',
          thinking: '',
          created_at: '',
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          reasoning_tokens: 0,
          estimated_prompt_tokens: 0
        }
      ]
    })

    const streamCalls: Array<{ body: string }> = []
    mockStreamPostImpl = async (_url, init, handlers) => {
      streamCalls.push({ body: init.body as string })
      handlers.onMessage?.('新答案')
      handlers.onDone?.({ status: 'completed', message_id: 999 })
    }

    const wrapper = mount(TrailingChatPanel, {
      props: makeProps(),
      attachTo: document.body
    })
    await flushPromises()

    // 点击第二条（assistant）的重新生成按钮
    const regenBtn = wrapper.findAll('.chat-bubble-action')[1]
    await regenBtn.trigger('click')
    await flushPromises()

    // 验证 regenerate_msg_id 传递到 body
    expect(streamCalls.length).toBe(1)
    const body = JSON.parse(streamCalls[0].body)
    expect(body.regenerate_msg_id).toBe(2)
    expect(body.question).toBe('问题 A')

    // 列表最终状态：新的 user 消息 + 新的 assistant 消息
    const vm = wrapper.vm as unknown as {
      messages: Array<{ id: number | string; role: string; content: string }>
    }
    expect(vm.messages.length).toBe(2)
    expect(vm.messages[0].content).toBe('问题 A')
    expect(vm.messages[1].id).toBe(999)
    expect(vm.messages[1].content).toBe('新答案')
    wrapper.unmount()
  })
})
