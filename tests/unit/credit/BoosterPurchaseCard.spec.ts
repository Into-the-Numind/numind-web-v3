/**
 * BoosterPurchaseCard 4 态交互测试 — credits-system Track E.4 + Q2 改造
 *
 * 覆盖 spec §4.2.6 矩阵（Q2 调整）：
 *   1. credits 模式会员    → 不灰 + 点击 emit purchase
 *   2. free                → 灰态 + tooltip + **点击无动作**（Q2: 不再跳转）
 *   3. trial               → 灰态 + tooltip + **点击无动作**（Q2: 不再跳转）
 *   4. legacy_tier         → 灰态 + tooltip + 点击无动作（既不 emit 也不 push）
 *
 * 特别校验：legacy_tier 优先级最高（即便 tier=free 也应视为 legacy）。
 *
 * Q2 变更：B2B2C 模式下 C 端不能自购会员，非会员点击不再跳转 /settings，
 * 改为静态 tooltip 提示联系管理员。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

import BoosterPurchaseCard from '@/components/credit/BoosterPurchaseCard.vue'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'

// 组件已不再 useRouter，但保留 mock 防御性捕获任何意外调用。
const pushSpy = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy })
}))

function setup(opts: { tier: string; billingMode?: 'credits' | 'legacy_tier' }) {
  setActivePinia(createPinia())
  const user = useUserStore()
  user.userInfo = { id: 1, username: 'u', user_tier: opts.tier }
  const credits = useCreditsStore()
  if (opts.billingMode) {
    credits.balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0,
      billing_mode: opts.billingMode
    }
  }
}

beforeEach(() => {
  pushSpy.mockClear()
})

describe('BoosterPurchaseCard — credits 正常态', () => {
  it('standard 会员 + billing=credits → 非灰 + 点击 emit purchase', async () => {
    setup({ tier: 'standard', billingMode: 'credits' })
    const wrapper = mount(BoosterPurchaseCard)
    const card = wrapper.find('.booster-card')

    expect(card.attributes('data-state')).toBe('credits')
    expect(card.classes()).not.toContain('is-disabled')
    expect(card.text()).toContain('立即购买')

    await card.trigger('click')
    expect(wrapper.emitted('purchase')).toHaveLength(1)
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('premium 会员 + billing=credits → 同 credits 状态', async () => {
    setup({ tier: 'premium', billingMode: 'credits' })
    const wrapper = mount(BoosterPurchaseCard)
    expect(wrapper.find('.booster-card').attributes('data-state')).toBe('credits')
  })
})

describe('BoosterPurchaseCard — free 灰态无跳转（Q2）', () => {
  it('tier=free → 灰态 + tooltip + 点击不跳转不 emit（B2B2C 联系管理员）', async () => {
    setup({ tier: 'free' })
    const wrapper = mount(BoosterPurchaseCard)
    const card = wrapper.find('.booster-card')

    expect(card.attributes('data-state')).toBe('free')
    expect(card.classes()).toContain('is-disabled')
    expect(card.classes()).toContain('no-route')
    expect(wrapper.text()).toContain('请联系管理员开通会员')
    expect(wrapper.text()).toContain('加量包为会员专享')

    await card.trigger('click')
    expect(pushSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('purchase')).toBeUndefined()
  })
})

describe('BoosterPurchaseCard — trial 灰态无跳转（Q2）', () => {
  it('tier=trial → 灰态 + tooltip + 点击不跳转不 emit（B2B2C 联系管理员）', async () => {
    setup({ tier: 'trial' })
    const wrapper = mount(BoosterPurchaseCard)
    const card = wrapper.find('.booster-card')

    expect(card.attributes('data-state')).toBe('trial')
    expect(card.classes()).toContain('is-disabled')
    expect(card.classes()).toContain('no-route')
    expect(wrapper.text()).toContain('请联系管理员开通会员')

    await card.trigger('click')
    expect(pushSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('purchase')).toBeUndefined()
  })
})

describe('BoosterPurchaseCard — legacy_tier 灰态无跳转', () => {
  it('billing_mode=legacy_tier → 灰态 + tooltip + 点击不跳转不 emit', async () => {
    setup({ tier: 'premium', billingMode: 'legacy_tier' })
    const wrapper = mount(BoosterPurchaseCard)
    const card = wrapper.find('.booster-card')

    expect(card.attributes('data-state')).toBe('legacy')
    expect(card.classes()).toContain('is-disabled')
    expect(card.classes()).toContain('no-route')
    expect(wrapper.text()).toContain('老会员制暂不支持')

    await card.trigger('click')
    expect(pushSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('purchase')).toBeUndefined()
  })

  it('legacy_tier 优先级高于 free：tier=free 但 billing=legacy_tier 判 legacy', async () => {
    setup({ tier: 'free', billingMode: 'legacy_tier' })
    const wrapper = mount(BoosterPurchaseCard)
    expect(wrapper.find('.booster-card').attributes('data-state')).toBe('legacy')
  })
})

describe('BoosterPurchaseCard — props', () => {
  it('价格与积分 props 渲染', () => {
    setup({ tier: 'standard', billingMode: 'credits' })
    const wrapper = mount(BoosterPurchaseCard, {
      props: { price: 49.9, credits: 1000 }
    })
    expect(wrapper.text()).toContain('¥49.9')
    expect(wrapper.text()).toContain('1000 积分')
  })
})
