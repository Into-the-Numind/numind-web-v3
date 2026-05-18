/**
 * CreditsView 单元测试 (Plan §Task 18)
 *
 * 覆盖 4+ case：
 *   T1: loading 状态渲染 3 个 skeleton-card
 *   T2: booster 冻结渲染 locked 图标 + freeze-hint 文案
 *   T3: 非会员购买按钮 disabled + hint 文案
 *   T4: error 状态渲染 error-state + 重试按钮
 *   T5: success 状态渲染 3 张卡片
 *   T6: isMember=true 时购买按钮 enabled
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// --- Mocks ---
vi.mock('@/api/credits', () => ({
  getCreditBalance: vi.fn(),
  estimateCredits: vi.fn(),
  placeOrder: vi.fn(),
  getOrderStatus: vi.fn(),
  getBalance: vi.fn()
}))

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  getUserInfo: vi.fn()
}))

vi.mock('@/api/request', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}))

vi.mock('@/utils/datetime', () => ({
  formatDate: vi.fn((iso: string | null | undefined) => {
    if (!iso) return '—'
    return iso.slice(0, 10)
  })
}))

// Stub child components to avoid deep render issues
vi.mock('@/components/BoosterPurchaseDialog.vue', () => ({
  default: {
    name: 'BoosterPurchaseDialog',
    props: ['open', 'userId'],
    emits: ['update:open', 'success'],
    template: '<div data-test="booster-dialog-stub"></div>'
  }
}))

import CreditsView from '../CreditsView.vue'
import { useCreditsStore } from '@/stores/credits'
import { useUserStore } from '@/stores/user'

/** Helper: mount CreditsView with Pinia */
function mountView() {
  return mount(CreditsView, {
    attachTo: document.body
  })
}

/** Minimal BalanceDTO shape used in tests */
function makeBalance(overrides: Record<string, unknown> = {}) {
  return {
    balance: 0,
    sub_remain: 0,
    booster_remain: 0,
    sub_expires_at: null,
    membership_state: 'free',
    trial_remaining: 0,
    cycle_remaining: 100,
    booster_total: 50,
    booster_usable: 50,
    trial_expires_at: null,
    ...overrides
  }
}

describe('CreditsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Silence fetchBalance in tests (override per-test as needed)
    const credits = useCreditsStore()
    vi.spyOn(credits, 'fetchBalance').mockResolvedValue(undefined)
    // Setup user store with a valid user
    const user = useUserStore()
    user.userInfo = { id: 42, username: 'testuser' }
  })

  it('T1: loading 状态渲染 3 个 skeleton-card', async () => {
    const credits = useCreditsStore()
    credits.balanceLoading = true
    credits.balance = null
    credits.balanceError = null

    const wrapper = mountView()
    await flushPromises()

    const skeletons = wrapper.findAll('[data-test="skeleton-card"]')
    expect(skeletons).toHaveLength(3)
    // No success cards
    expect(wrapper.find('[data-test="membership-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="error-state"]').exists()).toBe(false)
  })

  it('T2: booster 冻结渲染 locked 图标 + freeze-hint', async () => {
    const credits = useCreditsStore()
    credits.balanceLoading = false
    credits.balanceError = null
    credits.balance = makeBalance({
      booster_total: 50,
      booster_usable: 0, // frozen: usable < total
      membership_state: 'pro'
    }) as any

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="booster-locked-icon"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="freeze-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="freeze-hint"]').text()).toContain('需要开通会员后才能使用')
    expect(wrapper.find('[data-test="booster-locked"]').exists()).toBe(true)
  })

  it('T3: 非会员 (free) 购买按钮 disabled + hint', async () => {
    const credits = useCreditsStore()
    credits.balanceLoading = false
    credits.balanceError = null
    credits.balance = makeBalance({ membership_state: 'free' }) as any

    const wrapper = mountView()
    await flushPromises()

    const btn = wrapper.find('[data-test="purchase-btn"]')
    expect(btn.exists()).toBe(true)
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)

    const hint = wrapper.find('[data-test="purchase-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('开通会员后可购买加量包')
  })

  it('T4: error 状态渲染 error-state + 重试按钮', async () => {
    const credits = useCreditsStore()
    credits.balanceLoading = false
    credits.balance = null
    credits.balanceError = '网络错误'

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="error-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="error-state"]').text()).toContain('网络错误')
    expect(wrapper.find('.retry-btn').exists()).toBe(true)

    // Clicking retry calls fetchBalance
    await wrapper.find('.retry-btn').trigger('click')
    expect(credits.fetchBalance).toHaveBeenCalledTimes(2) // onMounted + click
  })

  it('T5: success 状态渲染 3 张卡片', async () => {
    const credits = useCreditsStore()
    credits.balanceLoading = false
    credits.balanceError = null
    credits.balance = makeBalance({ membership_state: 'pro', sub_expires_at: '2026-12-31' }) as any

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="membership-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="balance-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="purchase-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="skeleton-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="error-state"]').exists()).toBe(false)
  })

  it('T6: isMember=true (pro) 时购买按钮 enabled', async () => {
    const credits = useCreditsStore()
    credits.balanceLoading = false
    credits.balanceError = null
    credits.balance = makeBalance({ membership_state: 'pro' }) as any

    const wrapper = mountView()
    await flushPromises()

    const btn = wrapper.find('[data-test="purchase-btn"]')
    expect(btn.exists()).toBe(true)
    expect((btn.element as HTMLButtonElement).disabled).toBe(false)
    expect(wrapper.find('[data-test="purchase-hint"]').exists()).toBe(false)
  })
})
