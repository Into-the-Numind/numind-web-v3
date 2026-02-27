import { test, expect } from '@playwright/test'
import { sidebar, header, newCustomerModal, profileModal, kbModal, chatStyleModal } from './helpers/selectors'

/**
 * Helper: wait for modal to close (open class removed).
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

test.describe('Sales Modals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sales')
    await page.waitForFunction(
      () => document.querySelector('#sessionsList') !== null,
      null,
      { timeout: 30_000 },
    )
    await page.waitForTimeout(1500)

    // Ensure an active session exists (modals need a session context)
    const sessionCount = await page.locator(sidebar.sessionItem).count()
    if (sessionCount === 0) {
      await page.locator(sidebar.newChatBtn).click()
      await expect(page.locator(`${newCustomerModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })
      await page.locator(newCustomerModal.overlay).locator('.btn-secondary').click()
      await waitForModalClose(page, newCustomerModal.overlay, 20_000)
      await expect(page.locator(sidebar.sessionItem).first()).toBeVisible({ timeout: 10_000 })
    } else {
      await page.locator(sidebar.sessionItem).first().click()
      await page.waitForTimeout(1000)
    }
  })

  test('customer profile modal – open, switch steps, close', async ({ page }) => {
    // Click profile button in header
    await page.locator(header.profileBtn).click()

    // Profile modal should appear (with .open class)
    await expect(page.locator(`${profileModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(profileModal.title)).toHaveText('客户档案')

    // Display step should be active by default (uses display:flex via .active class)
    await expect(page.locator(profileModal.stepDisplay)).toBeVisible()

    // Either empty state or content should be visible
    const isEmpty = await page.locator(profileModal.displayEmpty).isVisible()
    const hasContent = await page.locator(profileModal.displayContent).isVisible()
    expect(isEmpty || hasContent).toBeTruthy()

    // Click "创建档案" button to switch to input step (only if empty)
    if (isEmpty) {
      await page.locator(profileModal.createBtn).click()
      await expect(page.locator(profileModal.stepInput)).toBeVisible({ timeout: 3_000 })
    }

    // Close modal
    await page.locator(profileModal.closeBtn).click()
    await waitForModalClose(page, profileModal.overlay)
  })

  test('knowledge base modal – open, view categories, close', async ({ page }) => {
    // Click KB button
    await page.locator(header.kbBtn).click()

    // KB modal should appear
    await expect(page.locator(`${kbModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(kbModal.title)).toHaveText('知识库配置')

    // Wait for loading to finish
    await page.waitForFunction(
      () => {
        const loading = document.getElementById('kbLoading')
        return !loading || loading.style.display === 'none'
      },
      null,
      { timeout: 15_000 },
    )

    // Either overview or wizard view should be visible
    const overviewVisible = await page.locator(kbModal.viewOverview).isVisible()
    const wizardVisible = await page.locator(kbModal.viewWizard).isVisible()
    expect(overviewVisible || wizardVisible).toBeTruthy()

    if (overviewVisible) {
      // Overview grid should show category cards
      const cards = page.locator(`${kbModal.overviewGrid} > *`)
      await expect(cards.first()).toBeVisible({ timeout: 5_000 })
    }

    if (wizardVisible) {
      // Wizard steps should show 3 steps (产品文档, 成功案例, 百问百答)
      const steps = page.locator(`${kbModal.wizardSteps} .kb-step`)
      await expect(steps).toHaveCount(3)
    }

    // Close modal
    await page.locator(kbModal.closeBtn).click()
    await waitForModalClose(page, kbModal.overlay)
  })

  test('chat style modal – open and close', async ({ page }) => {
    // Click chat style button
    await page.locator(header.chatStyleBtn).click()

    // Chat style modal should appear
    await expect(page.locator(`${chatStyleModal.overlay}.open`)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(chatStyleModal.title)).toHaveText('语言风格')

    // Display step should be visible (uses .active class → display: flex)
    await expect(page.locator(chatStyleModal.stepDisplay)).toBeVisible()

    // Close modal
    await page.locator(chatStyleModal.closeBtn).click()
    await waitForModalClose(page, chatStyleModal.overlay)
  })
})
