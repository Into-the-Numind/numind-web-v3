/**
 * marketplace E2E — 5 acceptance criteria for v2 #3 (T11)
 *
 * Feature: agent-mode-v2-skill-marketplace
 * Spec: numind-server/docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-marketplace-design.md §14
 *
 * Coverage:
 *   AC-1  parent A publishes a skill via the publish UI (full diff/confirm flow)
 *   AC-2  parent B (different tenant) sees A's marketplace entry
 *   AC-3  parent B subscribes — backend clones skill into B's tenant
 *   AC-4  parent B unsubscribes — subscription row gone, marketplace entry remains
 *   AC-6  child account (parent_user_id NOT NULL) hits 403 on /v1/marketplace/list
 *
 * Strategy: hybrid — UI for the publisher journey (the most user-visible flow),
 * API checks for cross-tenant assertions (deterministic, no UI flakiness in
 * search results / ngram FULLTEXT ordering). AC-6 is API-level because the
 * router guard's redirect would never let UI assertions observe a 403 directly.
 *
 * Prerequisites (env vars; see .claude/settings.local.json):
 *   E2E_USERNAME / E2E_PASSWORD                — parent A (publisher)
 *   E2E_USERNAME_B / E2E_PASSWORD_B            — parent B (different tenant, subscriber)
 *   E2E_CHILD_USERNAME / E2E_CHILD_USERNAME_PASSWORD — child of any parent (403 target)
 *
 * Backend must be running: `task dev` (port 9091), reading numind-dev MySQL.
 * Migrations 20260524_120000 + 20260524_130000 must be applied to numind-dev.
 *
 * Cleanup: afterAll unpublishes the marketplace entry and deletes the source
 * skill (parent A). Each run uses a `Date.now()` suffix on the skill name so
 * concurrent runs don't collide.
 */

import { test, expect, type Page } from '@playwright/test'

// ── Env ────────────────────────────────────────────────────────────────────

const PARENT_A_USERNAME = process.env.E2E_USERNAME ?? ''
const PARENT_A_PASSWORD = process.env.E2E_PASSWORD ?? ''
const PARENT_B_USERNAME = process.env.E2E_USERNAME_B ?? ''
const PARENT_B_PASSWORD = process.env.E2E_PASSWORD_B ?? ''
const CHILD_USERNAME = process.env.E2E_CHILD_USERNAME ?? ''
const CHILD_PASSWORD = process.env.E2E_CHILD_USERNAME_PASSWORD ?? ''

if (!PARENT_A_USERNAME || !PARENT_B_USERNAME || !CHILD_USERNAME) {
  throw new Error(
    'marketplace.spec.ts requires E2E_USERNAME, E2E_USERNAME_B, E2E_CHILD_USERNAME ' +
      '(+ their *_PASSWORD pair) in env. See .claude/settings.local.json.'
  )
}

const RUN_ID = Date.now()
const TEST_SKILL_NAME = `_mkt_e2e_${RUN_ID}`
const TEST_SKILL_BODY = [
  '# Marketplace E2E Skill',
  '',
  'Test skill used by marketplace.spec.ts. Safe to delete.',
  '',
  '## Steps',
  '1. Step one',
  '2. Step two'
].join('\n')

// ── Selectors ──────────────────────────────────────────────────────────────

const sel = {
  usernameInput: '#username',
  passwordInput: '#password',
  loginButton: '.login-button',
  sanitizePane: '.diff__pane--sanitized',
  categoryChip: '.category-multi-select button.chip',
  confirmCheckbox: '.confirm-gate input[type="checkbox"]',
  publishButton: '.actions button:has-text("发布到市场")'
} as const

// ── Login helper ──────────────────────────────────────────────────────────

async function loginAs(page: Page, username: string, password: string): Promise<void> {
  // Default storageState (from auth.setup) makes the auth guard bounce visits
  // to /login back to /. Wipe localStorage first so we land on the login form.
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await expect(page.locator(sel.loginButton)).toBeVisible({ timeout: 15_000 })
  await page.locator(sel.usernameInput).fill(username)
  await page.locator(sel.passwordInput).fill(password)
  await page.locator(sel.loginButton).click()
  await expect(page).toHaveURL('/', { timeout: 20_000 })
}

