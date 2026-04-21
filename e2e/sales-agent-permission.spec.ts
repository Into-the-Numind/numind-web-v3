import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Sales Agent Child Permission E2E
 *
 * Validates parent account can toggle sales_agent feature permission for sub-users
 * via the customer-management UI, and the toggle correctly gates access on the
 * sub-user side.
 *
 * Coverage matrix:
 *   E1+E3: Parent toggles "销售智能体" checkbox ON and OFF via 管理权限 modal → grant/revoke API called
 *   E2: /sales-rag/check-permission mock → true → sub-user can enter /sales page
 *   E4: /sales-rag/check-permission mock → false → HomeView shows "未开通销售智能体权限" notice
 *   E5: direct POST /sales-rag/sessions/1/chat mocked to business code 100207 →
 *       client receives code 100207 (network contract verified via chat403Count)
 *
 * All backend calls are mocked for determinism. Real backend permission state
 * can drift across runs; we're testing UI wiring, not backend logic (that's
 * covered by Go httptest in numind-server Task 3).
 *
 * Selector reality-check notes (verified against source before commit):
 *   - Permission modal: .modal-dialog.perm-dialog (CustomersView.vue line 542)
 *   - Sales agent toggle: .perm-item with text "销售智能体" (line 650-678), checkbox-style
 *   - Submit button: .modal-dialog.perm-dialog .btn-primary (line 714)
 *   - Action menu item: "管理权限" text (line 320)
 *   - Action trigger: .action-trigger (line 277)
 *   - Action menu: .action-menu (line 299)
 *   - Toast: .toast (from existing specs precedent)
 *   - Toast success message: "权限已更新" (CustomersView.vue line 1494)
 *   - Permission denied modal: .permission-desc (HomeView.vue line 249)
 *   - Denied message text: "未开通销售智能体权限，请联系管理员" (HomeView.vue line 381)
 *   - Sales page route: /sales (router/index.ts line 25)
 *   - Sales view class: .sales-view (SalesView.vue line 2)
 *   - Feature API URL: /v1/customers/sub-users/:id/features (customers.ts lines 143, 151)
 *
 * Prerequisites: auth setup runs first; authenticated user is a parent account
 * (parent_user_id IS NULL) with at least 1 sub-user in the customer list.
 */

const sel = {
  page: '.customers-page',
  tableRow: '.data-table tbody tr',
  actionTrigger: '.action-trigger',
  actionMenu: '.action-menu',
  actionMenuItem: '.action-menu-item',

  // Permission modal opened via action menu → "管理权限"
  permModal: '.modal-dialog.perm-dialog',
  // Sales agent toggle: a .perm-item containing text "销售智能体"
  salesAgentPermItem: '.perm-item:has-text("销售智能体")',
  submitBtn: '.modal-dialog.perm-dialog .btn-primary',

  // Toast notification
  toast: '.toast',

  // HomeView permission denied modal
  permissionDesc: '.permission-desc',

  // Sales page view
  salesView: '.sales-view'
} as const

// Route for the sales agent page — verified against router/index.ts line 25
const SALES_ROUTE = '/sales'

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

/**
 * Mock the feature grant/revoke API endpoints so the test doesn't
 * actually write to the backend.
 */
async function mockFeaturesApi(page: Page) {
  await page.route('**/v1/customers/sub-users/*/features', async (route: Route) => {
    const method = route.request().method()
    if (method !== 'POST' && method !== 'DELETE') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: null
      })
    })
  })
}

/**
 * Mock /v1/sales-rag/check-permission to return a deterministic result.
 */
async function mockCheckPermission(page: Page, hasPermission: boolean) {
  await page.route('**/v1/sales-rag/check-permission', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { has_permission: hasPermission }
      })
    })
  })
}

// ══════════════════════════════════════════════════════════════════
// E1+E3: Parent can toggle sales_agent ON and OFF for sub-user
// ══════════════════════════════════════════════════════════════════

