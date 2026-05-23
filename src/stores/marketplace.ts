// Pinia store for parent-account marketplace browse/subscribe/publish flows.
// Setup syntax (per numind-web-v3 CLAUDE.md §2 / .claude/rules/frontend-state.md §1).
//
// agent-mode-v2-skill-marketplace (S4 T08).
// Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-marketplace-design.md §8.1
//
// Three flows:
//   - Browse:  fetchList → items / total
//   - Detail:  fetchDetail → currentItem (含 sanitized_body_md 完整 markdown)
//   - Subscribe / Unsubscribe: 操作 currentItem 或 my-subscriptions 列表
//   - Publish: sanitizePreview(skillId) → sanitizePreviewResult → publish(req)
//             两步法支持前端 diff review gate

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

import {
  listMarketplace,
  getMarketplace,
  subscribeMarketplace,
  unsubscribeMarketplace,
  listMySubscriptions,
  sanitizePreview as apiSanitizePreview,
  publishMarketplace,
  unpublishMarketplace,
  setRecommended
} from '@/api/marketplace'
import type {
  MarketplaceItem,
  MarketplaceItemDetail,
  SubscriptionItem,
  BrowseQuery,
  PublishRequest,
  SanitizePreviewResponse
} from '@/types/marketplace'

export const useMarketplaceStore = defineStore('marketplace', () => {
  // --- Browse list state ---
  const items = ref<MarketplaceItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const error = ref('')

  // --- Browse query (UI 双向绑定 search 框 / category / sort) ---
  const queryQ = ref('')
  const queryCategory = ref('')
  const querySort = ref<'recommended' | 'recent' | 'popular'>('recommended')

  // --- Detail state ---
  const currentItem = ref<MarketplaceItemDetail | null>(null)
  const currentLoading = ref(false)
  const currentError = ref('')

  // --- My subscriptions state ---
  const mySubscriptions = ref<SubscriptionItem[]>([])
  const mySubscriptionsTotal = ref(0)
  const mySubscriptionsLoading = ref(false)
  const mySubscriptionsError = ref('')

  // --- Publish flow state (two-step: sanitize-preview then publish) ---
  const sanitizePreviewLoading = ref(false)
  const sanitizePreviewError = ref('')
  const sanitizePreviewResult = ref<SanitizePreviewResponse | null>(null)

  const publishing = ref(false)
  const publishError = ref('')

  // --- Shared saving flag (subscribe / unsubscribe / unpublish / setRecommended) ---
  const saving = ref(false)

  // --- Getters ---
  const isEmpty = computed(() => items.value.length === 0)
  const mySubsEmpty = computed(() => mySubscriptions.value.length === 0)

  // ===========================================================
  // Browse actions
  // ===========================================================

  async function fetchList(overrides: Partial<BrowseQuery> = {}) {
    loading.value = true
    error.value = ''
    try {
      const params: BrowseQuery = {
        q: queryQ.value,
        category: queryCategory.value,
        sort: querySort.value,
        page: page.value,
        page_size: pageSize.value,
        ...overrides
      }
      const res = await listMarketplace(params)
      items.value = res.list
      total.value = res.total
      page.value = res.page
      pageSize.value = res.page_size
    } catch (e) {
      error.value = (e as Error).message || '加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  function resetQuery() {
    queryQ.value = ''
    queryCategory.value = ''
    querySort.value = 'recommended'
    page.value = 1
  }

  // ===========================================================
  // Detail actions
  // ===========================================================

  async function fetchDetail(id: number) {
    currentLoading.value = true
    currentError.value = ''
    try {
      currentItem.value = await getMarketplace(id)
    } catch (e) {
      currentError.value = (e as Error).message || '加载失败'
      currentItem.value = null
      throw e
    } finally {
      currentLoading.value = false
    }
  }

  function clearCurrent() {
    currentItem.value = null
    currentError.value = ''
  }

  // ===========================================================
  // Subscribe / Unsubscribe actions
  // ===========================================================

  /**
   * Subscribe to a marketplace item. Returns the cloned skill id + subscription id
   * (spec §4.1 — note the field is subscription_id, not marketplace_id).
   * Locally updates currentItem.subscribe_count for optimistic UI; consumers can
   * refetchDetail if they need authoritative state.
   */
  async function subscribe(
    marketplaceID: number
  ): Promise<{ cloned_skill_id: number; subscription_id: number }> {
    saving.value = true
    try {
      const res = await subscribeMarketplace(marketplaceID)
      if (currentItem.value?.id === marketplaceID) {
        currentItem.value = {
          ...currentItem.value,
          subscribe_count: currentItem.value.subscribe_count + 1
        }
      }
      return res
    } finally {
      saving.value = false
    }
  }

  async function unsubscribe(marketplaceID: number) {
    saving.value = true
    try {
      await unsubscribeMarketplace(marketplaceID)
      if (currentItem.value?.id === marketplaceID) {
        currentItem.value = {
          ...currentItem.value,
          subscribe_count: Math.max(currentItem.value.subscribe_count - 1, 0)
        }
      }
      // Optimistically drop from my-subscriptions list if present.
      mySubscriptions.value = mySubscriptions.value.filter(
        (s) => s.marketplace.id !== marketplaceID
      )
      mySubscriptionsTotal.value = Math.max(mySubscriptionsTotal.value - 1, 0)
    } finally {
      saving.value = false
    }
  }

  // ===========================================================
  // My subscriptions actions
  // ===========================================================

  async function fetchMySubscriptions(params: { page?: number; page_size?: number } = {}) {
    mySubscriptionsLoading.value = true
    mySubscriptionsError.value = ''
    try {
      const res = await listMySubscriptions({ page: 1, page_size: 20, ...params })
      mySubscriptions.value = res.list
      mySubscriptionsTotal.value = res.total
    } catch (e) {
      mySubscriptionsError.value = (e as Error).message || '加载失败'
      throw e
    } finally {
      mySubscriptionsLoading.value = false
    }
  }

  // ===========================================================
  // Publish flow actions (two-step)
  // ===========================================================

  /**
   * Step 1: query backend for the sanitized body so the diff-review UI can render.
   * Stores SanitizePreviewResponse so the page reads sanitized_body_md +
   * stages_applied + llm_tokens.{prompt,completion}.
   *
   * Failure (LLM down → backend returns 503 Marketplace.SanitizeUnavailable) is
   * surfaced as sanitizePreviewError; UI disables the publish button until the
   * user retries successfully.
   */
  async function sanitizePreview(skillId: number) {
    sanitizePreviewLoading.value = true
    sanitizePreviewError.value = ''
    sanitizePreviewResult.value = null
    try {
      sanitizePreviewResult.value = await apiSanitizePreview({ skill_id: skillId })
    } catch (e) {
      sanitizePreviewError.value = (e as Error).message || '脱敏服务暂不可用，请稍后重试'
      throw e
    } finally {
      sanitizePreviewLoading.value = false
    }
  }

  function clearSanitizePreview() {
    sanitizePreviewResult.value = null
    sanitizePreviewError.value = ''
  }

  /**
   * Step 2: publish after the user confirms the diff. The page should pass
   * sanitizePreviewResult.value.sanitized_body_md as confirmed_sanitized_body.
   * Backend re-runs sanitize and compares within 5% delta tolerance (S2-D2);
   * mismatch surfaces as Marketplace.SanitizeConfirmationMismatch (422).
   */
  async function publish(req: PublishRequest): Promise<MarketplaceItem> {
    publishing.value = true
    publishError.value = ''
    try {
      const mp = await publishMarketplace(req)
      // After successful publish, clear the preview state so subsequent flows start clean.
      clearSanitizePreview()
      return mp
    } catch (e) {
      publishError.value = (e as Error).message || '发布失败'
      throw e
    } finally {
      publishing.value = false
    }
  }

  async function unpublish(marketplaceID: number) {
    saving.value = true
    try {
      await unpublishMarketplace(marketplaceID)
      if (currentItem.value?.id === marketplaceID) {
        currentItem.value = { ...currentItem.value, is_public: false }
      }
    } finally {
      saving.value = false
    }
  }

  async function setItemRecommended(marketplaceID: number, recommended: boolean) {
    saving.value = true
    try {
      await setRecommended(marketplaceID, recommended)
      if (currentItem.value?.id === marketplaceID) {
        currentItem.value = { ...currentItem.value, is_platform_recommended: recommended }
      }
    } finally {
      saving.value = false
    }
  }

  return {
    // browse list
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    queryQ,
    queryCategory,
    querySort,
    fetchList,
    resetQuery,
    isEmpty,
    // detail
    currentItem,
    currentLoading,
    currentError,
    fetchDetail,
    clearCurrent,
    // subscribe / unsubscribe
    saving,
    subscribe,
    unsubscribe,
    // my subscriptions
    mySubscriptions,
    mySubscriptionsTotal,
    mySubscriptionsLoading,
    mySubscriptionsError,
    fetchMySubscriptions,
    mySubsEmpty,
    // publish flow
    sanitizePreviewLoading,
    sanitizePreviewError,
    sanitizePreviewResult,
    sanitizePreview,
    clearSanitizePreview,
    publishing,
    publishError,
    publish,
    unpublish,
    setItemRecommended
  }
})
