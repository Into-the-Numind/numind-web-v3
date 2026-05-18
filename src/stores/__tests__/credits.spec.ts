/**
 * credits Pinia store — Task 17 新增 getter 单元测试
 *
 * 覆盖（对应 plan §Task 17 设计）：
 *   1. displayState 默认 "free"（无 balance 时）
 *   2. balance.membership_state='trial' → displayState='trial'
 *   3. balance.membership_state='pro' → displayState='pro'
 *   4. balance.membership_state='free' → displayState='free'
 *   5. isBoosterFrozen 反映 booster_usable < booster_total
 *   6. isMember: trial/pro → true, free → false
 *   7. trialExpiresAt / proExpiresAt 透传
 *
 * 不 mock API，直接操作 store.balance（integration-lite 风格）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCreditsStore } from '../credits'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('credits store — displayState getter', () => {
  it('默认无 balance 时 displayState = "free"', () => {
    const store = useCreditsStore()
    expect(store.balance).toBeNull()
    expect(store.displayState).toBe('free')
  })

  it('balance.membership_state="trial" → displayState="trial"', () => {
    const store = useCreditsStore()
    store.balance = {
      // QuotaBreakdown base fields
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0,
      // BalanceDTO extension
      ...({ membership_state: 'trial' } as unknown as object)
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).membership_state = 'trial'
    expect(store.displayState).toBe('trial')
  })

  it('balance.membership_state="pro" → displayState="pro"', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 1000,
      sub_total: 2000,
      sub_remain: 1500,
      booster_total: 600,
      booster_remain: 600
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).membership_state = 'pro'
    expect(store.displayState).toBe('pro')
  })

  it('balance.membership_state="free" → displayState="free"', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).membership_state = 'free'
    expect(store.displayState).toBe('free')
  })

})

describe('credits store — isMember getter', () => {
  it('displayState="free" → isMember=false', () => {
    const store = useCreditsStore()
    expect(store.isMember).toBe(false)
  })

  it('displayState="trial" → isMember=true', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).membership_state = 'trial'
    expect(store.isMember).toBe(true)
  })

  it('displayState="pro" → isMember=true', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 1000,
      sub_total: 2000,
      sub_remain: 1500,
      booster_total: 0,
      booster_remain: 0
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).membership_state = 'pro'
    expect(store.isMember).toBe(true)
  })
})

describe('credits store — isBoosterFrozen getter', () => {
  it('无 balance → isBoosterFrozen=false', () => {
    const store = useCreditsStore()
    expect(store.isBoosterFrozen).toBe(false)
  })

  it('booster_usable = booster_total → isBoosterFrozen=false（正常可用）', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 600,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 600,
      booster_remain: 600
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).booster_usable = 600
    expect(store.isBoosterFrozen).toBe(false)
  })

  it('booster_usable=0 < booster_total=600 → isBoosterFrozen=true（冻结）', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 600,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 600,
      booster_remain: 600
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).booster_usable = 0
    expect(store.isBoosterFrozen).toBe(true)
  })

  it('booster_total=0 → isBoosterFrozen=false（无加量包不算冻结）', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).booster_usable = 0
    expect(store.isBoosterFrozen).toBe(false)
  })
})

describe('credits store — trialExpiresAt / proExpiresAt', () => {
  it('无 balance → 两个都是 null', () => {
    const store = useCreditsStore()
    expect(store.trialExpiresAt).toBeNull()
    expect(store.proExpiresAt).toBeNull()
  })

  it('trial_expires_at 透传到 trialExpiresAt', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 200,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0
    } as unknown as ReturnType<typeof useCreditsStore>['balance']
    ;(store.balance as unknown as Record<string, unknown>).trial_expires_at = '2026-05-01T23:59:59Z'
    expect(store.trialExpiresAt).toBe('2026-05-01T23:59:59Z')
  })

  it('sub_expires_at 透传到 proExpiresAt', () => {
    const store = useCreditsStore()
    store.balance = {
      balance: 1500,
      sub_total: 2000,
      sub_remain: 1500,
      booster_total: 0,
      booster_remain: 0,
      sub_expires_at: '2026-06-30T23:59:59Z'
    }
    expect(store.proExpiresAt).toBe('2026-06-30T23:59:59Z')
  })
})
