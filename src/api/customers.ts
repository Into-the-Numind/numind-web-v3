import request from './request'
import type { ApiResponse } from './request'

export interface CustomerStatistics {
  total_sub_users: number
  active_sub_users: number
  total_templates: number
  total_runs: number
}

export interface SubUser {
  id: number | string
  username: string
  nickname?: string
  phone?: string
  user_tier?: string
  tier_expires?: string
  credit_balance?: number
  credit_expires?: string
  remaining_sop_runs?: number
  template_count?: number
  total_sop_runs?: number
  monthly_sop_runs?: number
  created_at?: string
  [key: string]: any
}

export interface TemplateItem {
  id: number | string
  name: string
  description?: string
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
