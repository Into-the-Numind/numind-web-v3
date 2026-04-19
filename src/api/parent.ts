/**
 * 父账户 / 子账户会员管理 API（credits-system Q2）
 *
 * B2B2C 模式下，C 端不能自购会员。父账户（parent_user_id === null）在
 * 用户端（非 admin）帮子账户开通会员。产品类型包含 trial（固定 3 天）
 * 和 monthly（1-12 月可选），开通完全免费（走 reason 审计流程而非支付）。
 *
 * 后端路由：
 *   - GET  /v1/users/children                                 列出父账户下子账户
 *   - POST /v1/users/children/:child_id/grant-membership      帮子账户开通会员
 *
 * 注：`src/api/customers.ts` 中的 `fetchSubUsers` 走 /v1/customers/sub-users
 * 路由，是既有的"客户管理"视图专用。此处 listChildren 走 /v1/users/children
 * 路由，是 Q2 新增的会员开通专用入口（后端可能是同一套子账户但不同 scope）。
 */
import request from './request'
import type { ApiResponse } from './request'

/**
 * 子账户信息（会员开通视图所需的最小字段集合）。
 * 后端实际返回字段可能更多，以可选属性兜底。
 */
export interface ChildUser {
  id: number | string
  username: string
  nickname?: string
  phone?: string
  user_tier?: string
  tier_expires?: string
  created_at?: string
  [key: string]: unknown
}

/**
 * 帮子账户开通会员的请求体。
 *
 * - `product_type='trial'`：体验会员，固定 3 天有效期，不使用 months
 * - `product_type='monthly'`：普通月度会员，months 必填（1-12）
 * - `reason`：开通原因，后端强制记录进 TierChangeLog 供审计
 */
export interface GrantMembershipReq {
  product_type: 'trial' | 'monthly'
  /** 月数，仅在 product_type='monthly' 时必填，取值 1-12。 */
  months?: number
  /** 开通原因，必填。 */
  reason: string
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
 * 列出父账户下所有子账户（用于会员开通视图）。
 *
 * 后端路由未列时，约定使用 `/v1/users/children`。后端若尚未实现该 endpoint，
 * 前端会拿到 404 或业务错误，由调用方做 error toast。
 */
export function listChildren(): Promise<ApiResponse<ChildUser[]>> {
  return request.get('/v1/users/children')
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
