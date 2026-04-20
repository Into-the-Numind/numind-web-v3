import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Grant Membership Modal E2E — credits-system Q2 gap-fill UX revision
 *
 * Tests the inline "开通会员" modal that replaces the old navigate-to-
 * separate-page flow (/parent/children-membership). Covers:
 *
 *   1. Opens modal from action dropdown
 *   2. Trial path: submit → toast + close + row reloaded
 *   3. Monthly path: months selector 1-12, submit with months=6
 *   4. Backend 400 "已购买过体验卡" → error banner inside modal
 *   5. Backend 403 cross-tenant → error banner inside modal
 *
 * We mock the grant API with page.route() so the test is deterministic:
 * the real dev backend's child-account state changes across runs and we
 * don't want to pollute it. The listChildren endpoint still hits the live
 * backend so we exercise the real data path into the table.
 *
 * Prerequisites: auth setup must run first (see playwright.config.ts).
 */

// ── Selectors ──────────────────────────────────────────────────────

const sel = {
  page: '.customers-page',
  tableRow: '.data-table tbody tr',
  actionTrigger: '.action-trigger',
  actionMenu: '.action-menu',
  actionMenuItem: '.action-menu-item',

  // Grant modal (new, inline)
  grantModal: '.modal-dialog.tier-dialog',
  grantTitle: '.modal-dialog.tier-dialog .modal-title',
  grantClose: '.modal-dialog.tier-dialog .modal-close',
  grantBody: '.modal-dialog.tier-dialog .modal-body',
  // Target user card
  targetName: '.modal-dialog.tier-dialog .perm-name',
  targetMeta: '.modal-dialog.tier-dialog .perm-meta',
  // Product type cards (trial / monthly)
  upgradeCards: '.modal-dialog.tier-dialog .upgrade-card',
  trialCard: '.modal-dialog.tier-dialog .upgrade-card:has-text("体验会员")',
  monthlyCard: '.modal-dialog.tier-dialog .upgrade-card:has-text("高级会员")',
  // Form
  monthsSelect: '.modal-dialog.tier-dialog select.form-select',
  reasonInput: '.modal-dialog.tier-dialog input.form-input[placeholder*="季度预算调整"]',
  grantError: '.modal-dialog.tier-dialog .form-error',
  // Footer buttons
  cancelBtn: '.modal-dialog.tier-dialog .btn-cancel',
  submitBtn: '.modal-dialog.tier-dialog .btn-primary',

  // Toast
  toast: '.toast'
} as const

// ── Helpers ────────────────────────────────────────────────────────

async function goToCustomers(page: Page) {
  await page.goto('/customers')
  await page.waitForFunction(
    () => {
      const table = document.querySelector('.data-table')
      const empty = document.querySelector('.empty-state')
      const loading = document.querySelector('.loading-state')
      return (table || empty) && !loading
    },
    null,
    { timeout: 30_000 }
  )
}

/** Open action menu for first sub-user row and click "开通会员". */
async function openGrantModalForFirstRow(page: Page) {
  const firstRow = page.locator(sel.tableRow).first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })
  await firstRow.locator(sel.actionTrigger).click()
  await expect(firstRow.locator(sel.actionMenu)).toBeVisible({ timeout: 3_000 })
  await firstRow.locator(sel.actionMenuItem, { hasText: '开通会员' }).click()
  await expect(page.locator(sel.grantModal)).toBeVisible({ timeout: 3_000 })
}

/** Match grant POST path ignoring the child_id segment. */
function isGrantPath(url: string): boolean {
  return /\/v1\/users\/children\/\d+\/grant-membership$/.test(new URL(url).pathname)
}

/** Install a one-shot grant POST mock returning the given JSON + status. */
async function mockGrantOnce(page: Page, status: number, body: Record<string, unknown>) {
  await page.route('**/v1/users/children/*/grant-membership', async (route: Route) => {
    if (route.request().method() !== 'POST' || !isGrantPath(route.request().url())) {
      await route.fallback()
      return
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body)
    })
  })
}

// ══════════════════════════════════════════════════════════════════
//  1. Modal structure
// ══════════════════════════════════════════════════════════════════

test.describe('Grant Membership — Modal basics', () => {
  test('action menu item "开通会员" opens the inline modal', async ({ page }) => {
    await goToCustomers(page)
    await openGrantModalForFirstRow(page)

    await expect(page.locator(sel.grantTitle)).toHaveText('开通会员')
    await expect(page.locator(sel.targetName)).toBeVisible()
    await expect(page.locator(sel.targetMeta)).toContainText('本次开通不扣款')
    // Two product cards: trial + monthly
    await expect(page.locator(sel.upgradeCards)).toHaveCount(2)
    await expect(page.locator(sel.trialCard)).toBeVisible()
    await expect(page.locator(sel.monthlyCard)).toBeVisible()
  })

  test('cancel button closes the modal', async ({ page }) => {
    await goToCustomers(page)
    await openGrantModalForFirstRow(page)
    await page.locator(sel.cancelBtn).click()
    await expect(page.locator(sel.grantModal)).not.toBeVisible({
      timeout: 3_000
    })
  })

  test('clicking the close (X) icon closes the modal', async ({ page }) => {
    await goToCustomers(page)
    await openGrantModalForFirstRow(page)
    await page.locator(sel.grantClose).click()
    await expect(page.locator(sel.grantModal)).not.toBeVisible({
      timeout: 3_000
    })
  })
})

