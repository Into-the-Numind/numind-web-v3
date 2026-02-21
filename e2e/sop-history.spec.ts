import { test, expect } from '@playwright/test'

/**
 * SOP History List Page E2E tests (Phase 6.5).
 *
 * These tests verify the run history list page at /sop renders correctly,
 * including card list, manage mode, and navigation to execution page.
 *
 * Prerequisites: auth setup must run first (see playwright.config.ts).
 */

// ── Selectors ──────────────────────────────────────────────────────
const sel = {
  // Page structure
  historyPage: '.history-page',
  pageTitle: '.page-title',
  pageSubtitle: '.page-subtitle',
  manageBtn: '.manage-btn',

  // States
  loadingState: '.loading-state',
  emptyState: '.empty-state',

  // Card list
  cardList: '.card-list',
  runCard: '.run-card',
  cardName: '.card-name',
  statusBadge: '.status-badge',
  cardMeta: '.card-meta',
  progressBar: '.progress-bar',
  progressFill: '.progress-fill',
  progressText: '.progress-text',
  cardActionBtn: '.card-action-btn',

  // Manage mode
  checkboxWrapper: '.checkbox-wrapper',
  cardDeleteBtn: '.card-delete-btn',
  manageBar: '.manage-bar',
  manageCount: '.manage-count',
  manageSelectAll: '.manage-select-all',
  manageBatchDelete: '.manage-batch-delete',

  // Confirm dialog
  confirmOverlay: '.confirm-overlay',
  confirmDialog: '.confirm-dialog',
  confirmBtnCancel: '.confirm-btn-cancel',
  confirmBtnOk: '.confirm-btn-ok',

  // Toast
  toast: '.toast',

  // Sidebar
  sidebarNavItem: '.nav-item',
} as const

// ── Helpers ────────────────────────────────────────────────────────

/** Navigate to history page and wait for load to finish. */
async function goToHistory(page: import('@playwright/test').Page) {
  await page.goto('/sop')
  // Wait for either the card list, empty state, or loading to resolve
  await page.waitForFunction(
    () => {
      const loading = document.querySelector('.loading-state')
      // Loading finished when loading element is gone or cards/empty appeared
      return !loading ||
        document.querySelector('.card-list') !== null ||
        document.querySelector('.empty-state') !== null
    },
    null,
    { timeout: 30_000 },
  )
}

// ── Tests ──────────────────────────────────────────────────────────

test.describe('SOP History — Page Structure', () => {
  test('history page loads with correct title', async ({ page }) => {
    await goToHistory(page)

    await expect(page.locator(sel.historyPage)).toBeVisible()
    await expect(page.locator(sel.pageTitle)).toHaveText('我的任务记录')
    await expect(page.locator(sel.pageSubtitle)).toBeVisible()
  })

  test('sidebar highlights "运行记录" as active', async ({ page }) => {
    await goToHistory(page)

    const activeItem = page.locator(`${sel.sidebarNavItem}.active`)
    await expect(activeItem).toBeVisible()
    await expect(activeItem).toHaveText('运行记录')
  })

  test('page shows either card list or empty state after loading', async ({ page }) => {
    await goToHistory(page)

    const hasCards = await page.locator(sel.cardList).isVisible()
    const isEmpty = await page.locator(sel.emptyState).isVisible()

    // One of them must be true
    expect(hasCards || isEmpty).toBeTruthy()
    // They should be mutually exclusive
    expect(hasCards && isEmpty).toBeFalsy()
  })
})

test.describe('SOP History — Card List', () => {
  test('cards display template name, status, time and progress', async ({ page }) => {
    await goToHistory(page)

    const cards = page.locator(sel.runCard)
    const cardCount = await cards.count()

    if (cardCount === 0) {
      test.info().annotations.push({
        type: 'info',
        description: 'No run records found — card content tests skipped',
      })
      return
    }

    const firstCard = cards.first()

    // Template name should be visible
    await expect(firstCard.locator(sel.cardName)).toBeVisible()
    const name = await firstCard.locator(sel.cardName).textContent()
    expect(name!.trim().length).toBeGreaterThan(0)

    // Status badge
    await expect(firstCard.locator(sel.statusBadge)).toBeVisible()
    const statusText = await firstCard.locator(sel.statusBadge).textContent()
    expect(['进行中', '已完成', '已失败']).toContain(statusText!.trim())

    // Meta (execution time)
    await expect(firstCard.locator(sel.cardMeta)).toBeVisible()

    // Progress bar and text
    await expect(firstCard.locator(sel.progressBar)).toBeVisible()
    await expect(firstCard.locator(sel.progressText)).toBeVisible()
    const progressText = await firstCard.locator(sel.progressText).textContent()
    expect(progressText).toMatch(/\d+\/\d+/)
  })

  test('action button shows correct label based on status', async ({ page }) => {
    await goToHistory(page)

    const cards = page.locator(sel.runCard)
    const cardCount = await cards.count()

    if (cardCount === 0) return

    const firstCard = cards.first()
    const actionBtn = firstCard.locator(sel.cardActionBtn)
    await expect(actionBtn).toBeVisible()

    const btnText = await actionBtn.textContent()
    expect(['继续任务', '查看内容']).toContain(btnText!.trim())
  })

  test('clicking card navigates to SOP execution page', async ({ page }) => {
    await goToHistory(page)

    const cards = page.locator(sel.runCard)
    const cardCount = await cards.count()

    if (cardCount === 0) {
      test.info().annotations.push({
        type: 'info',
        description: 'No run records — navigation test skipped',
      })
      return
    }

    // Click the first card
    await cards.first().click()

    // Should navigate to /sop/run with query params
    await expect(page).toHaveURL(/\/sop\/run\?/, { timeout: 10_000 })

    // URL should contain runId and templateId
    const url = page.url()
    expect(url).toContain('runId=')
    expect(url).toContain('templateId=')
  })
})

