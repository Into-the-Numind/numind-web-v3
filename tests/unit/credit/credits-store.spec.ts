/**
 * credits Pinia store — credits-system Track E.5
 *
 * 覆盖：
 *   1. 初始状态 balance=null, estimate=null, loading=false
 *   2. fetchBalance 成功 → balance 写入，loading 切换
 *   3. fetchBalance 失败 → balanceError 写入，balance=null
 *   4. fetchEstimate 成功 → estimate 写入
 *   5. fetchEstimate 失败 → estimateError 写入
 *   6. totalRemain getter
 *   7. reset() 清空一切
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/credits', () => ({
  getCreditBalance: vi.fn(),
  estimateCredits: vi.fn()
}))

import * as creditsApi from '@/api/credits'
import { useCreditsStore } from '@/stores/credits'
import type { QuotaBreakdown, EstimateResp } from '@/api/credits'

const balanceFixture: QuotaBreakdown = {
  balance: 1000,
  sub_total: 1000,
  sub_remain: 600,
  booster_total: 200,
  booster_remain: 150,
  sub_expires_at: '2026-04-30T23:59:59Z',
  booster_earliest_expires_at: '2026-07-15T23:59:59Z'
}

const estimateFixture: EstimateResp = {
  total_estimated_credits: 120,
  first_node_estimate: 30,
  node_count: 4,
  sufficient: true,
  skip_deduction: false,
  balance: balanceFixture,
  coefficient_id: 7
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('credits store', () => {
  it('初始状态', () => {
    const store = useCreditsStore()
    expect(store.balance).toBeNull()
    expect(store.estimate).toBeNull()
    expect(store.balanceLoading).toBe(false)
    expect(store.estimateLoading).toBe(false)
    expect(store.balanceError).toBeNull()
    expect(store.estimateError).toBeNull()
    expect(store.totalRemain).toBe(0)
  })

  it('fetchBalance 成功 → balance 写入，loading 切换', async () => {
    vi.mocked(creditsApi.getCreditBalance).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: balanceFixture
    } as any)

    const store = useCreditsStore()
    const pending = store.fetchBalance()
    expect(store.balanceLoading).toBe(true)
    await pending
    expect(store.balanceLoading).toBe(false)
    expect(store.balance).toEqual(balanceFixture)
    expect(store.balanceError).toBeNull()
  })

  it('fetchBalance 失败 → balanceError 写入', async () => {
    vi.mocked(creditsApi.getCreditBalance).mockRejectedValue(new Error('network fail'))

    const store = useCreditsStore()
    await store.fetchBalance()
    expect(store.balance).toBeNull()
    expect(store.balanceError).toBe('network fail')
    expect(store.balanceLoading).toBe(false)
  })

  it('fetchEstimate 成功 → estimate 写入', async () => {
    vi.mocked(creditsApi.estimateCredits).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: estimateFixture
    } as any)

    const store = useCreditsStore()
    await store.fetchEstimate('sop_run', 'sop-123')
    expect(store.estimate).toEqual(estimateFixture)
    expect(store.estimateError).toBeNull()
    expect(creditsApi.estimateCredits).toHaveBeenCalledWith('sop_run', 'sop-123')
  })

  it('fetchEstimate 失败 → estimateError 写入', async () => {
    vi.mocked(creditsApi.estimateCredits).mockRejectedValue(new Error('backend 500'))

    const store = useCreditsStore()
    await store.fetchEstimate('sop_run', 'sop-123')
    expect(store.estimate).toBeNull()
    expect(store.estimateError).toBe('backend 500')
  })

  it('totalRemain getter', async () => {
    vi.mocked(creditsApi.getCreditBalance).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: balanceFixture
    } as any)

    const store = useCreditsStore()
    await store.fetchBalance()
    // sub_remain 600 + booster_remain 150
    expect(store.totalRemain).toBe(750)
  })

  it('reset() 清空所有状态', async () => {
    vi.mocked(creditsApi.getCreditBalance).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: balanceFixture
    } as any)

    const store = useCreditsStore()
    await store.fetchBalance()
    expect(store.balance).not.toBeNull()

    store.reset()
    expect(store.balance).toBeNull()
    expect(store.estimate).toBeNull()
    expect(store.balanceError).toBeNull()
    expect(store.estimateError).toBeNull()
  })
})
