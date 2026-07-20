import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AgentMessageList from '../AgentMessageList.vue'

const { isInterrupted, resume, install, uninstall, checkAndScroll } = vi.hoisted(() => ({
  isInterrupted: { value: true },
  resume: vi.fn(),
  install: vi.fn(),
  uninstall: vi.fn(),
  checkAndScroll: vi.fn()
}))

vi.mock('@/composables/useScrollFollow', () => ({
  useScrollFollow: () => ({ isInterrupted, resume, install, uninstall, checkAndScroll })
}))

describe('AgentMessageList', () => {
  beforeEach(() => {
    isInterrupted.value = true
    vi.clearAllMocks()
  })

  it('renders the new-content control as an arrow-only circular button', async () => {
    const wrapper = mount(AgentMessageList, {
      props: { messages: [] },
      global: { stubs: { AgentMessageItem: true, AgentRunPulse: true } }
    })

    const button = wrapper.find('.back-to-bottom')
    expect(button.attributes('aria-label')).toBe('回到底部')
    expect(button.text()).toBe('')
    expect(button.html()).not.toContain('新内容')

    await button.trigger('click')
    expect(resume).toHaveBeenCalled()
  })

  it('follows narration appended inside an existing tool-group message', async () => {
    const messages = [
      {
        id: 'tg-1',
        type: 'tool_group',
        timestamp: '2026-07-20T10:00:00Z',
        tool_calls: [
          {
            tool_call_id: 'tc-1',
            tool_name: 'lark_execute',
            current_state: 'use',
            events: [
              {
                run_id: 252,
                tool_call_id: 'tc-1',
                tool_name: 'lark_execute',
                state: 'use',
                message: '处理操作',
                timestamp: '2026-07-20T10:00:00Z'
              }
            ]
          }
        ]
      }
    ]
    const wrapper = mount(AgentMessageList, {
      props: { messages: messages as never },
      global: { stubs: { AgentMessageItem: true, AgentRunPulse: true } }
    })
    vi.clearAllMocks()

    const updatedMessages = [
      {
        ...messages[0],
        tool_calls: [
          {
            ...messages[0].tool_calls[0],
            current_state: 'result',
            events: [
              ...messages[0].tool_calls[0].events,
              {
                run_id: 252,
                tool_call_id: 'tc-1',
                tool_name: 'lark_execute',
                state: 'result',
                message: '操作完成',
                timestamp: '2026-07-20T10:00:01Z'
              }
            ]
          }
        ]
      }
    ]
    await wrapper.setProps({ messages: updatedMessages as never })
    await flushPromises()

    expect(checkAndScroll).toHaveBeenCalled()
  })
})
