import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AgentLowBalanceModal from '../AgentLowBalanceModal.vue'

const mountModal = () =>
  mount(AgentLowBalanceModal, {
    props: { open: true, balance: 18 },
    global: { stubs: { Teleport: true } }
  })

describe('AgentLowBalanceModal', () => {
  it('renders one purchase path without task recommendations or contact fallback', () => {
    const wrapper = mountModal()

    expect(wrapper.text()).toContain('积分余额不足')
    expect(wrapper.text()).toContain('当前余额：18 积分')
    expect(wrapper.text()).toContain('购买加量包')
    expect(wrapper.text()).not.toContain('试试这个')
    expect(wrapper.text()).not.toContain('缩小任务范围')
    expect(wrapper.text()).not.toContain('联系老师')
    expect(wrapper.text()).not.toContain('💳')
  })

  it('emits purchase when the user chooses the booster package', async () => {
    const wrapper = mountModal()

    await wrapper.get('.app-button').trigger('click')

    expect(wrapper.emitted('purchase')).toEqual([[]])
  })
})
