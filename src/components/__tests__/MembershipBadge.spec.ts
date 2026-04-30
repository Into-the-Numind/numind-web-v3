/**
 * MembershipBadge 单元测试 (Plan §Task 18)
 *
 * 覆盖 3 个 case：
 *   T1: free → "免费用户" + .badge--free
 *   T2: trial → "试用中" + .badge--trial
 *   T3: pro → "Pro 会员" + .badge--pro
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MembershipBadge from '../MembershipBadge.vue'

describe('MembershipBadge', () => {
  it('T1: free state renders "免费用户" with .badge--free', () => {
    const wrapper = mount(MembershipBadge, { props: { state: 'free' } })
    expect(wrapper.text()).toBe('免费用户')
    expect(wrapper.classes()).toContain('badge--free')
    expect(wrapper.classes()).not.toContain('badge--trial')
    expect(wrapper.classes()).not.toContain('badge--pro')
  })

  it('T2: trial state renders "试用中" with .badge--trial', () => {
    const wrapper = mount(MembershipBadge, { props: { state: 'trial' } })
    expect(wrapper.text()).toBe('试用中')
    expect(wrapper.classes()).toContain('badge--trial')
    expect(wrapper.classes()).not.toContain('badge--free')
    expect(wrapper.classes()).not.toContain('badge--pro')
  })

  it('T3: pro state renders "Pro 会员" with .badge--pro', () => {
    const wrapper = mount(MembershipBadge, { props: { state: 'pro' } })
    expect(wrapper.text()).toBe('Pro 会员')
    expect(wrapper.classes()).toContain('badge--pro')
    expect(wrapper.classes()).not.toContain('badge--free')
    expect(wrapper.classes()).not.toContain('badge--trial')
  })
})
