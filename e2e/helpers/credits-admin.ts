/**
 * credits-admin.ts — E2E helpers for credits-system (Phase 2 Task 2.5).
 *
 * These helpers install `page.route()` mocks that synthesize backend responses
 * for the credits-system API surface (spec §4.1 + §4.2). The approach mirrors
 * `sop-runtime.spec.ts` — deterministic fixtures avoid flakiness from real
 * backend state and let the 6 critical paths run in CI without a full stack.
 *
 * Each helper returns an updatable "handle" so a test can mutate server state
 * mid-flow (e.g. after a simulated purchase, balance goes from 0 → 2000).
 *
 * Scope:
 *   - forceTier / switchBillingMode / resetCredits — mutate the in-memory
 *     user+balance fixture that all mock handlers read
 *   - mockPayment — intercept POST /v1/orders, pretend success, mutate state
 *   - mockSopEstimate / mockSopStream — stub the SOP run pipeline
 *   - mockSalesRagChat — stub SalesRAG chat SSE for Path 5
 *
 * Refs: spec §5.4, plan Task 2.5
 */

import type { Page, Route } from '@playwright/test'

// ── Types mirroring the real API (keep in sync with src/api/credits.ts) ──

export type BillingMode = 'credits' | 'legacy_tier'
export type UserTier = 'free' | 'trial' | 'standard' | 'premium'
export type ProductType = 'trial' | 'monthly' | 'yearly' | 'booster'

export interface QuotaFixture {
  billing_mode: BillingMode
  balance: number
  sub_total: number
  sub_remain: number
  booster_total: number
  booster_remain: number
  remaining_runs?: number | null
  monthly_limit?: number | null
  sub_expires_at?: string
  booster_earliest_expires_at?: string
}

export interface UserFixture {
  id: number
  username: string
  nickname: string
  user_tier: UserTier
  tier_expires: string | null
  monthly_sop_runs: number
}

export interface EstimateFixture {
  total_estimated_credits: number
  first_node_estimate?: number
  node_count?: number
  sufficient: boolean
  skip_deduction: boolean
  reason?: string
  coefficient_id: number
}

export interface CreditReservation {
  id: number
  status: 'reserved' | 'reconciled' | 'refunded'
  estimated_credits: number
  actual_credits: number
  items: Array<{
    seq: number
    package_id: number
    package_type: string
    credits: number
  }>
}

/**
 * CreditsFixture — mutable shared state for all mock handlers. A single
 * instance per test; helpers read+mutate it.
 */
export interface CreditsFixture {
  user: UserFixture
  quota: QuotaFixture
  estimate: EstimateFixture
  reservations: CreditReservation[]
  // 402 behavior: next SOP run will return 402 with this reason
  force402Reason: string | null
}

export function createDefaultFixture(): CreditsFixture {
  return {
    user: {
      id: 999,
      username: 'e2e_test_user',
      nickname: 'E2E 测试',
      user_tier: 'free',
      tier_expires: null,
      monthly_sop_runs: 0
    },
    quota: {
      billing_mode: 'credits',
      balance: 0,
      sub_total: 0,
      sub_remain: 0,
      booster_total: 0,
      booster_remain: 0,
      remaining_runs: 0,
      monthly_limit: null,
      sub_expires_at: undefined,
      booster_earliest_expires_at: undefined
    },
    estimate: {
      total_estimated_credits: 150,
      first_node_estimate: 40,
      node_count: 4,
      sufficient: true,
      skip_deduction: false,
      coefficient_id: 1
    },
    reservations: [],
    force402Reason: null
  }
}

// ── Handle that tests use to mutate fixture state ──

export class CreditsAdminHandle {
  constructor(public fixture: CreditsFixture) {}

  /**
   * forceTier — set `user.user_tier` and tier_expires. Also syncs monthly
   * allotments for legacy_tier path (Path 4).
   */
  forceTier(
    tier: UserTier,
    options: { expiresInDays?: number; monthlySopRuns?: number } = {}
  ): void {
    this.fixture.user.user_tier = tier
    const expiresInDays = options.expiresInDays ?? 30
    if (tier === 'free') {
      this.fixture.user.tier_expires = null
    } else {
      const d = new Date()
      d.setDate(d.getDate() + expiresInDays)
      this.fixture.user.tier_expires = d.toISOString()
    }
    if (typeof options.monthlySopRuns === 'number') {
      this.fixture.user.monthly_sop_runs = options.monthlySopRuns
    }
  }

