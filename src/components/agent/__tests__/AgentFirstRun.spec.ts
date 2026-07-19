import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentFirstRun from '../AgentFirstRun.vue'
import type { AgentSkill } from '@/types/agent'

const agent: AgentSkill = {
  id: 1,
  name: '爆款分析师',
  emoji: '🤖',
  description: '',
  welcome_message: '准备好一起分析你的数据了吗？',
  is_active: true,
  created_at: '',
  updated_at: ''
}

describe('AgentFirstRun', () => {
  it('shows only the welcome message, without the emoji and Agent name identity pill', () => {
    const wrapper = mount(AgentFirstRun, { props: { agent } })

    expect(wrapper.find('.first-run__identity').exists()).toBe(false)
    expect(wrapper.find('.first-run__hero').text()).toBe(agent.welcome_message)
    expect(wrapper.text()).not.toContain(agent.emoji!)
    expect(wrapper.text()).not.toContain(agent.name)
  })
})
