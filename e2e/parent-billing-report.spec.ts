import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Parent Billing Report E2E (父账户自助费用对账)
 *
 * Verifies the critical user path for the parent self-service billing page:
 *   1. Entry: 客户管理页 "费用对账" 页面级按钮 → 导航到 /customers/billing
 *   2. Success: 明细表渲染 + 合计金额 = 各行金额之和（关键不变式）
 *   3. Empty: 该月无开通 → 空状态 + 合计 ¥0.00
 *   4. Error + retry: 接口失败 → error 状态 + retry，重试成功后渲染数据
 *
 * The billing API is MOCKED so the test is deterministic and independent of
 * the dev DB's B2B-grant state. The real amount-attribution logic (Rule A/B/
 * trial, ¥949 annual, 越权隔离, 与 admin 口径一致) is covered exhaustively by
 * the Go unit tests in internal/numind/biz/b2b_billing/b2b_billing_test.go.
 *
 * Prerequisites: auth setup runs first; the authenticated user must be a
 * parent account (parent_user_id IS NULL) — the same precondition as
 * customers.spec.ts / parent-self-grant.spec.ts.
 */

const sel = {
  entryBtn: '.hero-action-btn.secondary', // 客户管理 hero 区 "费用对账"
  page: '.billing-page',
  row: '.data-table tbody tr',
  badge: '.product-badge',
  amount: '.cell-amount',
  summaryTotal: '.summary-total',
  footTotal: '.total-amount',
  monthInput: '.month-input',
  stateEmpty: '.state-empty',
  stateError: '.state-error',
  retryBtn: '.retry-btn',
  stateLoading: '.state-loading'
} as const

const BILLING_GLOB = '**/v1/users/me/billing-report*'

function envelope(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ code: 0, message: 'ok', data })
  }
}

// 2 笔：月订阅 3 个月 ¥297 + 体验包 ¥9.9 → 合计 ¥306.9
const REPORT_WITH_DATA = {
  month: '2026-06',
  parent_user_id: 12,
  grants_count: 2,
  total_amount_cents: 30690,
  details: [
    {
      child_user_id: 34,
      child_username: '张三测试',
      product_type: 'monthly',
      months: 3,
      amount_cents: 29700,
      granted_at: '2026-06-03T08:00:00Z'
    },
    {
      child_user_id: 56,
      child_username: '李四测试',
      product_type: 'trial',
      months: 0,
      amount_cents: 990,
      granted_at: '2026-06-12T08:00:00Z'
    }
  ]
}

const REPORT_EMPTY = {
  month: '2026-06',
  parent_user_id: 12,
  grants_count: 0,
  total_amount_cents: 0,
  details: []
}

async function mockBilling(page: Page, data: unknown) {
  await page.route(BILLING_GLOB, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }
    await route.fulfill(envelope(data))
  })
}

// ══════════════════════════════════════════════════════════════════
// 1. Entry from 客户管理
// ══════════════════════════════════════════════════════════════════

test.describe('Parent Billing — Entry', () => {
  test('费用对账 button on /customers navigates to /customers/billing', async ({ page }) => {
    await mockBilling(page, REPORT_WITH_DATA)
    await page.goto('/customers')

    const entry = page.locator(sel.entryBtn, { hasText: '费用对账' })
    await expect(entry).toBeVisible({ timeout: 15_000 })
    await entry.click()

    await expect(page).toHaveURL(/\/customers\/billing$/, { timeout: 10_000 })
    await expect(page.locator(sel.page)).toBeVisible({ timeout: 10_000 })
  })
})

// ══════════════════════════════════════════════════════════════════
// 2. Success — table renders + total === sum of rows (关键不变式)
// ══════════════════════════════════════════════════════════════════

test.describe('Parent Billing — Success', () => {
  test('renders detail rows and the monthly total equals the sum of row amounts', async ({
    page
  }) => {
    await mockBilling(page, REPORT_WITH_DATA)
    await page.goto('/customers/billing')

    const rows = page.locator(sel.row)
    await expect(rows).toHaveCount(2, { timeout: 15_000 })

    // 子账号 + 会员类型标签
    await expect(rows.nth(0)).toContainText('张三测试')
    await expect(rows.nth(0).locator(sel.badge)).toHaveText('月订阅')
    await expect(rows.nth(0)).toContainText('3 个月')
    await expect(rows.nth(0).locator(sel.amount)).toHaveText('¥297.00')

    await expect(rows.nth(1)).toContainText('李四测试')
    await expect(rows.nth(1).locator(sel.badge)).toHaveText('体验包')
    await expect(rows.nth(1)).toContainText('3 天') // trial 显示天数而非 0 个月
    await expect(rows.nth(1).locator(sel.amount)).toHaveText('¥9.90')

    // 合计 = 各行金额之和（关键不变式：¥297.00 + ¥9.90 = ¥306.90）
    await expect(page.locator(sel.footTotal)).toHaveText('¥306.90')
    await expect(page.locator(sel.summaryTotal)).toHaveText('¥306.90')

    // 程序化校验合计 == 行金额求和（防止未来口径漂移）
    const rowCents = await page.locator(sel.amount).allTextContents()
    const sum = rowCents
      .map((t) => Math.round(parseFloat(t.replace('¥', '')) * 100))
      .reduce((a, b) => a + b, 0)
    expect(sum).toBe(30690)
  })
})

