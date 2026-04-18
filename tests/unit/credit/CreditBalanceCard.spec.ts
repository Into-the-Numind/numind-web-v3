/**
 * CreditBalanceCard 三态单元测试 — credits-system Track E.2
 *
 * 覆盖 spec §4.2.4 的状态机：
 *   1. state='free'    → user.tier='free' → 升级引导 CTA 渲染，不渲染用量数字
 *   2. state='legacy'  → tier !== 'free' + billing_mode='legacy_tier' → 次数文案
 *      2a. monthly_limit=null → "无限"
 *      2b. monthly_limit 有限 → "已用 X / limit"
 *   3. state='credits' → 双档（订阅 + 加量包）数字；加量包 total=0 时隐藏
 *
 * 特别校验：free 优先级最高（即使 balance 存在 billing_mode 也取 free）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

import CreditBalanceCard from '@/components/credit/CreditBalanceCard.vue'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'
import type { QuotaBreakdown } from '@/api/credits'

// vue-router mock：组件只调用 router.push，不需要完整路由
const pushSpy = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy })
}))

function mountCard() {
  return mount(CreditBalanceCard)
}

beforeEach(() => {
  setActivePinia(createPinia())
  pushSpy.mockClear()
})

describe('CreditBalanceCard — free 状态', () => {
  it('user.tier=free → 渲染升级 CTA，不渲染余额', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'free' }
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.attributes('data-state')).toBe('free')
    expect(wrapper.text()).toContain('成为会员解锁 AI 能力')
    expect(wrapper.text()).toContain('升级会员')
    // 不应出现积分数字相关元素
    expect(wrapper.find('.credit-row.subscription').exists()).toBe(false)
  })

  it('free 优先级高于 billing_mode：即便后端给了 credits balance 仍判 free', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'free' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0,
      billing_mode: 'credits'
    }
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('free')
  })

  it('点击升级按钮触发 router.push(/settings)', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'free' }
    const wrapper = mountCard()
    await wrapper.find('button').trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/settings')
  })
})

describe('CreditBalanceCard — legacy_tier 状态', () => {
  it('billing_mode=legacy_tier + monthly_limit=null → 无限文案', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'premium' }
    const credits = useCreditsStore()
    const balance: QuotaBreakdown = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0,
      billing_mode: 'legacy_tier',
      monthly_limit: null,
      remaining_runs: null
    }
    credits.balance = balance

    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('legacy')
    expect(wrapper.text()).toContain('本月运行次数')
    expect(wrapper.text()).toContain('无限')
  })

  it('billing_mode=legacy_tier + 有限 monthly_limit → 展示已用/limit', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'standard' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0,
      billing_mode: 'legacy_tier',
      monthly_limit: 20,
      remaining_runs: 13
    }
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('legacy')
    // 已用 = 20 - 13 = 7
    expect(wrapper.text()).toMatch(/已用.*7.*\/ 20/)
  })
})

describe('CreditBalanceCard — credits 状态', () => {
  it('billing_mode=credits + 加量包有余额 → 双档渲染', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'premium' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 1100,
      sub_total: 1000,
      sub_remain: 700,
      booster_total: 400,
      booster_remain: 350,
      billing_mode: 'credits',
      sub_expires_at: '2026-04-30T23:59:59Z',
      booster_earliest_expires_at: '2026-07-15T23:59:59Z'
    }
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.attributes('data-state')).toBe('credits')
    expect(wrapper.find('.credit-row.subscription').exists()).toBe(true)
    expect(wrapper.find('.credit-row.booster').exists()).toBe(true)
    expect(wrapper.text()).toContain('700')
    expect(wrapper.text()).toContain('1000')
    expect(wrapper.text()).toContain('350')
    expect(wrapper.text()).toContain('400')
  })

  it('billing_mode=credits + 加量包 total=0 → 只渲染订阅段', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'standard' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 1000,
      sub_total: 1000,
      sub_remain: 1000,
      booster_total: 0,
      booster_remain: 0,
      billing_mode: 'credits'
    }
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('credits')
    expect(wrapper.find('.credit-row.subscription').exists()).toBe(true)
    expect(wrapper.find('.credit-row.booster').exists()).toBe(false)
  })

  it('未显式设置 billing_mode 但 tier 非 free → 视为 credits（新制默认）', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'trial' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 100,
      sub_total: 100,
      sub_remain: 100,
      booster_total: 0,
      booster_remain: 0
      // billing_mode 未设置
    }
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('credits')
  })
})