// ══════════════════════════════════════════════════════════════════
//  2. Product-type toggle (trial hides months, monthly shows months)
// ══════════════════════════════════════════════════════════════════

test.describe('Grant Membership — Product type toggle', () => {
  test('trial default: months selector is hidden', async ({ page }) => {
    await goToCustomers(page)
    await openGrantModalForFirstRow(page)

    // Default selection is "体验会员" (trial) per handleMenuGrantMembership
    await expect(page.locator(sel.monthsSelect)).toHaveCount(0)
  })

  test('switching to 高级会员 reveals months 1-12 selector', async ({ page }) => {
    await goToCustomers(page)
    await openGrantModalForFirstRow(page)

    await page.locator(sel.monthlyCard).click()
    const monthsSelect = page.locator(sel.monthsSelect)
    await expect(monthsSelect).toBeVisible({ timeout: 3_000 })

    const options = await monthsSelect.locator('option').all()
    expect(options.length).toBe(12)
    expect(await options[0].getAttribute('value')).toBe('1')
    expect(await options[11].getAttribute('value')).toBe('12')
  })
})

// ══════════════════════════════════════════════════════════════════
//  3. Submit success (trial + monthly)
// ══════════════════════════════════════════════════════════════════

test.describe('Grant Membership — Submit success', () => {
  test('trial: POST 200 → toast + modal closes', async ({ page }) => {
    await mockGrantOnce(page, 200, {
      code: 0,
      message: '',
      data: { user_tier: 'trial', message: '开通成功' }
    })

    await goToCustomers(page)
    await openGrantModalForFirstRow(page)
    // Default productType=trial, submit directly
    await page.locator(sel.submitBtn).click()

    // Modal closes
    await expect(page.locator(sel.grantModal)).not.toBeVisible({
      timeout: 5_000
    })

    // Success toast appears
    const toast = page.locator(sel.toast)
    await expect(toast).toBeVisible({ timeout: 5_000 })
    await expect(toast).toContainText('体验会员')
  })

  test('monthly with months=6: POST 200 with months in body → toast', async ({ page }) => {
    let capturedBody: unknown = null
    await page.route('**/v1/users/children/*/grant-membership', async (route) => {
      capturedBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: '',
          data: { user_tier: 'standard' }
        })
      })
    })

    await goToCustomers(page)
    await openGrantModalForFirstRow(page)

    // Switch to monthly, pick 6 months
    await page.locator(sel.monthlyCard).click()
    await page.locator(sel.monthsSelect).selectOption('6')
    await page.locator(sel.submitBtn).click()

    await expect(page.locator(sel.grantModal)).not.toBeVisible({
      timeout: 5_000
    })
    const toast = page.locator(sel.toast)
    await expect(toast).toBeVisible({ timeout: 5_000 })
    await expect(toast).toContainText('6 个月')

    // Verify request body
    expect(capturedBody).toMatchObject({ product_type: 'monthly', months: 6 })
  })
})

// ══════════════════════════════════════════════════════════════════
//  4. Backend error mapping → inline form error (not toast)
// ══════════════════════════════════════════════════════════════════

test.describe('Grant Membership — Backend error display', () => {
  test('400 Trial.AlreadyPurchased → modal shows 您已购买过体验卡', async ({ page }) => {
    await mockGrantOnce(page, 400, {
      code: 1,
      message: '您已购买过体验卡',
      data: null
    })

    await goToCustomers(page)
    await openGrantModalForFirstRow(page)
    await page.locator(sel.submitBtn).click()

    // Modal stays open, error banner shown
    await expect(page.locator(sel.grantModal)).toBeVisible()
    await expect(page.locator(sel.grantError)).toContainText('您已购买过体验卡', { timeout: 5_000 })
    // No success toast
    await expect(page.locator(sel.toast)).not.toBeVisible()
  })

  test('403 cross-tenant → modal shows 该子账户不属于当前账户', async ({ page }) => {
    await mockGrantOnce(page, 403, {
      code: 1,
      message: '该子账户不属于当前账户',
      data: null
    })

    await goToCustomers(page)
    await openGrantModalForFirstRow(page)
    await page.locator(sel.submitBtn).click()

    await expect(page.locator(sel.grantModal)).toBeVisible()
    await expect(page.locator(sel.grantError)).toContainText('该子账户不属于当前账户', {
      timeout: 5_000
    })
  })

  test('404 child not found → modal shows 子账户不存在', async ({ page }) => {
    await mockGrantOnce(page, 404, {
      code: 1,
      message: '子账户不存在',
      data: null
    })

    await goToCustomers(page)
    await openGrantModalForFirstRow(page)
    await page.locator(sel.submitBtn).click()

    await expect(page.locator(sel.grantError)).toContainText('子账户不存在', {
      timeout: 5_000
    })
  })
})
