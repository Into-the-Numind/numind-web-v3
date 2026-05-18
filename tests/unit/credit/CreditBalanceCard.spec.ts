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
  it('pro 会员有 cycle 积分 + 加量包余额 → 双档渲染（单数字加量包）', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'premium' }
    const credits = useCreditsStore()
    // BalanceDTO 新格式：使用 cast 通过 QuotaBreakdown 类型，但实际填新字段
    const balance = {
      // 旧字段保留 0（后端已不返回，前端不再读）
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 400, // 注：后端字段名 total 但语义=remaining
      booster_remain: 0,
      // 新字段
      sub_expires_at: '2026-04-30T23:59:59Z'
    } as QuotaBreakdown
    ;(balance as unknown as Record<string, unknown>).membership_state = 'pro'
    ;(balance as unknown as Record<string, unknown>).cycle_remaining = 700
    ;(balance as unknown as Record<string, unknown>).booster_usable = 400
    credits.balance = balance
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.attributes('data-state')).toBe('credits')
    expect(wrapper.find('.credit-row.subscription').exists()).toBe(true)
    expect(wrapper.find('.credit-row.booster').exists()).toBe(true)
    // cycleRemaining=700 显示
    expect(wrapper.text()).toContain('700')
    // 新版加量包改单数字 boosterTotal=400（不再用 booster_remain 作分子）
    expect(wrapper.text()).toContain('400')
    expect(wrapper.text()).toContain('积分')
  })

  it('pro 会员有 cycle 积分 + 加量包 total=0 → 只渲染会员段', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'standard' }
    const credits = useCreditsStore()
    const balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0
    } as QuotaBreakdown
    ;(balance as unknown as Record<string, unknown>).membership_state = 'pro'
    ;(balance as unknown as Record<string, unknown>).cycle_remaining = 1000
    credits.balance = balance
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('credits')
    expect(wrapper.find('.credit-row.subscription').exists()).toBe(true)
    expect(wrapper.find('.credit-row.booster').exists()).toBe(false)
  })

  it('trial 会员有试用积分 → 视为 credits（试用档渲染）', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'trial' }
    const credits = useCreditsStore()
    const balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0
    } as QuotaBreakdown
    ;(balance as unknown as Record<string, unknown>).membership_state = 'trial'
    ;(balance as unknown as Record<string, unknown>).trial_remaining = 100
    credits.balance = balance
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('credits')
    expect(wrapper.find('.credit-row.trial').exists()).toBe(true)
    expect(wrapper.text()).toContain('100')
  })

  it('加量包冻结（pro 过期 + 仍有余额）→ 显示加量包数字 + 冻结提示', async () => {
    const credits = useCreditsStore()
    const balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 580,
      booster_remain: 0
    } as QuotaBreakdown
    ;(balance as unknown as Record<string, unknown>).membership_state = 'free'
    ;(balance as unknown as Record<string, unknown>).booster_usable = 0
    credits.balance = balance
    const wrapper = mountCard()
    await flushPromises()
    expect(wrapper.attributes('data-state')).toBe('credits')
    expect(wrapper.find('.credit-row.booster').exists()).toBe(true)
    expect(wrapper.text()).toContain('580')
    expect(wrapper.text()).toContain('需开通会员后可用')
  })
})
