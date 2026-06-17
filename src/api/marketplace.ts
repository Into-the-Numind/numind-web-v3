// API wrappers for /v1/marketplace/* (8 user) + /v1/admin/marketplace/* (1 admin).
// Backend: numind-server feature agent-mode-v2-skill-marketplace (v2 #3).
// Parent-account only — child accounts receive HTTP 403 from backend biz layer
// (errno Marketplace.ChildAccountForbidden). 401 由 request.ts interceptor 处理.
//
// Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-marketplace-design.md §4, §8.2
//
// Implementation note: web-v3 axios `request` instance has a response interceptor
// that unwraps `{code, message, data}` and returns the body. TypeScript still
// sees axios's `AxiosResponse<T>` type, so we cast through `as unknown as { data }`
// — matches the established pattern in src/api/skill.ts.

import request from './request'
import type {
  MarketplaceItem,
  MarketplaceItemDetail,
  MarketplaceListResponse,
  MySubscriptionsResponse,
  BrowseQuery,
  SanitizePreviewRequest,
  SanitizePreviewResponse,
  PublishRequest,
  SubscribeResponse
} from '@/types/marketplace'

// 1. POST /v1/marketplace/sanitize-preview — 预览脱敏结果（不写库）
export const sanitizePreview = async (
  payload: SanitizePreviewRequest
): Promise<SanitizePreviewResponse> => {
  const res = await request.post('/v1/marketplace/sanitize-preview', payload)
  return (res as unknown as { data: SanitizePreviewResponse }).data
}

// 2. POST /v1/marketplace/publish — 发布 Skill 到市场
export const publishMarketplace = async (payload: PublishRequest): Promise<MarketplaceItem> => {
  const res = await request.post('/v1/marketplace/publish', payload)
  return (res as unknown as { data: MarketplaceItem }).data
}

// 3. POST /v1/marketplace/:id/unpublish — 下架（soft, is_public=0）
export const unpublishMarketplace = async (id: number): Promise<void> => {
  await request.post(`/v1/marketplace/${id}/unpublish`)
}

// 4. GET /v1/marketplace/list — 浏览（FULLTEXT 搜索 + 分类 + 排序 + 分页）
export const listMarketplace = async (
  params: BrowseQuery = {}
): Promise<MarketplaceListResponse> => {
  const res = await request.get('/v1/marketplace/list', { params })
  return (res as unknown as { data: MarketplaceListResponse }).data
}

// 5. GET /v1/marketplace/my-subscriptions — 我的订阅
// Gin path order: 后端在 :id 前注册，前端 URL 无歧义。
export const listMySubscriptions = async (
  params: { page?: number; page_size?: number } = {}
): Promise<MySubscriptionsResponse> => {
  const res = await request.get('/v1/marketplace/my-subscriptions', { params })
  return (res as unknown as { data: MySubscriptionsResponse }).data
}

// 6. GET /v1/marketplace/:id — 详情（含 sanitized_body_md）
export const getMarketplace = async (id: number): Promise<MarketplaceItemDetail> => {
  const res = await request.get(`/v1/marketplace/${id}`)
  return (res as unknown as { data: MarketplaceItemDetail }).data
}

// 7. POST /v1/marketplace/:id/subscribe — 订阅 = 引用模式（skill-3tier-visibility T4）
//    不再克隆副本进我的租户；建立指向市场源的引用指针。
//    返回 {subscription_id, source_skill_id}（cloned_skill_id 已移除）。
export const subscribeMarketplace = async (id: number): Promise<SubscribeResponse> => {
  const res = await request.post(`/v1/marketplace/${id}/subscribe`)
  return (res as unknown as { data: SubscribeResponse }).data
}

// 8. DELETE /v1/marketplace/:id/unsubscribe — 取消订阅（删 subscription 引用行）
//    引用模式：不持有租户本地副本技能，仅删除引用关系即可。
//    （legacy clone 订阅由后端按 cloned_skill_id>0 走老的软删副本路径。）
export const unsubscribeMarketplace = async (id: number): Promise<void> => {
  await request.delete(`/v1/marketplace/${id}/unsubscribe`)
}

// admin endpoint POST /v1/admin/marketplace/:id/recommend 不在 numind-web-v3 范围
// (spec §1 Out of scope: "admin-web 不动"). T7 reviewer P1: 之前 setRecommended
// 用 user_token axios instance 调 admin endpoint 会运行时 401 — 删除. 由
// numind-admin-web 单独实现使用 admin_token.
