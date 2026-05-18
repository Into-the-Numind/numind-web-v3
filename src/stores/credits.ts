/**
 * credits store — 新制积分体系的余额状态中心
 *
 * ## 职责
 *
 * - `balance`：QuotaBreakdown（老 API，向后兼容；含 `membership_state` 可选扩展）
 * - `fetchBalance()`：拉取 GET /v1/credits/balance（via getCreditBalance）
 * - `fetchEstimate()`：拉取 POST /v1/credits/estimate
 * - `displayState`：读 `membership_state`（"free" / "trial" / "pro"）
 * - `isMember`：displayState 为 "trial" 或 "pro"
 * - `isBoosterFrozen`：booster_usable < booster_total（来自 BalanceDTO 字段）
 * - `trialExpiresAt`：trial_expires_at 透传
 * - `proExpiresAt`：sub_expires_at 透传
 *
 * ## 兼容性说明
 *
 * 旧版组件和测试直接写 `credits.balance = { balance: 0, ... }` (QuotaBreakdown)。
 * `balance` 字段维持旧类型保证类型兼容；新字段（`membership_state` / `booster_usable` 等）
 * 作为可选扩展加到 QuotaBreakdown，后端如果返回就可以用。
 *
 * Refs: plan §Task 17 / spec §8.1 / §8.5 / Task 12 §3.7
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  getCreditBalance,
  estimateCredits,
  type QuotaBreakdown,
  type EstimateResp
} from '@/api/credits'

export const useCreditsStore = defineStore('credits', () => {
  // ── State ────────────────────────────────────────────────────────────────
  const balance = ref<QuotaBreakdown | null>(null)
  const estimate = ref<EstimateResp | null>(null)

  /** balance 拉取 loading flag。 */
  const balanceLoading = ref(false)

  /** estimate 拉取 loading flag。 */
  const estimateLoading = ref(false)

  /** 最近一次 fetchBalance 的错误。 */
  const balanceError = ref<string | null>(null)

  /** 最近一次 fetchEstimate 的错误。 */
  const estimateError = ref<string | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────────

  /** 当前可用总额度（cycle + booster_usable + trial — BalanceDTO 新字段）。 */
  const totalRemain = computed(() => {
    const b = balance.value as unknown as Record<string, unknown> | null
    if (!b) return 0
    const cycle = typeof b.cycle_remaining === 'number' ? b.cycle_remaining : 0
    const boosterUsable = typeof b.booster_usable === 'number' ? b.booster_usable : 0
    const trial = typeof b.trial_remaining === 'number' ? b.trial_remaining : 0
    return cycle + boosterUsable + trial
  })

  /**
   * displayState — 会员状态枚举，供 UI 分支判断。
   *
   * 读后端返回的 `membership_state`（"free"/"trial"/"pro"）。
   *
   * 无 balance 时默认 "free"。
   */
  const displayState = computed((): 'free' | 'trial' | 'pro' => {
    const b = balance.value
    if (!b) return 'free'
    // 读 membership_state（后端 BalanceDTO 字段）
    // 支持两种格式：
    //   旧格式：membership_state = 'free' | 'trial' | 'pro'（字符串）
    //   BalanceDTO 格式：membership_state = { has_active_trial, has_active_subscription, ... }
    const ms = (b as unknown as Record<string, unknown>).membership_state
    if (ms === 'free' || ms === 'trial' || ms === 'pro') return ms
    if (ms && typeof ms === 'object') {
      const mso = ms as Record<string, unknown>
      if (mso.has_active_trial === true) return 'trial'
      if (mso.has_active_subscription === true) return 'pro'
      return 'free'
    }
    return 'free'
  })

  /** isMember — displayState 为 "trial" 或 "pro" 时为 true。 */
  const isMember = computed(() => displayState.value === 'trial' || displayState.value === 'pro')

  /**
   * isBoosterFrozen — 加量包冻结标志。
   *
   * 读 BalanceDTO 的 `booster_usable` 字段（后端计算）。
   * 如果字段不存在（老 QuotaBreakdown），回退到 false。
   */
  const isBoosterFrozen = computed((): boolean => {
    const b = balance.value as unknown as Record<string, unknown> | null
    if (!b) return false
    const total = typeof b.booster_total === 'number' ? b.booster_total : 0
    const usable = typeof b.booster_usable === 'number' ? b.booster_usable : total
    return usable < total
  })

  /** trialExpiresAt — ISO string，来自 BalanceDTO.trial_expires_at。 */
  const trialExpiresAt = computed((): string | null => {
    const b = balance.value as unknown as Record<string, unknown> | null
    const v = b?.trial_expires_at
    return typeof v === 'string' ? v : null
  })

  /** proExpiresAt — ISO string，来自 BalanceDTO.sub_expires_at（兼容 QuotaBreakdown）。 */
  const proExpiresAt = computed((): string | null => {
    const b = balance.value
    return b?.sub_expires_at ?? null
  })

  /** loading — balanceLoading 的别名（新版命名）。 */
  const loading = balanceLoading

  /** error — balanceError 的别名（新版命名）。 */
  const error = balanceError

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * 拉取 balance（GET /v1/credits/balance）。
   *
   * 错误处理：request.ts 拦截器已 reject 标准 Error，这里捕获后写入 balanceError。
   * 不重抛，因为 UI 层读 store state 而非 await 本函数。
   */
  async function fetchBalance(): Promise<void> {
    balanceLoading.value = true
    balanceError.value = null
    try {
      const res = await getCreditBalance()
      // request 拦截器把 body 解成 `{ code, message, data }`；取 data
      balance.value = (res as unknown as { data: QuotaBreakdown }).data ?? null
    } catch (e) {
      balanceError.value = e instanceof Error ? e.message : '获取余额失败'
      balance.value = null
    } finally {
      balanceLoading.value = false
    }
  }

  /**
   * 拉取估算（POST /v1/credits/estimate）。
   */
  async function fetchEstimate(operation: string, reference_id: string): Promise<void> {
    estimateLoading.value = true
    estimateError.value = null
    try {
      const res = await estimateCredits(operation, reference_id)
      estimate.value = (res as unknown as { data: EstimateResp }).data ?? null
    } catch (e) {
      estimateError.value = e instanceof Error ? e.message : '获取估算失败'
      estimate.value = null
    } finally {
      estimateLoading.value = false
    }
  }

  /** 清空本 store（logout 时调）。 */
  function reset(): void {
    balance.value = null
    estimate.value = null
    balanceError.value = null
    estimateError.value = null
    balanceLoading.value = false
    estimateLoading.value = false
  }

  return {
    // state
    balance,
    estimate,
    balanceLoading,
    estimateLoading,
    balanceError,
    estimateError,
    // aliases (new naming convention)
    loading,
    error,
    // getters
    totalRemain,
    displayState,
    isMember,
    isBoosterFrozen,
    trialExpiresAt,
    proExpiresAt,
    // actions
    fetchBalance,
    fetchEstimate,
    reset
  }
})
