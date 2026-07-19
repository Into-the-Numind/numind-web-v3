import { mount } from '@vue/test-utils'
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
})
