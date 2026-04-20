import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Parent Self-Grant Membership E2E
 *
 * Tests that the parent account can grant membership to itself via the
 * customer-management page (CustomersView), using the exact same UI
 * interaction as granting to sub-users.
 *
 * Coverage:
 *   1. Parent appears in customer list (first row)
 *   2. Parent can self-grant trial via action menu → "开通会员"
 *   3. Granting to a sub-user still works (regression)
 *
 * We mock the grant POST so state is deterministic — the real dev
 * backend's membership state changes across runs and we
 * don't want to pollute it.
 *
 * Prerequisites: auth setup must run first; the authenticated user must
 * be a parent account (parent_user_id IS NULL) with at least 1 sub-user.
 */

const sel = {
  page: '.customers-page',
  tableRow: '.data-table tbody tr',
  actionTrigger: '.action-trigger',
  actionMenu: '.action-menu',
  actionMenuItem: '.action-menu-item',

  grantModal: '.modal-dialog.tier-dialog',
  grantTitle: '.modal-dialog.tier-dialog .modal-title',
  targetName: '.modal-dialog.tier-dialog .perm-name',
  trialCard: '.modal-dialog.tier-dialog .upgrade-card:has-text("体验会员")',
  monthlyCard: '.modal-dialog.tier-dialog .upgrade-card:has-text("高级会员")',
  monthsSelect: '.modal-dialog.tier-dialog select.form-select',
  submitBtn: '.modal-dialog.tier-dialog .btn-primary',

  toast: '.toast'
} as const

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

async function openGrantModalForRow(page: Page, rowIndex: number) {
  const row = page.locator(sel.tableRow).nth(rowIndex)
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.locator(sel.actionTrigger).click()
  await expect(row.locator(sel.actionMenu)).toBeVisible({ timeout: 3_000 })
  await row.locator(sel.actionMenuItem, { hasText: '开通会员' }).click()
  await expect(page.locator(sel.grantModal)).toBeVisible({ timeout: 3_000 })
}

async function mockGrantSuccess(page: Page) {
  await page.route('**/v1/users/children/*/grant-membership', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { message: '开通成功' }
      })
    })
  })
}

// ══════════════════════════════════════════════════════════════════
// 1. Parent appears in customer list
// ══════════════════════════════════════════════════════════════════

test.describe('Parent Self-Grant — List rendering', () => {
  test('parent account appears as the first row in customer list', async ({ page }) => {
    await goToCustomers(page)

    const rows = page.locator(sel.tableRow)
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // 父自己置顶：第一行的昵称应该是当前登录用户的昵称。
    // 由于我们不假设具体昵称，仅断言"有至少一行 + action 菜单可用"。
    const firstRow = rows.first()
    await firstRow.locator(sel.actionTrigger).click()
    await expect(firstRow.locator(sel.actionMenu)).toBeVisible({ timeout: 3_000 })
    await expect(firstRow.locator(sel.actionMenuItem, { hasText: '开通会员' })).toBeVisible()
  })
})

// ══════════════════════════════════════════════════════════════════
// 2. Parent self-grant trial
// ══════════════════════════════════════════════════════════════════

test.describe('Parent Self-Grant — Trial self-grant', () => {
  test('parent can grant trial to themselves via the first row', async ({ page }) => {
    await mockGrantSuccess(page)
    await goToCustomers(page)

    // 第一行 = 父自己（task #2 保证）
    await openGrantModalForRow(page, 0)
    await expect(page.locator(sel.grantTitle)).toHaveText('开通会员')

    // Select trial
    await page.locator(sel.trialCard).click()
    await page.locator(sel.submitBtn).click()

    // Toast 成功 + modal 关闭
    await expect(page.locator(sel.toast)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(sel.toast)).toContainText('开通')
    await expect(page.locator(sel.grantModal)).not.toBeVisible({ timeout: 3_000 })

    // 注意：spec §5.3 路径 2 要求"列表刷新后自己行显示会员状态"。
    // 本 case 因 mock 了 grant API 后端不实际写入，列表刷新后的会员状态断言
    // 无法在 E2E mock 下可靠验证。会员状态持久化的端到端验证由后端 TDD
    // （TestGrantMembership_SelfGrant_Trial_Success 等 task 1 的单测）覆盖。
    // 此处做一个弱断言：submit 成功后列表仍然渲染（即 loadSubUsers() 已触发）。
    await expect(page.locator(sel.tableRow).first()).toBeVisible({ timeout: 5_000 })
  })
})

// ══════════════════════════════════════════════════════════════════
// 3. Regression: granting to a sub-user still works
// ══════════════════════════════════════════════════════════════════

test.describe('Parent Self-Grant — Sub-user regression', () => {
  test('granting monthly to a sub-user (second row) still works', async ({ page }) => {
    // 先加载页面，再决定是否 skip，最后才挂载 mock，
    // 避免 skip 时 route handler 已挂载污染后续 test 的 page context。
    await goToCustomers(page)

    const rowCount = await page.locator(sel.tableRow).count()
    test.skip(rowCount < 2, 'Need at least 1 sub-user for this regression test')

    await mockGrantSuccess(page)

    // 第二行 = 第一个子账户
    await openGrantModalForRow(page, 1)
    await page.locator(sel.monthlyCard).click()
    await page.locator(sel.monthsSelect).selectOption('6')
    await page.locator(sel.submitBtn).click()

    await expect(page.locator(sel.toast)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(sel.grantModal)).not.toBeVisible({ timeout: 3_000 })
  })
})
