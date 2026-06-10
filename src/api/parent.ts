/**
 * 父账户帮子账户开通会员 API（credits-system Q2 / gap-fill UX revision）
 *
 * B2B2C 模式下，C 端不能自购会员。父账户在"客户管理"页通过 action 菜单的
 * "开通会员"弹窗调用此接口——开通完全免费，费用按月对公结算，不走支付流程。
 *
 * 后端路由：POST /v1/users/children/:child_id/grant-membership
 */
import request from './request'
import type { ApiResponse } from './request'

/**
 * 子账户信息（父账户视角，listChildren 响应元素）。
 */
export interface ChildUser {
  id: number
  username: string
  user_tier: string
  tier_expires?: string | null
  billing_mode?: string
}

/**
 * 获取当前父账户下所有子账户列表。
 *
 * 后端路由：GET /v1/users/children
 */
export function listChildren(): Promise<ApiResponse<ChildUser[]>> {
  return request.get('/v1/users/children')
}

/** 会员产品类型：trial = 体验包，monthly = 月度会员。 */
export type MembershipProductType = 'trial' | 'monthly'

/**
 * 帮子账户开通会员的请求体。
 *
 * - `product_type='trial'`：体验会员，固定 3 天有效期，不使用 months
 * - `product_type='monthly'`：高级会员，months 必填（1-12）
 * - `reason`：开通原因，可选，进 action_log 供 B2B 月度结算报表审计
 */
export interface GrantMembershipReq {
  product_type: MembershipProductType
  /** 月数，仅在 product_type='monthly' 时必填，取值 1-12。 */
  months?: number
  /** 开通原因，可选。 */
  reason?: string
}

/**
 * 帮子账户开通会员的响应体（最小字段，按后端实际为准）。
 */
export interface GrantMembershipResp {
  /** 开通成功后子账户最新 tier（'trial' | 'standard'）。 */
  user_tier?: string
  /** 会员到期时间 ISO 字符串。 */
  tier_expires?: string
  /** 可选：后端文本消息。 */
  message?: string
}

/**
 * 父账户为指定子账户开通会员。
 *
 * @param childId 子账户用户 ID
 * @param req     产品类型 + 月数 + 原因
 */
export function grantChildMembership(
  childId: number | string,
  req: GrantMembershipReq
): Promise<ApiResponse<GrantMembershipResp>> {
  return request.post(`/v1/users/children/${childId}/grant-membership`, req)
}

/**
 * GrantResponse — POST /v1/users/children/:child_id/grant-membership 响应（Task 10 实际实现）
 */
export interface GrantResponse {
  child_user_id: number
  product_type: string // "trial" or "monthly"
  event_id: number
  event_type: string // "trial_granted" / "sub_granted" / "sub_renewed"
  expires_at: string
  months?: number
}

/**
 * 父账户为指定子账户开通会员（带幂等 Key）。
 *
 * 使用 generateIdempotencyKey() 生成 key，防止网络重试造成重复开通。
 *
 * @param childId        子账户用户 ID
 * @param body           产品类型 + 月数
 * @param idempotencyKey RFC 4122 v4 UUID（来自 generateIdempotencyKey()）
 */
export const grantMembership = (
  childId: number,
  body: { product_type: MembershipProductType; months?: number },
  idempotencyKey: string
): Promise<ApiResponse<GrantResponse>> =>
  request.post(`/v1/users/children/${childId}/grant-membership`, body, {
    headers: { 'Idempotency-Key': idempotencyKey }
  })

// ---------------------------------------------------------------------------
// 父账户自助费用对账（parent self-service billing report）
// 后端路由：GET /v1/users/me/billing-report?month=YYYY-MM
// ---------------------------------------------------------------------------

/** 账单明细行：子账户单次开通记录。 */
export interface ParentBillingDetail {
  child_user_id: number
  child_username: string
  /** 子账户昵称；可能为空字符串。 */
  child_nickname: string
  /** 产品类型：trial = 体验包，monthly = 月度会员。 */
  product_type: MembershipProductType
  /** 开通月数；trial 时为 0。 */
  months: number
  /** 金额，单位：分（cents）。 */
  amount_cents: number
  /** 开通时间，ISO 8601 字符串。 */
  granted_at: string
}

/** 父账户按月账单汇总。 */
export interface ParentBillingReport {
  /** 账单月份，格式 YYYY-MM。 */
  month: string
  parent_user_id: number
  /** 当月开通总笔数。 */
  grants_count: number
  /** 当月合计金额，单位：分（cents）。 */
  total_amount_cents: number
  details: ParentBillingDetail[]
}

/**
 * 父账户自助费用对账：按月查询当前登录父账户名下子账号的开通明细。
 *
 * @param month 账单月份，格式 YYYY-MM（如 "2026-06"）
 */
export const getParentBillingReport = (month: string): Promise<ApiResponse<ParentBillingReport>> =>
  request.get('/v1/users/me/billing-report', { params: { month } })
