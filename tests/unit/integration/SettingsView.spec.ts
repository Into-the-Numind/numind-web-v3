/**
 * SettingsView 嵌入 CreditBalanceCard + BoosterPurchaseCard 集成测试
 * — credits-system Phase 2 Task 2.4
 *
 * 验证：
 *   1. 页面挂载后，CreditBalanceCard 和 BoosterPurchaseCard 均被渲染
 *   2. 页面 onMounted 触发 credits store 的 fetchBalance（让余额可被卡片读到）
 *   3. 既有 settings rows（个人信息 / 会员信息 / 账号）不被破坏
 *
 * 策略：
 *   - mock getUserInfo 返回最小 payload，避免网络
 *   - stub MainLayout / AppSidebar（仅 <slot> 透传），避免 router 全量
 *   - spy creditsStore.fetchBalance 断言调用
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

import SettingsView from '@/views/SettingsView.vue'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'

// ---- Mock 依赖 ----

// 1. getUserInfo — 避免真请求
vi.mock('@/api/auth', () => ({
  getUserInfo: vi.fn().mockResolvedValue({ code: 0, data: { nickname: 'tester', id: 42 } })
}))

// 2. MainLayout —— 简化为 slot 透传，不拉入 Sidebar / 路由依赖
vi.mock('@/components/layout/MainLayout.vue', () => ({
  default: {
    name: 'MainLayoutStub',
    template: '<div class="main-layout-stub"><slot /></div>'
  }
}))

// 3. vue-router —— SettingsView 里 useRouter 只在 logout 用到
const pushSpy = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy })
}))

beforeEach(() => {
  setActivePinia(createPinia())
  pushSpy.mockClear()
})

async function mountSettings() {
  const wrapper = mount(SettingsView)
  await flushPromises()
  return wrapper
}

describe('SettingsView — credit cards 嵌入', () => {
  it('渲染 CreditBalanceCard（data-state 存在即视为挂载成功）', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'standard' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 1000,
      sub_total: 1000,
      sub_remain: 700,
      booster_total: 0,
      booster_remain: 0,
      billing_mode: 'credits'
    }

    const wrapper = await mountSettings()

    const balanceCard = wrapper.find('.credit-balance-card')
    expect(balanceCard.exists()).toBe(true)
    // credits 模式下订阅段应该出现
    expect(balanceCard.attributes('data-state')).toBe('credits')
  })

  it('渲染 BoosterPurchaseCard（.booster-card 存在）', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'standard' }
    const credits = useCreditsStore()
    credits.balance = {
      balance: 1000,
      sub_total: 1000,
      sub_remain: 700,
      booster_total: 0,
      booster_remain: 0,
      billing_mode: 'credits'
    }

    const wrapper = await mountSettings()

    const boosterCard = wrapper.find('.booster-card')
    expect(boosterCard.exists()).toBe(true)
    // credits 模式下应为活跃态（非 disabled）
    expect(boosterCard.attributes('data-state')).toBe('credits')
    expect(boosterCard.classes()).not.toContain('is-disabled')
  })

  it('onMounted 调用 creditsStore.fetchBalance', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'standard' }

    const credits = useCreditsStore()
    const fetchSpy = vi.spyOn(credits, 'fetchBalance').mockResolvedValue()

    await mountSettings()

    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('保留现有 settings 行：昵称 + 退出登录', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'free' }

    const wrapper = await mountSettings()

    // 昵称 row
    expect(wrapper.text()).toContain('昵称')
    // 退出登录 action row
    expect(wrapper.text()).toContain('退出登录')
  })

  it('free tier 下 CreditBalanceCard 显示升级引导，不影响 booster 灰态', async () => {
    const user = useUserStore()
    user.userInfo = { id: 1, username: 'u1', user_tier: 'free' }

    const wrapper = await mountSettings()

    const balanceCard = wrapper.find('.credit-balance-card')
    expect(balanceCard.attributes('data-state')).toBe('free')
    const boosterCard = wrapper.find('.booster-card')
    // free tier 下 booster 应为 disabled 状态
    expect(boosterCard.classes()).toContain('is-disabled')
    expect(boosterCard.attributes('data-state')).toBe('free')
  })
})
