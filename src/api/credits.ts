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

export interface CreditPackageItem {
  id: number
  type: string // trial/subscription/booster
  total_credits: number
  remain_credits: number
  activated_at: string
  expires_at: string
  status: string // active/expired/revoked
  order_id?: number
  created_at: string
}

export interface ListPackagesResp {
  list: CreditPackageItem[]
  total: number
}

export function getCreditBalance() {
  return request.get<QuotaBreakdown>('/v1/credits/balance')
}

export function estimateCredits(operation: string, reference_id: string) {
  return request.post<EstimateResp>('/v1/credits/estimate', { operation, reference_id })
}

export function listPackages(params: {
  page?: number
  page_size?: number
  status?: string
  type?: string
  sort?: string
}) {
  return request.get<ListPackagesResp>('/v1/credits/packages', { params })
}