async function getToken(page: Page): Promise<string> {
  const t = await page.evaluate(() => localStorage.getItem('token'))
  if (!t) throw new Error('No token in localStorage after login')
  return t
}

// ── API helpers (shared) ──────────────────────────────────────────────────

async function apiCreateSkill(page: Page, name: string, body: string): Promise<{ id: number }> {
  const token = await getToken(page)
  const resp = await page.request.post('/api/v1/skills', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, description: 'e2e marketplace test', body_md: body, allowed_tools: ['Bash'] }
  })
  const json = await resp.json()
  expect(json.code, `create skill failed: ${JSON.stringify(json)}`).toBe(0)
  return json.data as { id: number }
}

async function apiDeleteSkill(page: Page, id: number): Promise<void> {
  const token = await getToken(page)
  await page.request.delete(`/api/v1/skills/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
}

async function apiUnpublishMarketplace(page: Page, marketplaceID: number): Promise<void> {
  const token = await getToken(page)
  await page.request.post(`/api/v1/marketplace/${marketplaceID}/unpublish`, {
    headers: { Authorization: `Bearer ${token}` }
  })
}

// ── Shared test state (set by AC-1, consumed by AC-2..AC-4 + afterAll) ────

let createdSkillID = 0
let createdMarketplaceID = 0

// ── Tests ─────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('marketplace cross-tenant E2E', () => {
  test('AC-1 publish — parent A creates a skill and publishes it through the UI', async ({
    page
  }) => {
    await loginAs(page, PARENT_A_USERNAME, PARENT_A_PASSWORD)

    // Setup: create a source skill via API (faster than the UI flow + we already
    // exercise the skill UI in v2 #1's specs).
    const skill = await apiCreateSkill(page, TEST_SKILL_NAME, TEST_SKILL_BODY)
    createdSkillID = skill.id
    expect(createdSkillID).toBeGreaterThan(0)

    // Drive the publish UI: navigate, wait for sanitize preview, pick a
    // category, tick the confirm gate, click publish.
    await page.goto(`/marketplace/publish/${createdSkillID}`)

    // qwen-turbo sanitize is typically <2s but allow generous headroom for cold
    // pools / network.
    await expect(page.locator(sel.sanitizePane)).toBeVisible({ timeout: 45_000 })

    await page.locator(sel.categoryChip, { hasText: '调研' }).click()
    await page.locator(sel.confirmCheckbox).check()

    const [publishResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/marketplace/publish') && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      page.locator(sel.publishButton).click()
    ])
    const publishBody = await publishResp.json()
    expect(publishBody.code, `publish failed: ${JSON.stringify(publishBody)}`).toBe(0)
    createdMarketplaceID = publishBody.data.id as number
    expect(createdMarketplaceID).toBeGreaterThan(0)
    expect(publishBody.data.name).toBe(TEST_SKILL_NAME)
  })

  test("AC-2 browse — parent B (different tenant) sees A's marketplace entry", async ({
    browser
  }) => {
    expect(createdMarketplaceID, 'AC-1 must have set createdMarketplaceID').toBeGreaterThan(0)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await loginAs(page, PARENT_B_USERNAME, PARENT_B_PASSWORD)
      const token = await getToken(page)
      // Hit the list endpoint directly — UI search relies on MySQL ngram FULLTEXT
      // which has nondeterministic ordering for short queries; pulling the full
      // recent page is a stable assertion.
      const resp = await page.request.get('/api/v1/marketplace/list', {
        headers: { Authorization: `Bearer ${token}` },
        params: { sort: 'recent', page_size: '100' }
      })
      expect(resp.status()).toBe(200)
      const body = await resp.json()
      expect(body.code).toBe(0)
      const found = (body.data.list as Array<{ id: number; name: string }>).find(
        (m) => m.id === createdMarketplaceID
      )
      expect(found, `marketplace ${createdMarketplaceID} not visible to parent B`).toBeTruthy()
      expect(found!.name).toBe(TEST_SKILL_NAME)
    } finally {
      await ctx.close()
    }
  })

  test("AC-3 subscribe — parent B subscribes, cloned skill lands in B's tenant", async ({
    browser
  }) => {
    expect(createdMarketplaceID).toBeGreaterThan(0)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await loginAs(page, PARENT_B_USERNAME, PARENT_B_PASSWORD)
      const token = await getToken(page)

      const subResp = await page.request.post(
        `/api/v1/marketplace/${createdMarketplaceID}/subscribe`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      expect(subResp.status(), `subscribe HTTP ${subResp.status()}`).toBe(200)
      const subBody = await subResp.json()
      expect(subBody.code, `subscribe failed: ${JSON.stringify(subBody)}`).toBe(0)
      const clonedSkillID = subBody.data.cloned_skill_id as number
      const subscriptionID = subBody.data.subscription_id as number
      expect(clonedSkillID).toBeGreaterThan(0)
      expect(subscriptionID).toBeGreaterThan(0)

      // Verify cloned skill appears in B's own /v1/skills list with
      // source=imported_from_marketplace (spec §3.4 cross-tenant rule 7).
      const skillsResp = await page.request.get('/api/v1/skills', {
        headers: { Authorization: `Bearer ${token}` },
        params: { page_size: '100' }
      })
      const skillsBody = await skillsResp.json()
      expect(skillsBody.code).toBe(0)
      const cloned = (skillsBody.data.list as Array<{ id: number; source_type: string }>).find(
        (s) => s.id === clonedSkillID
      )
      expect(cloned, "cloned skill missing from B's skill list").toBeTruthy()
      expect(cloned!.source_type).toBe('imported_from_marketplace')
    } finally {
      await ctx.close()
    }
  })

  test('AC-4 unsubscribe — parent B unsubscribes; marketplace entry remains', async ({
    browser
  }) => {
    expect(createdMarketplaceID).toBeGreaterThan(0)
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await loginAs(page, PARENT_B_USERNAME, PARENT_B_PASSWORD)
      const token = await getToken(page)

      const unsubResp = await page.request.delete(
        `/api/v1/marketplace/${createdMarketplaceID}/unsubscribe`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      expect(unsubResp.status(), `unsubscribe HTTP ${unsubResp.status()}`).toBe(200)
      const unsubBody = await unsubResp.json()
      expect(unsubBody.code, `unsubscribe failed: ${JSON.stringify(unsubBody)}`).toBe(0)

      // /my-subscriptions no longer lists it.
      const mySubResp = await page.request.get('/api/v1/marketplace/my-subscriptions', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const mySubBody = await mySubResp.json()
      const stillThere = (mySubBody.data.list as Array<{ marketplace: { id: number } }>).find(
        (s) => s.marketplace.id === createdMarketplaceID
      )
      expect(stillThere, 'subscription should be removed after unsubscribe').toBeFalsy()

      // Marketplace entry itself is still visible (publisher retains it).
      const detailResp = await page.request.get(`/api/v1/marketplace/${createdMarketplaceID}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(detailResp.status()).toBe(200)
    } finally {
      await ctx.close()
    }
  })

  test('AC-6 child 403 — child account is blocked by biz verifyParent on read endpoints', async ({
    browser
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await loginAs(page, CHILD_USERNAME, CHILD_PASSWORD)
      const token = await getToken(page)
      const resp = await page.request.get('/api/v1/marketplace/list', {
        headers: { Authorization: `Bearer ${token}` }
      })
      // spec §10.1 rule 2 + §14 AC-6: every biz method (incl. List/Get) must
      // verifyParent → child gets HTTP 403, body {"code":>0, "message":"子账户..."}.
      expect(resp.status(), 'child must receive 403 on marketplace list').toBe(403)
      const body = await resp.json()
      expect(body.code).toBeGreaterThan(0)
      expect(body.message ?? '').toMatch(/子账户|父账户|market/i)
    } finally {
      await ctx.close()
    }
  })

  test.afterAll(async ({ browser }) => {
    if (!createdMarketplaceID && !createdSkillID) return
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    try {
      await loginAs(page, PARENT_A_USERNAME, PARENT_A_PASSWORD)
      if (createdMarketplaceID) {
        await apiUnpublishMarketplace(page, createdMarketplaceID).catch(() => undefined)
      }
      if (createdSkillID) {
        await apiDeleteSkill(page, createdSkillID).catch(() => undefined)
      }
    } finally {
      await ctx.close()
    }
  })
})
