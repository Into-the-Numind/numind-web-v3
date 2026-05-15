import request from './request'

// See spec: numind-server/docs/superpowers/specs/2026-04-18-credits-system-design.md §2.11.1 + §4.2.1

export interface QuotaBreakdown {
  // 现有字段（保留不动，非破坏）
  balance: number
  sub_total: number
  sub_remain: number
  booster_total: number
  booster_remain: number
  // v3 新增字段（可选，老代码不读即可）
  billing_mode?: 'credits' | 'legacy_tier'
  remaining_runs?: number | null // null = premium unlimited
  monthly_limit?: number | null
  sub_expires_at?: string // credits 月底过期展示
  booster_earliest_expires_at?: string // 最早过期 booster
}

/**
 * BalanceDTO — GET /v1/credits/balance 后端实际响应（Task 12 §3.7）
 *
 * `membership_state` 是后端已计算的字符串枚举（"free" / "trial" / "pro"），
 * 直接消费；无需前端二次推断。
 */
export interface BalanceDTO {
  trial_remaining: number
  cycle_remaining: number
  cycle_end?: string // ISO 8601 with TZ
  booster_total: number
  booster_usable: number // 冻结时 = 0；解冻时 = booster_total
  membership_state: 'free' | 'trial' | 'pro'
  sub_expires_at?: string
  trial_expires_at?: string
}

/**
 * OrderResponse — POST /v1/orders 后端实际返回（model.Order JSON 序列化）。
 *
 * 字段名按 GORM JSON tag 对齐（非 spec 旧定义）：主键叫 `id` 而不是 `order_id`；
 * wechat 支付的扫码 URL 叫 `code_url`；alipay 不通过此字段，走单独 endpoint。
 */
export interface OrderResponse {
  id: number
  order_no: string
  user_id: number
  payer_id: number
  product_type: 'booster'
  quantity: number
  amount: number // 单位：分
  pay_channel: 'wechat' | 'alipay'
  pay_status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired'
  code_url?: string // wechat 扫码 URL（pay_channel='wechat' 时存在）
  expired_at: string
  created_at: string
  updated_at: string
}

export interface OrderStatus {
  order_id: number
  status: string // pending / paid / failed / cancelled
  paid_at?: string
  amount_cents: number
  product_type: string // "booster"
  quantity?: number // months 字段也叫 quantity（spec §5.10）
}

export interface EstimateResp {
  total_estimated_credits: number // SOP 整单估算（N 个 node 之和）
  first_node_estimate?: number // 首 node 估算
  node_count?: number // N（仅 sop_run 有效）
  sufficient: boolean
  skip_deduction: boolean // legacy_tier=true
  reason?: string // legacy_tier 次数不足原因
  balance: QuotaBreakdown
  coefficient_id: number
}

// T9: CreditPackageItem / ListPackagesResp / listPackages deleted —
// /v1/credits/packages route removed from backend in T9 (had 0 frontend callers
// even before deletion; credit_package table will be DROPped in T11).

export function getCreditBalance() {
  return request.get<QuotaBreakdown>('/v1/credits/balance')
}

export function estimateCredits(operation: string, reference_id: string) {
  return request.post<EstimateResp>('/v1/credits/estimate', { operation, reference_id })
}

/**
 * GET /v1/credits/balance → BalanceDTO（Task 12 §3.7 实际 schema）
 *
 * 新版取余额接口，使用 BalanceDTO 取代旧的 QuotaBreakdown。
 * 旧版 getCreditBalance() 保留供遗留代码使用。
 */
export const getBalance = () => request.get<BalanceDTO>('/v1/credits/balance')

/**
 * POST /v1/orders — 创建 booster 加量包订单
 *
 * @param params  订单参数
 * @param idempotencyKey  RFC 4122 v4 UUID（来自 generateIdempotencyKey()）
 */
export const placeOrder = (
  params: {
    user_id: number
    product_type: 'booster'
    quantity: number
    pay_channel: 'wechat' | 'alipay'
  },
  idempotencyKey: string
) =>
  request.post<OrderResponse>('/v1/orders', params, {
    headers: { 'Idempotency-Key': idempotencyKey }
  })

/**
 * GET /v1/orders/:id/status — 查询订单状态（轮询用）
 */
export const getOrderStatus = (orderId: number) =>
  request.get<OrderStatus>(`/v1/orders/${orderId}/status`)
