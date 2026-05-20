import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import AgentChatHeader from '../AgentChatHeader.vue'
import type { AgentSkill, AgentRun, AgentRunStatus } from '@/types/agent'

const mkAgent = (): AgentSkill => ({
  id: 1,
  name: '测试助手',
  description: '',
  emoji: '🤖',
  is_active: true,
  created_at: '',
  updated_at: ''
})

const mkRun = (
  status: AgentRunStatus,
  thresholdState: 'under_60' | 'warning_60' | 'blocked_100' = 'under_60',
  usedCredits = 0
): AgentRun => ({
  id: 1,
  session_id: 1,
  user_id: 1,
  agent_skill_id: 1,
  status,
  credits_used: usedCredits,
  credits_budget: 200,
  credits_threshold_state: thresholdState,
  created_at: '',
  updated_at: ''
})

describe('AgentChatHeader', () => {
  it('shows 进行中 + green badge for running status', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('running'), balance: 1000 }
    })
    expect(wrapper.text()).toContain('进行中')
    expect(wrapper.find('.badge-green').exists()).toBe(true)
  })

  it('shows orange badge when threshold_state = warning_60', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('running', 'warning_60'), balance: 1000 }
    })
    expect(wrapper.find('.badge-orange').exists()).toBe(true)
  })

  it('shows 已完成 for completed', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('completed'), balance: 1000 }
    })
    expect(wrapper.text()).toContain('已完成')
  })

  it('shows 已取消 for cancelled', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('cancelled'), balance: 1000 }
    })
    expect(wrapper.text()).toContain('已取消')
  })

  it('shows 任务失败 for failed', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('failed'), balance: 1000 }
    })
    expect(wrapper.text()).toContain('任务失败')
  })

  it('shows 任务失败 for timeout', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('timeout'), balance: 1000 }
    })
    expect(wrapper.text()).toContain('任务失败')
  })

  it('shows 积分用尽 for budget_exhausted', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('budget_exhausted'), balance: 0 }
    })
    expect(wrapper.text()).toContain('积分用尽')
  })

  it('cancel button shown only when running', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('running'), balance: 1000 }
    })
    expect(wrapper.text()).toContain('取消任务')
  })

  it('cancel button hidden when readOnly', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('running'), balance: 1000, readOnly: true }
    })
    expect(wrapper.text()).not.toContain('取消任务')
  })

  it('cancel button hidden when completed', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('completed'), balance: 1000 }
    })
    expect(wrapper.text()).not.toContain('取消任务')
  })

  it('cancel button shown when stuck 60s+ even if status not running', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('completed'), balance: 1000, cancelAlwaysEnabled: true }
    })
    expect(wrapper.text()).toContain('取消任务')
  })

  it('cancel button disabled while cancelling', async () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('running'), balance: 1000, cancelling: true }
    })
    const btn = wrapper.find('button')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('emits cancel on click', async () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('running'), balance: 1000 }
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('shows credits_used', () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('running', 'under_60', 150), balance: 1000 }
    })
    expect(wrapper.text()).toContain('已用 150 积分')
  })
})