  /**
   * switchBillingMode — set `billing_mode` on the QuotaBreakdown returned by
   * GET /v1/credits/balance. Legacy vs credits is a server-side flag; UI reads
   * it to decide which card state to render.
   */
  switchBillingMode(mode: BillingMode): void {
    this.fixture.quota.billing_mode = mode
    if (mode === 'legacy_tier') {
      // legacy users see remaining_runs + monthly_limit, not sub/booster
      const tier = this.fixture.user.user_tier
      this.fixture.quota.monthly_limit =
        tier === 'premium' ? null : tier === 'standard' ? 20 : tier === 'trial' ? 10 : 0
      const limit = this.fixture.quota.monthly_limit ?? 0
      this.fixture.quota.remaining_runs =
        this.fixture.quota.monthly_limit === null
          ? null
          : Math.max(limit - this.fixture.user.monthly_sop_runs, 0)
      // zero out credits-path fields so UI branches cleanly
      this.fixture.quota.sub_total = 0
      this.fixture.quota.sub_remain = 0
      this.fixture.quota.booster_total = 0
      this.fixture.quota.booster_remain = 0
    }
  }

  /**
   * resetCredits — seed credits pool. Used to set up Path 2 (cross-pool FIFO)
   * and Path 1 (fresh purchase → 2000/2000).
   */
  resetCredits(opts: {
    sub_total?: number
    sub_remain?: number
    booster_total?: number
    booster_remain?: number
    sub_expires_at?: string
    booster_earliest_expires_at?: string
  }): void {
    const q = this.fixture.quota
    q.billing_mode = 'credits'
    q.sub_total = opts.sub_total ?? q.sub_total
    q.sub_remain = opts.sub_remain ?? q.sub_remain
    q.booster_total = opts.booster_total ?? q.booster_total
    q.booster_remain = opts.booster_remain ?? q.booster_remain
    q.balance = q.sub_remain + q.booster_remain
    q.sub_expires_at = opts.sub_expires_at ?? q.sub_expires_at
    q.booster_earliest_expires_at =
      opts.booster_earliest_expires_at ?? q.booster_earliest_expires_at
  }

  /**
   * mockPayment — apply a product purchase. For trial/monthly it grants
   * subscription credits; for booster it tops up the booster pool. The test
   * chooses what the order API "accepts" (Path 3 tests the 403 rejection).
   *
   * Returns the new balance so tests can assert on it.
   */
  mockPayment(productType: ProductType): QuotaFixture {
    const now = new Date()
    if (productType === 'trial') {
      const exp = new Date(now)
      exp.setDate(exp.getDate() + 3)
      this.fixture.user.user_tier = 'trial'
      this.fixture.user.tier_expires = exp.toISOString()
      this.fixture.quota.billing_mode = 'credits'
      this.fixture.quota.sub_total = 200
      this.fixture.quota.sub_remain = 200
      this.fixture.quota.sub_expires_at = exp.toISOString()
    } else if (productType === 'monthly' || productType === 'yearly') {
      const monthsToAdd = productType === 'monthly' ? 1 : 12
      const exp = new Date(now)
      exp.setMonth(exp.getMonth() + monthsToAdd)
      this.fixture.user.user_tier = 'standard'
      this.fixture.user.tier_expires = exp.toISOString()
      this.fixture.quota.billing_mode = 'credits'
      this.fixture.quota.sub_total = 2000
      this.fixture.quota.sub_remain = 2000
      this.fixture.quota.sub_expires_at = exp.toISOString()
    } else if (productType === 'booster') {
      const exp = new Date(now)
      exp.setDate(exp.getDate() + 90)
      this.fixture.quota.booster_total += 600
      this.fixture.quota.booster_remain += 600
      this.fixture.quota.booster_earliest_expires_at = exp.toISOString()
    }
    this.fixture.quota.balance = this.fixture.quota.sub_remain + this.fixture.quota.booster_remain
    return this.fixture.quota
  }