// ══════════════════════════════════════════════════════════════════
// 3. Empty month
// ══════════════════════════════════════════════════════════════════

test.describe('Parent Billing — Empty', () => {
  test('shows empty state with ¥0.00 when the month has no grants', async ({ page }) => {
    await mockBilling(page, REPORT_EMPTY)
    await page.goto('/customers/billing')

    await expect(page.locator(sel.stateEmpty)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(sel.stateEmpty)).toContainText('暂无开通记录')
    await expect(page.locator(sel.stateEmpty)).toContainText('¥0.00')
    await expect(page.locator(sel.row)).toHaveCount(0)
  })
})

// ══════════════════════════════════════════════════════════════════
// 4. Error + retry
// ══════════════════════════════════════════════════════════════════

test.describe('Parent Billing — Error & retry', () => {
  test('shows error state on failure, then renders data after retry', async ({ page }) => {
    // 首次请求失败
    let failFirst = true
    await page.route(BILLING_GLOB, async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback()
        return
      }
      if (failFirst) {
        failFirst = false
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 50000, message: 'internal' })
        })
        return
      }
      await route.fulfill(envelope(REPORT_WITH_DATA))
    })

    await page.goto('/customers/billing')

    // error 状态 + retry 按钮
    await expect(page.locator(sel.stateError)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(sel.retryBtn)).toBeVisible()

    // 重试 → 第二次返回成功 → 渲染明细
    await page.locator(sel.retryBtn).click()
    await expect(page.locator(sel.row)).toHaveCount(2, { timeout: 10_000 })
    await expect(page.locator(sel.footTotal)).toHaveText('¥306.90')
  })
})

// ══════════════════════════════════════════════════════════════════
// 5. Filter (#1) + Search (#2) + Sort (#3) + Month picker (#6)
// ══════════════════════════════════════════════════════════════════

test.describe('Parent Billing — Filter / Search / Sort / Month picker', () => {
  test.beforeEach(async ({ page }) => {
    await mockBilling(page, REPORT_WITH_DATA)
    await page.goto('/customers/billing')
    await expect(page.locator(sel.row)).toHaveCount(2, { timeout: 15_000 })
  })

  test('type filter narrows to 体验包; footer = filtered subset, summary = full month', async ({
    page
  }) => {
    await page.locator('.type-filter button', { hasText: '体验包' }).click()
    const rows = page.locator(sel.row)
    await expect(rows).toHaveCount(1)
    await expect(rows.first().locator(sel.badge)).toHaveText('体验包')
    await expect(page.locator(sel.footTotal)).toHaveText('¥9.90')
    await expect(page.locator(sel.summaryTotal)).toHaveText('¥306.90')

    await page.locator('.type-filter button', { hasText: '全部' }).click()
    await expect(rows).toHaveCount(2)
  })

  test('search by username and by id filters rows; no match shows hint', async ({ page }) => {
    await page.locator('.search-input').fill('张三')
    const rows = page.locator(sel.row)
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('张三测试')

    await page.locator('.search-input').fill('56')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('李四测试')

    await page.locator('.search-input').fill('zzz-none')
    await expect(page.locator('.no-match')).toBeVisible()
  })

  test('3-state sort on 价格: asc → desc → default', async ({ page }) => {
    const amountHeader = page.locator('.th-sortable', { hasText: '价格' })
    const firstAmount = () => page.locator(`${sel.row} ${sel.amount}`).first()

    await expect(firstAmount()).toHaveText('¥297.00') // default order

    await amountHeader.click()
    await expect(amountHeader).toHaveClass(/sort-asc/)
    await expect(firstAmount()).toHaveText('¥9.90')

    await amountHeader.click()
    await expect(amountHeader).toHaveClass(/sort-desc/)
    await expect(firstAmount()).toHaveText('¥297.00')

    await amountHeader.click()
    await expect(amountHeader).not.toHaveClass(/sort-asc|sort-desc/)
  })

  test('custom month picker opens a styled panel; selecting a month reloads', async ({ page }) => {
    await expect(page.locator('.month-panel')).toHaveCount(0)
    await page.locator('.month-trigger').click()
    await expect(page.locator('.month-panel')).toBeVisible()
    await expect(page.locator('.month-cell')).toHaveCount(12)
    await page.locator('.month-cell', { hasText: /^1 月$/ }).click()
    await expect(page.locator('.month-panel')).toHaveCount(0)
    await expect(page.locator(sel.row)).toHaveCount(2, { timeout: 10_000 })
  })
})
