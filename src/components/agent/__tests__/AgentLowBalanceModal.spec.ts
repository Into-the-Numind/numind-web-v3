import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AgentLowBalanceModal from '../AgentLowBalanceModal.vue'

const mountModal = () =>
  mount(AgentLowBalanceModal, {
    props: { open: true, balance: 18 },
    global: { stubs: { Teleport: true } }
  })

describe('AgentLowBalanceModal', () => {
  it('renders the approved minimal purchase path', () => {
    const wrapper = mountModal()

    expect(wrapper.text()).toContain('积分不足')
    expect(wrapper.text()).not.toContain('积分余额不足')
    expect(wrapper.text()).toContain('当前余额：18 积分')
    expect(wrapper.text()).toContain('购买加量包')
    expect(wrapper.find('.close-button').exists()).toBe(true)
    expect(wrapper.find('.option').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('购买加量包后可继续完成本次任务')
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

  it('emits close from the explicit close button', async () => {
    const wrapper = mountModal()

    await wrapper.get('.close-button').trigger('click')

    expect(wrapper.emitted('close')).toEqual([[]])
  })
})
