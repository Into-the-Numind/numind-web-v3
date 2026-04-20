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
 * 帮子账户开通会员的请求体。
 *
 * - `product_type='trial'`：体验会员，固定 3 天有效期，不使用 months
 * - `product_type='monthly'`：高级会员，months 必填（1-12）
 * - `reason`：开通原因，可选，进 action_log 供 B2B 月度结算报表审计
 */
export interface GrantMembershipReq {
  product_type: 'trial' | 'monthly'
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
