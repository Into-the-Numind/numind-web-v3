import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentChatHeader from '../AgentChatHeader.vue'
import type { AgentSkill } from '@/types/agent'

const mkAgent = (): AgentSkill => ({
  id: 1,
  name: '测试助手',
  description: '',
  emoji: '🤖',
  is_active: true,
  created_at: '',
  updated_at: ''
})

describe('AgentChatHeader', () => {
  it('shows the Agent name and never renders a duplicate cancel task button', () => {
    const wrapper = mount(AgentChatHeader, { props: { agent: mkAgent() } })

    expect(wrapper.find('.name').text()).toBe('测试助手')
    expect(wrapper.text()).not.toContain('取消任务')
    expect(wrapper.find('.cancel-btn').exists()).toBe(false)
  })

  it('emits a sidebar toggle request', async () => {
    const wrapper = mount(AgentChatHeader, { props: { agent: mkAgent() } })

    await wrapper.find('.sidebar-toggle').trigger('click')
    expect(wrapper.emitted('toggle-sidebar')).toHaveLength(1)
  })
})
