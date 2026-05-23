// Unit tests for src/stores/marketplace.ts.
// Mocks @/api/marketplace to verify store action → state updates without
// actually hitting axios. Pattern mirrors src/stores/__tests__/agentChat.spec.ts.

import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { useMarketplaceStore } from '../marketplace'
import type {
  MarketplaceItem,
  MarketplaceItemDetail,
  MarketplaceListResponse,
  MySubscriptionsResponse,
  SanitizePreviewResponse,
  SubscribeResponse,
  SubscriptionItem
} from '@/types/marketplace'

const fixtureItem: MarketplaceItem = {
  id: 1,
  name: '销售调研',
  description: '调研工具脱敏后的模板',
  publisher_user_id: 10,
  source_skill_id: 100,
  category_tags: ['销售'],
  is_public: true,
  is_platform_recommended: false,
  subscribe_count: 5,
  created_at: '2026-05-24T10:00:00Z',
  updated_at: '2026-05-24T10:00:00Z'
}

const fixtureDetail: MarketplaceItemDetail = {
  ...fixtureItem,
  when_to_use: '客户对接前',
  sanitized_body_md: '# 调研步骤\n\n[姓名] [机构] ...',
  allowed_tools: ['web_search', 'file_read']
}

const fixtureSubItem: SubscriptionItem = {
  subscription: {
    id: 201,
    subscriber_user_id: 20,
    marketplace_id: 1,
    cloned_skill_id: 999,
    subscribed_at: '2026-05-24T11:00:00Z'
  },
  marketplace: fixtureItem,
  agent_count: 2
}

// Mock the api module — vi.mock is hoisted to top, so it runs before imports above.
vi.mock('@/api/marketplace', () => ({
  listMarketplace: vi.fn(
    async (): Promise<MarketplaceListResponse> => ({
      list: [fixtureItem],
      total: 1,
      page: 1,
      page_size: 20
    })
  ),
  getMarketplace: vi.fn(async (): Promise<MarketplaceItemDetail> => fixtureDetail),
  subscribeMarketplace: vi.fn(
    async (): Promise<SubscribeResponse> => ({
      cloned_skill_id: 999,
      subscription_id: 201
    })
  ),
  unsubscribeMarketplace: vi.fn(async () => undefined),
  listMySubscriptions: vi.fn(
    async (): Promise<MySubscriptionsResponse> => ({
      list: [fixtureSubItem],
      total: 1,
      page: 1,
      page_size: 20
    })
  ),
  sanitizePreview: vi.fn(
    async (): Promise<SanitizePreviewResponse> => ({
      sanitized_body_md: '# 调研步骤\n\n[姓名]',
      stages_applied: ['regex', 'llm'],
      llm_tokens: { prompt: 1200, completion: 800 }
    })
  ),
  publishMarketplace: vi.fn(async (): Promise<MarketplaceItem> => fixtureItem),
  unpublishMarketplace: vi.fn(async () => undefined),
  setRecommended: vi.fn(async () => undefined)
}))

