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
    const btn = wrapper.find('.cancel-btn')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('emits cancel on click', async () => {
    const wrapper = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('running'), balance: 1000 }
    })
    await wrapper.find('.cancel-btn').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('does not render a status badge (removed per product decision)', () => {
    const w = mount(AgentChatHeader, {
      props: { agent: mkAgent(), run: mkRun('completed'), balance: 1000, readOnly: true }
    })
    expect(w.find('.status-badge').exists()).toBe(false)
  })

  // "已用 X 积分" credits_used 显示已按产品决定移除（不需要在 header 暴露会话花费），
  // 对应组件代码也无相关渲染。原 it('shows credits_used') 测试随之删除。
})