  /**
   * deductCredits — simulate FIFO deduction across sub and booster pools.
   * Returns the reservation record (mimics credit_reservation + items).
   */
  deductCredits(amount: number): CreditReservation {
    const items: CreditReservation['items'] = []
    let remaining = amount
    let seq = 1

    // FIFO: sub pool first, then booster (by expires_at ascending ≈ sub usually
    // expires month-end sooner than 90-day booster — matches spec §1.4 Path 2)
    if (this.fixture.quota.sub_remain > 0 && remaining > 0) {
      const take = Math.min(this.fixture.quota.sub_remain, remaining)
      items.push({ seq: seq++, package_id: 1, package_type: 'subscription', credits: take })
      this.fixture.quota.sub_remain -= take
      remaining -= take
    }
    if (this.fixture.quota.booster_remain > 0 && remaining > 0) {
      const take = Math.min(this.fixture.quota.booster_remain, remaining)
      items.push({ seq: seq++, package_id: 2, package_type: 'booster', credits: take })
      this.fixture.quota.booster_remain -= take
      remaining -= take
    }
    this.fixture.quota.balance = this.fixture.quota.sub_remain + this.fixture.quota.booster_remain

    const rsv: CreditReservation = {
      id: this.fixture.reservations.length + 1,
      status: 'reconciled',
      estimated_credits: amount,
      actual_credits: amount,
      items
    }
    this.fixture.reservations.push(rsv)
    return rsv
  }

  /**
   * expireTier — simulate tier expiry lazy downgrade. Used in Path 6.
   */
  expireTier(): void {
    this.fixture.user.user_tier = 'free'
    this.fixture.user.tier_expires = null
    this.fixture.quota.billing_mode = 'credits'
    this.fixture.quota.sub_total = 0
    this.fixture.quota.sub_remain = 0
    this.fixture.quota.balance = 0
  }

  /**
   * set402Reason — queue a 402 response on the next SOP run attempt.
   */
  set402Reason(reason: string | null): void {
    this.fixture.force402Reason = reason
  }
}

// ── Mock installers ──

/**
 * installCreditsMocks — register routes for the credits API surface.
 * Must be called before `page.goto()` for the mocks to take effect on initial
 * balance/estimate fetches (e.g. SettingsView onMounted).
 */
export async function installCreditsMocks(page: Page, fixture: CreditsFixture): Promise<void> {
  // GET /v1/users/me — auth + profile
  await page.route(/\/v1\/users\/me$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: fixture.user.id,
          username: fixture.user.username,
          nickname: fixture.user.nickname,
          user_tier: fixture.user.user_tier,
          tier_expires: fixture.user.tier_expires,
          monthly_sop_runs: fixture.user.monthly_sop_runs,
          // legacy compatibility fields
          quota_sub_total: fixture.quota.sub_total,
          quota_sub_remain: fixture.quota.sub_remain,
          quota_booster_total: fixture.quota.booster_total,
          quota_booster_remain: fixture.quota.booster_remain,
          credit_balance: fixture.quota.balance
        }
      })
    })
  })

  // GET /v1/credits/balance
  await page.route(/\/v1\/credits\/balance$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: fixture.quota })
    })
  })

  // POST /v1/credits/estimate
  await page.route(/\/v1\/credits\/estimate$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    // legacy_tier → skip_deduction=true
    if (fixture.quota.billing_mode === 'legacy_tier') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            ...fixture.estimate,
            skip_deduction: true,
            total_estimated_credits: 0,
            balance: fixture.quota
          }
        })
      })
      return
    }
    const sufficient =
      fixture.estimate.total_estimated_credits <=
      fixture.quota.sub_remain + fixture.quota.booster_remain
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          ...fixture.estimate,
          sufficient,
          balance: fixture.quota
        }
      })
    })
  })

  // GET /v1/credits/packages — listing for SettingsView "我的积分" (if needed)
  await page.route(/\/v1\/credits\/packages(\?.*)?$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { list: [], total: 0 } })
    })
  })
}

/**
 * installOrderMocks — intercept POST /v1/orders. The response depends on the
 * requested product_type + current fixture state:
 *   - booster when user is not a paid member → 403 Membership.Required (Path 3)
 *   - otherwise → 200 success, apply payment via handle.mockPayment()
 */
export async function installOrderMocks(page: Page, handle: CreditsAdminHandle): Promise<void> {
  await page.route(/\/v1\/orders$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const payload = route.request().postDataJSON() as { product_type?: ProductType }
    const pt = payload.product_type

    // Path 3 rule: non-member cannot buy booster
    const tier = handle.fixture.user.user_tier
    const isPaidMember = tier === 'standard' || tier === 'premium'
    if (pt === 'booster' && !isPaidMember) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 403001,
          message: 'Membership.Required'
        })
      })
      return
    }

    // Success: apply payment, return created order
    if (pt) {
      handle.mockPayment(pt)
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: Date.now(),
          order_no: `MOCK-${Date.now()}`,
          user_id: handle.fixture.user.id,
          payer_id: handle.fixture.user.id,
          product_type: pt,
          months: 1,
          amount: pt === 'trial' ? 990 : pt === 'booster' ? 2990 : 9900,
          pay_channel: 'wechat',
          pay_status: 'paid',
          code_url: 'mock://qr',
          paid_at: new Date().toISOString(),
          expired_at: new Date(Date.now() + 3600_000).toISOString(),
          created_at: new Date().toISOString()
        }
      })
    })
  })
}

