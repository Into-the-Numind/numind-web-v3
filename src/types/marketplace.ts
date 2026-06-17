// Marketplace types — parent-account cross-tenant Skill publish/browse/subscribe UI.
// Backend source: numind-server/internal/pkg/model/skill_marketplace.go +
// internal/numind/biz/marketplace/{service,sanitize,types}.go
//
// agent-mode-v2-skill-marketplace (S4 T08).
// Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-marketplace-design.md §4, §8

import type { Skill } from './skill'

// ============================================================
// Marketplace item (browse list + detail)
// ============================================================

/** 浏览页 / 我的订阅列表中显示的 marketplace 项目（精简）。 */
export interface MarketplaceItem {
  id: number
  name: string
  description: string
  publisher_user_id: number
  source_skill_id: number
  category_tags: string[]
  is_public: boolean
  is_platform_recommended: boolean
  subscribe_count: number
  created_at: string
  updated_at: string
}

/** 详情页用 — 含完整 sanitized body + when_to_use + allowed_tools。 */
export interface MarketplaceItemDetail extends MarketplaceItem {
  when_to_use: string
  sanitized_body_md: string
  allowed_tools: string[]
}

/** Subscription 行 — 订阅方租户里的 subscription record。 */
export interface SkillSubscription {
  id: number
  subscriber_user_id: number
  marketplace_id: number
  /**
   * 引用模式（skill-3tier-visibility T4，forward-only）：发布者原始 skill id（= marketplace.source_skill_id）。
   * 新订阅 > 0；legacy clone 行 = 0。一行 source_skill_id 与 cloned_skill_id 恰好一个非零。
   */
  source_skill_id: number
  /** 订阅时刻 source skill 的 Version 快照，用于「原版已更新/已删除」提示；0 = 未知（legacy）。 */
  subscribed_version: number
  /** @deprecated legacy clone 模式：副本 skill id。新引用订阅恒为 0。 */
  cloned_skill_id: number
  subscribed_at: string
}

/** My subscriptions 列表的单行（biz hydrate AgentCount） */
export interface SubscriptionItem {
  subscription: SkillSubscription
  marketplace: MarketplaceItem
  agent_count: number
}

// ============================================================
// Request / response shapes
// ============================================================

/** GET /v1/marketplace/list query 参数。 */
export interface BrowseQuery {
  q?: string
  category?: string
  sort?: 'recommended' | 'recent' | 'popular'
  page?: number
  page_size?: number
}

/** GET /v1/marketplace/list response data. */
export interface MarketplaceListResponse {
  list: MarketplaceItem[]
  total: number
  page: number
  page_size: number
}

/** GET /v1/marketplace/my-subscriptions response data. */
export interface MySubscriptionsResponse {
  list: SubscriptionItem[]
  total: number
  page: number
  page_size: number
}

/** POST /v1/marketplace/sanitize-preview request + response. */
export interface SanitizePreviewRequest {
  skill_id: number
}

export interface SanitizePreviewResponse {
  sanitized_body_md: string
  stages_applied: string[]
  llm_tokens: {
    prompt: number
    completion: number
  }
}

/** POST /v1/marketplace/publish request body. */
export interface PublishRequest {
  skill_id: number
  category_tags: string[]
  confirmed_sanitized_body: string
}

/**
 * POST /v1/marketplace/:id/subscribe response（skill-3tier-visibility T4，引用模式）。
 * 订阅不再克隆副本到我的租户，而是建立引用指针：返回 subscription_id + source_skill_id。
 * cloned_skill_id 字段已从新响应移除。
 */
export interface SubscribeResponse {
  subscription_id: number
  source_skill_id: number
}

/** Re-export Skill so callers (Publish flow) get the source-skill type for diff context. */
export type { Skill }