describe('useMarketplaceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('fetchList populates items/total + clears loading', async () => {
    const store = useMarketplaceStore()
    expect(store.loading).toBe(false)
    expect(store.isEmpty).toBe(true)

    await store.fetchList()
    expect(store.items).toHaveLength(1)
    expect(store.total).toBe(1)
    expect(store.page).toBe(1)
    expect(store.isEmpty).toBe(false)
    expect(store.loading).toBe(false)
    expect(store.error).toBe('')
  })

  it('resetQuery wipes query state back to defaults', () => {
    const store = useMarketplaceStore()
    store.queryQ = '销售'
    store.queryCategory = '数据分析'
    store.querySort = 'popular'
    store.page = 5

    store.resetQuery()
    expect(store.queryQ).toBe('')
    expect(store.queryCategory).toBe('')
    expect(store.querySort).toBe('recommended')
    expect(store.page).toBe(1)
  })

  it('fetchDetail loads currentItem', async () => {
    const store = useMarketplaceStore()
    await store.fetchDetail(1)
    expect(store.currentItem?.id).toBe(1)
    expect(store.currentItem?.sanitized_body_md).toContain('调研步骤')
    expect(store.currentLoading).toBe(false)
  })

  it('subscribe returns ids + optimistically increments count on currentItem', async () => {
    const store = useMarketplaceStore()
    await store.fetchDetail(1)
    expect(store.currentItem?.subscribe_count).toBe(5)

    const res = await store.subscribe(1)
    expect(res.cloned_skill_id).toBe(999)
    expect(res.subscription_id).toBe(201)
    expect(store.currentItem?.subscribe_count).toBe(6)
  })

  it('subscribe does NOT increment count when currentItem is unrelated', async () => {
    const store = useMarketplaceStore()
    await store.fetchDetail(1)
    const before = store.currentItem?.subscribe_count

    await store.subscribe(2) // different marketplace id
    expect(store.currentItem?.subscribe_count).toBe(before)
  })

  it('unsubscribe drops the row from mySubscriptions and decrements count', async () => {
    const store = useMarketplaceStore()
    await store.fetchMySubscriptions()
    expect(store.mySubscriptions).toHaveLength(1)
    expect(store.mySubscriptionsTotal).toBe(1)
    await store.fetchDetail(1)
    expect(store.currentItem?.subscribe_count).toBe(5)

    await store.unsubscribe(1)
    expect(store.mySubscriptions).toHaveLength(0)
    expect(store.mySubscriptionsTotal).toBe(0)
    expect(store.currentItem?.subscribe_count).toBe(4)
  })

  it('unsubscribe count does not go below zero', async () => {
    const store = useMarketplaceStore()
    await store.fetchDetail(1)
    // Set count to 0 manually.
    store.currentItem!.subscribe_count = 0

    await store.unsubscribe(1)
    expect(store.currentItem?.subscribe_count).toBe(0)
  })

  it('sanitizePreview populates result + clears prior error', async () => {
    const store = useMarketplaceStore()
    store.sanitizePreviewError = 'stale error'
    await store.sanitizePreview(100)
    expect(store.sanitizePreviewResult?.sanitized_body_md).toContain('调研')
    expect(store.sanitizePreviewResult?.stages_applied).toEqual(['regex', 'llm'])
    expect(store.sanitizePreviewResult?.llm_tokens.prompt).toBe(1200)
    expect(store.sanitizePreviewError).toBe('')
  })

  it('clearSanitizePreview resets preview state', async () => {
    const store = useMarketplaceStore()
    await store.sanitizePreview(100)
    expect(store.sanitizePreviewResult).not.toBeNull()
    store.clearSanitizePreview()
    expect(store.sanitizePreviewResult).toBeNull()
    expect(store.sanitizePreviewError).toBe('')
  })

  it('publish clears preview result on success', async () => {
    const store = useMarketplaceStore()
    await store.sanitizePreview(100)
    expect(store.sanitizePreviewResult).not.toBeNull()

    await store.publish({
      skill_id: 100,
      category_tags: ['销售'],
      confirmed_sanitized_body: '# 调研步骤\n\n[姓名]'
    })
    expect(store.sanitizePreviewResult).toBeNull()
    expect(store.publishing).toBe(false)
    expect(store.publishError).toBe('')
  })

  it('unpublish flips currentItem.is_public when matching id', async () => {
    const store = useMarketplaceStore()
    await store.fetchDetail(1)
    expect(store.currentItem?.is_public).toBe(true)

    await store.unpublish(1)
    expect(store.currentItem?.is_public).toBe(false)
  })

  it('setItemRecommended flips currentItem.is_platform_recommended', async () => {
    const store = useMarketplaceStore()
    await store.fetchDetail(1)
    expect(store.currentItem?.is_platform_recommended).toBe(false)

    await store.setItemRecommended(1, true)
    expect(store.currentItem?.is_platform_recommended).toBe(true)
  })

  it('fetchMySubscriptions populates list + total', async () => {
    const store = useMarketplaceStore()
    expect(store.mySubsEmpty).toBe(true)

    await store.fetchMySubscriptions()
    expect(store.mySubscriptions).toHaveLength(1)
    expect(store.mySubscriptions[0].agent_count).toBe(2)
    expect(store.mySubsEmpty).toBe(false)
  })
})