test.describe('SOP History — Manage Mode', () => {
  test('manage button toggles manage mode', async ({ page }) => {
    await goToHistory(page)

    const cards = page.locator(sel.runCard)
    const cardCount = await cards.count()

    if (cardCount === 0) {
      test.info().annotations.push({
        type: 'info',
        description: 'No run records — manage mode test skipped',
      })
      return
    }

    const manageBtn = page.locator(sel.manageBtn)
    await expect(manageBtn).toBeVisible()
    await expect(manageBtn).toHaveText('管理')

    // Enter manage mode
    await manageBtn.click()
    await expect(manageBtn).toHaveText('完成')
    await expect(manageBtn).toHaveClass(/active/)

    // Checkboxes and manage bar should appear
    await expect(page.locator(sel.checkboxWrapper).first()).toBeVisible()
    await expect(page.locator(sel.manageBar)).toBeVisible()

    // Action buttons should be hidden, delete buttons visible
    await expect(page.locator(sel.cardActionBtn)).not.toBeVisible()
    await expect(page.locator(sel.cardDeleteBtn).first()).toBeVisible()

    // Exit manage mode
    await manageBtn.click()
    await expect(manageBtn).toHaveText('管理')
    await expect(page.locator(sel.checkboxWrapper)).not.toBeVisible()
    await expect(page.locator(sel.manageBar)).not.toBeVisible()
  })

  test('manage bar shows selection count and select all', async ({ page }) => {
    await goToHistory(page)

    const cards = page.locator(sel.runCard)
    const cardCount = await cards.count()

    if (cardCount === 0) return

    // Enter manage mode
    await page.locator(sel.manageBtn).click()

    // Initially 0 selected
    await expect(page.locator(sel.manageCount)).toHaveText('已选 0 项')

    // Batch delete should be disabled
    const batchDeleteBtn = page.locator(sel.manageBatchDelete)
    await expect(batchDeleteBtn).toBeDisabled()

    // Select first card
    await page.locator(sel.checkboxWrapper).first().click()
    await expect(page.locator(sel.manageCount)).toHaveText('已选 1 项')
    await expect(batchDeleteBtn).not.toBeDisabled()

    // Click select all
    await page.locator(sel.manageSelectAll).click()
    await expect(page.locator(sel.manageCount)).toHaveText(`已选 ${cardCount} 项`)
  })

  test('single delete shows confirm dialog', async ({ page }) => {
    await goToHistory(page)

    const cards = page.locator(sel.runCard)
    const cardCount = await cards.count()

    if (cardCount === 0) return

    // Enter manage mode
    await page.locator(sel.manageBtn).click()

    // Click delete on first card
    await page.locator(sel.cardDeleteBtn).first().click()

    // Confirm dialog should appear
    await expect(page.locator(sel.confirmOverlay)).toBeVisible({ timeout: 3_000 })
    await expect(page.locator(sel.confirmDialog)).toBeVisible()

    // Cancel to avoid actually deleting
    await page.locator(sel.confirmBtnCancel).click()
    await expect(page.locator(sel.confirmOverlay)).not.toBeVisible()
  })

  test('batch delete shows confirm dialog', async ({ page }) => {
    await goToHistory(page)

    const cards = page.locator(sel.runCard)
    const cardCount = await cards.count()

    if (cardCount === 0) return

    // Enter manage mode and select a card
    await page.locator(sel.manageBtn).click()
    await page.locator(sel.checkboxWrapper).first().click()

    // Click batch delete
    await page.locator(sel.manageBatchDelete).click()

    // Confirm dialog should appear
    await expect(page.locator(sel.confirmOverlay)).toBeVisible({ timeout: 3_000 })

    // Cancel
    await page.locator(sel.confirmBtnCancel).click()
    await expect(page.locator(sel.confirmOverlay)).not.toBeVisible()
  })
})

test.describe('SOP History — Navigation Integration', () => {
  test('home page SOP card navigates to /sop/run', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/')

    // Find and click a SOP workflow card (type="sop" cards)
    // They have card-title text that's not "销售智能体"
    const cards = page.locator('button.card')
    const cardCount = await cards.count()

    if (cardCount <= 1) {
      // Only the sales card exists, no SOP templates
      test.info().annotations.push({
        type: 'info',
        description: 'No SOP template cards on home page — navigation test skipped',
      })
      return
    }

    // Click the second card (first is sales agent)
    await cards.nth(1).click()

    // Should navigate to /sop/run (not /sop)
    await expect(page).toHaveURL(/\/sop\/run/, { timeout: 15_000 })
  })
})
