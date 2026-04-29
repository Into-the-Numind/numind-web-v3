import request from './request'
import type { ApiResponse } from './request'

export interface CustomerStatistics {
  total_sub_users: number
  active_sub_users: number
  total_templates: number
  total_runs: number
}

/**
 * 子账户 membership_state（credits 模式下的会员状态详情）。
 * 来自 GET /v1/users/children 响应，隐私边界：不含 booster 字段。
 */
export interface MembershipState {
  has_active_trial: boolean
  has_active_subscription: boolean
  trial_expires_at?: string | null
  subscription_expires_at?: string | null
}

export interface SubUser {
  id: number | string
  /** 后端 ListSubUsers 返回的 user_id 字段（与 id 二选一）。 */
  user_id?: number | string
  username: string
  nickname?: string
  phone?: string
  user_tier?: string
  tier_expires?: string
  credit_balance?: number
  credit_expires?: string
  remaining_sop_runs?: number
  template_count?: number
  authorized_templates?: number
  total_sop_runs?: number
  monthly_sop_runs?: number
  created_at?: string
  /** credits 模式下的会员状态（含试用 + Pro 订阅双轨）。 */
  membership_state?: MembershipState | null
  /** 该账户是否已使用过体验包（true → 体验 tab 置灰）。 */
  has_used_trial?: boolean
  /** credits 模式下当前周期剩余积分。 */
  cycle_remaining?: number
  [key: string]: any
}

export interface TemplateItem {
  id: number | string
  name: string
  description?: string
  [key: string]: any
}

export interface ChatbotItem {
  id: number | string
  name: string
  description?: string
  status?: string
  [key: string]: any
}

export interface RegisterSubUserParams {
  username: string
  password: string
  nickname?: string
  tier?: string
  months?: number
}

// 获取统计数据
export const fetchStatistics = (): Promise<ApiResponse<CustomerStatistics>> => {
  return request.get('/v1/customers/statistics')
}

// 获取子用户列表
export const fetchSubUsers = (offset = 0, limit = 100): Promise<ApiResponse<SubUser[]>> => {
  return request.get('/v1/customers/sub-users', {
    params: { offset, limit }
  })
}

// 注册子用户
export const registerSubUser = (data: RegisterSubUserParams): Promise<ApiResponse<any>> => {
  return request.post('/v1/customers', data)
}

// 检查用户名可用性
export const checkUsername = (username: string): Promise<ApiResponse<{ available: boolean }>> => {
  return request.get('/v1/customers/check-username', {
    params: { username }
  })
}

// 获取用户已授权模板
export const fetchUserTemplates = (
  userId: number | string
): Promise<ApiResponse<TemplateItem[]>> => {
  return request.get(`/v1/customers/sub-users/${userId}/templates`)
}

// 授予模板权限
export const grantTemplates = (
  userId: number | string,
  templateIds: (number | string)[]
): Promise<ApiResponse<any>> => {
  return request.post(`/v1/customers/sub-users/${userId}/templates`, {
    template_ids: templateIds
  })
}

// 撤销模板权限
export const revokeTemplates = (
  userId: number | string,
  templateIds: (number | string)[]
): Promise<ApiResponse<any>> => {
  return request.delete(`/v1/customers/sub-users/${userId}/templates`, {
    data: { template_ids: templateIds }
  })
}

// 批量授权模板
export const batchGrantTemplates = (data: {
  user_ids: (number | string)[]
  template_ids: (number | string)[]
}): Promise<ApiResponse<any>> => {
  return request.post('/v1/customers/batch/grant-templates', data)
}

// 批量撤销模板
export const batchRevokeTemplates = (data: {
  user_ids: (number | string)[]
  template_ids: (number | string)[]
}): Promise<ApiResponse<any>> => {
  return request.post('/v1/customers/batch/revoke-templates', data)
}

// 升级子用户会员等级
export const updateSubUserTier = (
  userId: number | string,
  data: { tier: string; months: number }
): Promise<ApiResponse<{ message: string }>> => {
  return request.put(`/v1/customers/sub-users/${userId}/tier`, data)
}

// 获取所有可用模板（权限弹窗一次性拉全量，显式传 limit=500 避免默认分页截断）
export const fetchAllTemplates = (): Promise<ApiResponse<TemplateItem[]>> => {
  return request.get('/v1/sop/templates', { params: { limit: 500 } })
}

// 获取子用户功能权限
export const fetchUserFeatures = (
  userId: number | string
): Promise<ApiResponse<{ features: string[] }>> => {
  return request.get(`/v1/customers/sub-users/${userId}/features`)
}

// 授予功能权限
export const grantFeatures = (
  userId: number | string,
  features: string[]
): Promise<ApiResponse<any>> => {
  return request.post(`/v1/customers/sub-users/${userId}/features`, { features })
}

// 撤销功能权限
export const revokeFeatures = (
  userId: number | string,
  features: string[]
): Promise<ApiResponse<any>> => {
  return request.delete(`/v1/customers/sub-users/${userId}/features`, {
    data: { features }
  })
}

// 获取父账号所有已发布 chatbot（复用既有 C 端列表接口）
// /v1/chatbot/list 实际响应形状可能是 { list: ChatbotItem[], total } 或 { chatbots: ChatbotItem[] } 或直接 ChatbotItem[]
// 定义 union type 反映多态性，避免 any；消费端做 defensive narrowing
export const fetchAllChatbots = (): Promise<
  ApiResponse<
    | { list: ChatbotItem[]; total?: number }
    | { chatbots: ChatbotItem[]; total?: number }
    | ChatbotItem[]
  >
> => {
  return request.get('/v1/chatbot/list')
}

// 获取子用户已授权 chatbot —— 响应 { chatbots: [{id,name,...}], total }
export const fetchUserChatbots = (
  userId: number | string
): Promise<ApiResponse<{ chatbots: ChatbotItem[]; total: number }>> => {
  return request.get(`/v1/customers/sub-users/${userId}/chatbots`)
}

// 授予 chatbot 权限
export const grantChatbots = (
  userId: number | string,
  chatbotIds: (number | string)[]
): Promise<ApiResponse<any>> => {
  return request.post(`/v1/customers/sub-users/${userId}/chatbots`, {
    chatbot_ids: chatbotIds
  })
}

// 撤销 chatbot 权限
export const revokeChatbots = (
  userId: number | string,
  chatbotIds: (number | string)[]
): Promise<ApiResponse<any>> => {
  return request.delete(`/v1/customers/sub-users/${userId}/chatbots`, {
    data: { chatbot_ids: chatbotIds }
  })
}

// 批量授权 chatbot
export const batchGrantChatbots = (data: {
  user_ids: (number | string)[]
  chatbot_ids: (number | string)[]
}): Promise<ApiResponse<any>> => {
  return request.post('/v1/customers/batch/grant-chatbots', data)
}

// 批量撤销 chatbot
export const batchRevokeChatbots = (data: {
  user_ids: (number | string)[]
  chatbot_ids: (number | string)[]
}): Promise<ApiResponse<any>> => {
  return request.post('/v1/customers/batch/revoke-chatbots', data)
}
