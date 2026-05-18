/**
 * CreditBalanceCard 二态单元测试 — credits-system Track E.2 + Q2 改造
 *
 * 覆盖 spec §4.2.4 的状态机：
 *   1. state='free'    → user.tier='free' + 无余额 → 联系管理员文案；**不渲染升级按钮**（Q2）
 *   2. state='credits' → 双档（订阅 + 加量包）数字；加量包 total=0 时隐藏
 *
 * Q2 变更（B2B2C 模式）：C 端不能自购会员，free state 移除跳转按钮，
 * 改为静态文案"请联系您的管理员开通会员"。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

import CreditBalanceCard from '@/components/credit/CreditBalanceCard.vue'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'
import type { QuotaBreakdown } from '@/api/credits'

// vue-router mock：组件已不再直接 useRouter，但保留 mock 避免
// 其它未来用例潜在依赖。
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

describe('CreditBalanceCard — free 状态（Q2: 联系管理员）', () => {
  it('user.tier=free → 渲染"联系管理员"文案，不渲染升级按钮', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'free' }
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.attributes('data-state')).toBe('free')
    expect(wrapper.text()).toContain('成为会员解锁 AI 能力')
    expect(wrapper.text()).toContain('请联系您的管理员开通会员')
    // Q2: 不应再渲染"升级会员"按钮（B2B2C 模式移除 C 端自购 CTA）
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('升级会员')
    // 不应出现积分数字相关元素
    expect(wrapper.find('.credit-row.subscription').exists()).toBe(false)
  })

  it('tier=free + 全零余额 → 判 free', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'free' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0
    }
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('free')
  })

  it('free state 没有任何可点击跳转元素（B2B2C 模式）', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'free' }
    const wrapper = mountCard()
    await flushPromises()

    // 不应触发任何 router.push
    expect(pushSpy).not.toHaveBeenCalled()
    // 确认没有 button / a 元素存在
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
  })
})

describe('CreditBalanceCard — credits 状态', () => {
  it('有积分包 + 加量包有余额 → 双档渲染', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'premium' }
    const credits = useCreditsStore()
    const balance: QuotaBreakdown = {
      balance: 1100,
      sub_total: 1000,
      sub_remain: 700,
      booster_total: 400,
      booster_remain: 350,
      sub_expires_at: '2026-04-30T23:59:59Z',
      booster_earliest_expires_at: '2026-07-15T23:59:59Z'
    }
    // cycle_remaining 是 BalanceDTO 字段，QuotaBreakdown 不含；测试里 cast 注入
    ;(balance as unknown as Record<string, unknown>).cycle_remaining = 700
    credits.balance = balance
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.attributes('data-state')).toBe('credits')
    expect(wrapper.find('.credit-row.subscription').exists()).toBe(true)
    expect(wrapper.find('.credit-row.booster').exists()).toBe(true)
    expect(wrapper.text()).toContain('700')
    expect(wrapper.text()).toContain('350')
    expect(wrapper.text()).toContain('400')
  })

  it('有积分包 + 加量包 total=0 → 只渲染订阅段', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'standard' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 1000,
      sub_total: 1000,
      sub_remain: 1000,
      booster_total: 0,
      booster_remain: 0
    }
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('credits')
    expect(wrapper.find('.credit-row.subscription').exists()).toBe(true)
    expect(wrapper.find('.credit-row.booster').exists()).toBe(false)
  })

  it('tier 非 free → 视为 credits（新制默认）', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'trial' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 100,
      sub_total: 100,
      sub_remain: 100,
      booster_total: 0,
      booster_remain: 0
    }
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('credits')
  })
})
