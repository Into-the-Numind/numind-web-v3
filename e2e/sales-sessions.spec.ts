import { test, expect } from '@playwright/test'
import { sidebar, header, chat, newCustomerModal, renameModal, deleteModal } from './helpers/selectors'

/**
 * Helper: wait for modal to close.
 * Modals use CSS `opacity: 0` + class `.open` toggle (not display: none),
 * and some close actions are async (await createSession, etc.),
 * so we wait for the `.open` class to be removed.
 */
async function waitForModalClose(page: import('@playwright/test').Page, overlaySelector: string, timeout = 15_000) {
  await page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel)
      return el && !el.classList.contains('open')
    },
    overlaySelector,
    { timeout },
  )
}

test.describe('Sales Sessions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sales')
    // Wait for legacy JS to initialize (it creates DOM elements dynamically)
    await page.waitForFunction(
      () => document.querySelector('#sessionsList') !== null,
      null,
      { timeout: 30_000 },
    )
    // Give legacy a moment to finish async init
    await page.waitForTimeout(1500)
  })

  test('sales page loads with welcome screen or session list', async ({ page }) => {
    // Either the welcome screen is visible (no sessions) or chat wrapper has content
    const welcomeVisible = await page.locator(chat.welcomeScreen).isVisible()
    const sessionsVisible = await page.locator(sidebar.sessionsList).isVisible()

    expect(welcomeVisible || sessionsVisible).toBeTruthy()

    // Header should always render
    await expect(page.locator(header.sessionTitle)).toBeVisible()
  })

  test('create new session via customer name modal', async ({ page }) => {
    // Click "New Chat" button
    await page.locator(sidebar.newChatBtn).click()

    // Customer profile modal should appear (has .open class)
    await expect(page.locator(`${newCustomerModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })

    // Fill in customer name
    const testName = `测试客户_${Date.now()}`
    await page.locator(newCustomerModal.nameInput).fill(testName)

    // Submit the form — this triggers submitCustomerProfile() which is async:
    // it awaits createSession + switchSession, then removes .open
    await page.locator(newCustomerModal.overlay).locator('.btn-primary').click()

    // Wait for modal to close (async: creates session on backend first)
    await waitForModalClose(page, newCustomerModal.overlay, 20_000)

    // A new session should appear in the sidebar
    await expect(page.locator(sidebar.sessionItem).first()).toBeVisible({ timeout: 10_000 })
  })

  test('rename and delete session', async ({ page }) => {
    // Ensure at least one session exists – create if needed
    const sessionCount = await page.locator(sidebar.sessionItem).count()
    if (sessionCount === 0) {
      await page.locator(sidebar.newChatBtn).click()
      await expect(page.locator(`${newCustomerModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })
      await page.locator(newCustomerModal.overlay).locator('.btn-secondary').click() // skip
      await waitForModalClose(page, newCustomerModal.overlay)
      await expect(page.locator(sidebar.sessionItem).first()).toBeVisible({ timeout: 10_000 })
    }

    // Open context menu on the first session
    const firstSession = page.locator(sidebar.sessionItem).first()
    await firstSession.locator(sidebar.sessionMenuBtn).click()

    // Click rename menu item
    const renameMenuItem = firstSession.locator(sidebar.sessionMenuItem).filter({ hasText: /重命名|rename/i })
    await renameMenuItem.click()

    // Rename modal should appear
    await expect(page.locator(`${renameModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })

    // Type new name
    const newTitle = `重命名测试_${Date.now()}`
    await page.locator(renameModal.input).fill(newTitle)
    await page.locator(renameModal.confirmBtn).click()

    // Wait for modal to close
    await waitForModalClose(page, renameModal.overlay)

    // Wait for the session title to update in the sidebar
    await expect(firstSession).toContainText(newTitle, { timeout: 10_000 })

    // Now delete the session
    await firstSession.locator(sidebar.sessionMenuBtn).click()
    const deleteMenuItem = firstSession.locator(sidebar.sessionMenuItem).filter({ hasText: /删除|delete/i })
    await deleteMenuItem.click()

    // Delete confirmation modal
    await expect(page.locator(`${deleteModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })
    await page.locator(deleteModal.confirmBtn).click()

    // Wait for modal to close
    await waitForModalClose(page, deleteModal.overlay)
  })
})