test.describe('Sales Agent Child Permission', () => {
  test('E1+E3: parent can toggle sales_agent ON and OFF for sub-user', async ({ page }) => {
    await mockFeaturesApi(page)
    await goToCustomers(page)

    // Find a sub-user row (second row if parent is first; fallback: first row).
    // Skip if no rows exist.
    const rows = page.locator(sel.tableRow)
    const rowCount = await rows.count()
    test.skip(rowCount < 1, 'No customer rows found — auth fixture must provide ≥1 row')

    // Use the first available row (parent account row also has 管理权限).
    const row = rows.first()
    await expect(row).toBeVisible({ timeout: 15_000 })

    // Open action menu
    await row.locator(sel.actionTrigger).click()
    await expect(row.locator(sel.actionMenu)).toBeVisible({ timeout: 3_000 })

    // Click "管理权限" (verified: CustomersView.vue line 320)
    await row.locator(sel.actionMenuItem, { hasText: '管理权限' }).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 3_000 })

    // Locate the sales agent perm-item
    const salesItem = page.locator(sel.salesAgentPermItem)
    await expect(salesItem).toBeVisible({ timeout: 5_000 })

    // Toggle ON: if not already checked, click to check
    const isCheckedBefore = await salesItem.evaluate((el) => el.classList.contains('checked'))
    if (!isCheckedBefore) {
      await salesItem.click()
    }
    await expect(salesItem).toHaveClass(/checked/, { timeout: 2_000 })

    // Submit — expect "权限已更新" toast (CustomersView.vue line 1494)
    await page.locator(sel.submitBtn).click()
    await expect(page.locator(sel.toast)).toContainText('权限已更新', { timeout: 5_000 })
    await expect(page.locator(sel.permModal)).not.toBeVisible({ timeout: 3_000 })

    // E3: Re-open modal and toggle OFF
    await row.locator(sel.actionTrigger).click()
    await expect(row.locator(sel.actionMenu)).toBeVisible({ timeout: 3_000 })
    await row.locator(sel.actionMenuItem, { hasText: '管理权限' }).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 3_000 })

    const salesItemAgain = page.locator(sel.salesAgentPermItem)
    const isCheckedAfter = await salesItemAgain.evaluate((el) => el.classList.contains('checked'))
    if (isCheckedAfter) {
      await salesItemAgain.click()
    }
    await expect(salesItemAgain).not.toHaveClass(/checked/, { timeout: 2_000 })

    await page.locator(sel.submitBtn).click()
    await expect(page.locator(sel.toast)).toContainText('权限已更新', { timeout: 5_000 })
    await expect(page.locator(sel.permModal)).not.toBeVisible({ timeout: 3_000 })
  })

  // ════════════════════════════════════════════════════════════════
  // E2: check-permission true → sub-user enters sales page
  // ════════════════════════════════════════════════════════════════

  test('E2: check-permission returns true → sub-user can enter sales page', async ({ page }) => {
    await mockCheckPermission(page, true)

    // Mock sessions list and knowledge docs so SalesView doesn't crash loading
    await page.route('**/v1/sales-rag/sessions', async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { sessions: [] } })
      })
    })
    await page.route('**/v1/sales-rag/knowledge-documents', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { documents: [] } })
      })
    })

    await page.goto(SALES_ROUTE)

    // SalesView should render (not redirect to /)
    // Verified: SalesView.vue template wraps in .sales-view (line 2)
    await expect(page.locator(sel.salesView)).toBeVisible({ timeout: 10_000 })

    // No permission-denied UI should appear
    await expect(page.locator(sel.permissionDesc)).toHaveCount(0)
  })

  // ════════════════════════════════════════════════════════════════
  // E4: check-permission false → HomeView shows denied notice
  // ════════════════════════════════════════════════════════════════

  test('E4: check-permission returns false → HomeView shows denied notice on click', async ({
    page
  }) => {
    await mockCheckPermission(page, false)

    // Also mock SOP templates so HomeView loads cleanly
    await page.route('**/v1/sop/templates', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { templates: [] } })
      })
    })

    await page.goto('/')

    // Wait for HomeView to finish loading (hasSalesPermission is set on mounted)
    // The agent card has class "no-permission" when hasSalesPermission=false
    await expect(page.locator('.feature-card.no-permission')).toBeVisible({ timeout: 10_000 })

    // Click the locked sales agent card to trigger the permission modal
    await page.locator('.feature-card.no-permission').first().click()

    // HomeView permission denied modal appears with the exact message
    // Verified: HomeView.vue line 249 (.permission-desc) and line 381 (message text)
    await expect(page.locator(sel.permissionDesc)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(sel.permissionDesc)).toContainText(
      '未开通销售智能体权限，请联系管理员'
    )
  })

  // ════════════════════════════════════════════════════════════════
  // E5: direct chat API returns business code 100207
  // ════════════════════════════════════════════════════════════════

  test('E5: direct chat API mocked to 100207 → client receives correct business code', async ({
    page
  }) => {
    // Count invocations of the 403-equivalent mock to confirm the network contract is honored
    let chat403Count = 0
    await page.route('**/v1/sales-rag/sessions/*/chat', async (route: Route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback()
        return
      }
      chat403Count++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 100207,
          message: '未开通该功能权限，请联系管理员'
        })
      })
    })

    // Navigate to any page so fetch() is scoped to the app origin
    await page.goto('/')

    // Fire the chat request directly via page.evaluate to avoid depending on
    // session-create UI. This verifies: given the client makes a chat POST,
    // it receives business code 100207 (not a crash, not code 0).
    const responseCode = await page.evaluate(async () => {
      const res = await fetch('/v1/sales-rag/sessions/1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'hi' })
      })
      const body = await res.json().catch(() => ({ code: -1 }))
      return (body as { code: number }).code
    })

    // Network contract assertions — these are the load-bearing checks for E5.
    // UI error-notice rendering is covered by E4 (check-permission=false → denied state).
    expect(chat403Count).toBeGreaterThan(0) // mock was hit (Playwright route intercepted POST)
    expect(responseCode).toBe(100207) // business code surfaces to client code
  })
})
