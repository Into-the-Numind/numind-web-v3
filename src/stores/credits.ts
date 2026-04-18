/**
 * credits store — 新制积分体系的余额与估算状态中心（credits-system Track E.5）
 *
 * ## 职责
 *
 * 现有 `useUserStore` 已缓存若干额度数值（`quotaSubTotal` 等），但那是遗留的
 * 扁平字段。credits-system 需要完整的 `QuotaBreakdown` 对象（含 `billing_mode`
 * / `remaining_runs` / `sub_expires_at` 等 v3 新字段）。新建一个独立 store：
 *
 *   - `balance`：完整 QuotaBreakdown（源自 GET /v1/credits/balance）
 *   - `estimate`：最近一次 EstimateResp（SopEstimateBar 消费）
 *   - `fetchBalance()` / `fetchEstimate(op, ref)`：拉取 actions
 *
 * 不取代 userStore 里的旧字段（老 UI 还在读），两个 store 并存一段时间，
 * Phase 2 集成后再决定是否收敛。
 *
 * ## 使用
 *
 * ```ts
 * import { useCreditsStore } from '@/stores/credits'
 *
 * const credits = useCreditsStore()
 * await credits.fetchBalance()
 * if (credits.balance?.billing_mode === 'credits') { ... }
 * ```
 *
 * Refs: plan Track E.5 / spec §4.2.4 / §4.2.5
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

  /** balance 拉取 loading flag（UI 骨架屏用）。 */
  const balanceLoading = ref(false)
  /** estimate 拉取 loading flag。 */
  const estimateLoading = ref(false)

  /** 最近一次 fetchBalance 的错误（仅用于 UI 分支，非拦截器级别的错误）。 */
  const balanceError = ref<string | null>(null)
  /** 最近一次 fetchEstimate 的错误。 */
  const estimateError = ref<string | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────────
  /** billing_mode 快捷访问（undefined 代表 balance 还没拉取）。 */
  const billingMode = computed(() => balance.value?.billing_mode)

  /** 当前 credits 模式下可用总额度（sub_remain + booster_remain）。 */
  const totalRemain = computed(() => {
    const b = balance.value
    if (!b) return 0
    return (b.sub_remain ?? 0) + (b.booster_remain ?? 0)
  })

  // ── Actions ──────────────────────────────────────────────────────────────
  /**
   * 拉取 balance（GET /v1/credits/balance）。
   *
   * 错误处理：request.ts 拦截器已经 reject 标准 Error，这里捕获后写入
   * `balanceError`。不重抛，因为 UI 层读 store state 而非 await 本函数。
   */
  async function fetchBalance(): Promise<void> {
    balanceLoading.value = true
    balanceError.value = null
    try {
      const res = await getCreditBalance()
      // request 拦截器会把 body 解成 `{ code, message, data }`；拿 data
      balance.value = (res as unknown as { data: QuotaBreakdown }).data ?? null
    } catch (e) {
      balanceError.value = e instanceof Error ? e.message : '获取余额失败'
      balance.value = null
    } finally {
      balanceLoading.value = false
    }
  }

  /**
   * 拉取 estimate（POST /v1/credits/estimate）。
   *
   * @param operation - sop_run / sop_chat / salesrag_chat / profile_analysis / ...
   * @param referenceId - 业务 ID（sop_template_id / session_id / ...），见 spec §4.3
   */
  async function fetchEstimate(operation: string, referenceId: string): Promise<void> {
    estimateLoading.value = true
    estimateError.value = null
    try {
      const res = await estimateCredits(operation, referenceId)
      estimate.value = (res as unknown as { data: EstimateResp }).data ?? null
    } catch (e) {
      estimateError.value = e instanceof Error ? e.message : '估算失败'
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
    // getters
    billingMode,
    totalRemain,
    // actions
    fetchBalance,
    fetchEstimate,
    reset
  }
})