/**
 * installSopRunMocks — minimal stubs so SOPRunView loads + can start a run.
 * Tests that need fine-grained control over streaming can extend by installing
 * more granular routes AFTER this one (Playwright matches in registration
 * order — first match wins).
 */
export async function installSopRunMocks(
  page: Page,
  handle: CreditsAdminHandle,
  options: { templateId?: number; estimatedCost?: number } = {}
): Promise<void> {
  const templateId = options.templateId ?? 1
  const estimatedCost = options.estimatedCost ?? 150

  // template+nodes
  await page.route(/\/v1\/sop\/templates\/\d+\/nodes(\?.*)?$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          template: {
            id: templateId,
            name: 'E2E 测试 SOP',
            description: 'credits-system E2E fixture',
            status: 'active',
            publish_status: 'published',
            trailing_chat_enabled: false,
            created_at: '2026-04-18T00:00:00Z',
            updated_at: '2026-04-18T00:00:00Z'
          },
          nodes: [
            {
              id: 1,
              template_id: templateId,
              name: '第一步',
              description: '',
              sort: 0,
              status: 'active',
              created_at: '2026-04-18T00:00:00Z',
              updated_at: '2026-04-18T00:00:00Z'
            }
          ],
          total: 1
        }
      })
    })
  })

  await page.route(/\/v1\/sop\/templates\/\d+\/bookmarks/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { bookmarks: [] } })
    })
  })

  // POST /v1/sop/runs — create run
  await page.route(/\/v1\/sop\/runs$/, async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()

    // 402 path: if force402Reason set, respond with InsufficientCredits
    if (handle.fixture.force402Reason) {
      await route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 402001,
          message: '积分不足',
          data: { reason: handle.fixture.force402Reason }
        })
      })
      return
    }

    // Success: deduct credits, return run id
    handle.deductCredits(estimatedCost)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          ID: 12345,
          template_id: templateId,
          user_id: handle.fixture.user.id,
          status: 'running',
          conversation_id: 'mock-conv-12345',
          counted: true,
          started_at: new Date().toISOString(),
          finished_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: ''
        }
      })
    })
  })
}

/**
 * installSalesRagMocks — minimal stubs so SalesView + chat flow loads and a
 * message can be sent. Real SSE streaming is not required for Path 5; we
 * assert the balance change after the chat API completes.
 */
export async function installSalesRagMocks(
  page: Page,
  handle: CreditsAdminHandle,
  options: { chatCost?: number } = {}
): Promise<void> {
  const chatCost = options.chatCost ?? 20

  // Sessions list
  await page.route(/\/v1\/sales\/sessions(\?.*)?$/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { sessions: [], total: 0 } })
    })
  })

  // Chat send — intercept to deduct credits
  await page.route(/\/v1\/sales\/chat(\/stream)?$/, async (route: Route) => {
    if (handle.fixture.force402Reason) {
      await route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 402001,
          message: '积分不足',
          data: { reason: handle.fixture.force402Reason }
        })
      })
      return
    }
    handle.deductCredits(chatCost)
    // Return a simple non-streaming OK response (tests assert balance, not SSE content)
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `event: done\ndata: {"ok":true}\n\n`
    })
  })
}

/**
 * createCreditsAdminHandle — entry point. Creates a fixture, installs the
 * base mocks (credits + user/me), and returns a handle for further mutation.
 *
 * ```ts
 * const handle = await createCreditsAdminHandle(page)
 * handle.forceTier('standard')
 * handle.resetCredits({ sub_total: 2000, sub_remain: 2000 })
 * await page.goto('/settings')
 * ```
 */
export async function createCreditsAdminHandle(page: Page): Promise<CreditsAdminHandle> {
  const fixture = createDefaultFixture()
  const handle = new CreditsAdminHandle(fixture)
  await installCreditsMocks(page, fixture)
  return handle
}
