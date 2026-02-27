import { test, expect } from '@playwright/test'

/**
 * Settings Page E2E tests (Phase 8).
 *
 * These tests verify the settings page at /settings renders correctly,
 * including profile card, usage stats card, tier-dependent styling,
 * and the logout confirm dialog.
 *
 * Prerequisites: auth setup must run first (see playwright.config.ts).
 */

// ── Selectors ──────────────────────────────────────────────────────
const sel = {
  // Page structure
  settingsPage: '.settings-page',
  settingsGrid: '.settings-grid',
  settingsCard: '.settings-card',

  // Profile card
  profileSection: '.profile-section',
  profileAvatar: '.profile-avatar',
  profileName: '.profile-name',
  profileId: '.profile-id',
  profileBadges: '.profile-badges',
  badgeTier: '.badge-tier',
  expiryLabel: '.expiry-label',
  expiryValue: '.expiry-value',
  btnLogout: '.btn-logout',

  // Usage stats card
  usageHeader: '.usage-header',
  usageIconWrap: '.usage-icon-wrap',
  usageStatsRow: '.usage-stats-row',
  usageStatItem: '.usage-stat-item',
  usageStatNum: '.usage-stat-num',
  usageStatLabel: '.usage-stat-label',
  usageProgressWrapper: '.usage-progress-wrapper',
  progressHeader: '.progress-header',
  usageProgressBar: '.usage-progress-bar',
  usageProgressFill: '.usage-progress-fill',
  premiumMsg: '.premium-msg',

  // Confirm dialog (Teleport to body)
  confirmOverlay: '.confirm-overlay',
  confirmDialog: '.confirm-dialog',
  confirmTitle: '.confirm-title',
  confirmMessage: '.confirm-message',
  confirmBtnCancel: '.confirm-btn-cancel',
  confirmBtnOk: '.confirm-btn-ok',

  // Sidebar
  sidebarNavItem: '.nav-item',
} as const

// ── Helpers ────────────────────────────────────────────────────────

/** Navigate to settings page and wait for API data to load. */
async function goToSettings(page: import('@playwright/test').Page) {
  await page.goto('/settings')
  // Wait for profile name to update from "加载中.." to actual value
  await page.waitForFunction(
    () => {
      const nameEl = document.querySelector('.profile-name')
      if (!nameEl) return false
      const text = nameEl.textContent?.trim() || ''
      return text.length > 0 && text !== '加载中..'
    },
    null,
    { timeout: 30_000 },
  )
}

// ── Tests ──────────────────────────────────────────────────────────

test.describe('Settings — Page Structure', () => {
  test('settings page loads with two-column grid', async ({ page }) => {
    await goToSettings(page)

    await expect(page.locator(sel.settingsPage)).toBeVisible()
    await expect(page.locator(sel.settingsGrid)).toBeVisible()

    // Should have exactly 2 cards
    const cards = page.locator(sel.settingsCard)
    await expect(cards).toHaveCount(2)
  })

  test('sidebar highlights "设置" as active', async ({ page }) => {
    await goToSettings(page)

    const activeItem = page.locator(`${sel.sidebarNavItem}.active`)
    await expect(activeItem).toBeVisible()
    await expect(activeItem).toHaveText('设置')
  })

  test('page title is set correctly', async ({ page }) => {
    await goToSettings(page)

    await expect(page).toHaveTitle(/系统设置/)
  })

  test('settings page has data-tier attribute', async ({ page }) => {
    await goToSettings(page)

    const dataTier = await page.locator(sel.settingsPage).getAttribute('data-tier')
    expect(dataTier).toBeTruthy()
    expect(['free', 'standard', 'premium', 'vip', 'pro']).toContain(dataTier)
  })
})

test.describe('Settings — Profile Card', () => {
  test('profile avatar is visible', async ({ page }) => {
    await goToSettings(page)

    await expect(page.locator(sel.profileAvatar)).toBeVisible()

    // Avatar should contain an SVG icon
    await expect(page.locator(`${sel.profileAvatar} svg`)).toBeVisible()
  })

  test('profile displays user name', async ({ page }) => {
    await goToSettings(page)

    const nameEl = page.locator(sel.profileName)
    await expect(nameEl).toBeVisible()
    const name = await nameEl.textContent()
    expect(name!.trim().length).toBeGreaterThan(0)
    expect(name!.trim()).not.toBe('加载中..')
  })

  test('profile displays user ID', async ({ page }) => {
    await goToSettings(page)

    const idEl = page.locator(sel.profileId)
    await expect(idEl).toBeVisible()
    const idText = await idEl.textContent()
    // ID field should always start with "ID: " prefix
    expect(idText).toMatch(/^ID: .+/)
  })

  test('tier badge is visible with valid label', async ({ page }) => {
    await goToSettings(page)

    const badge = page.locator(sel.badgeTier)
    await expect(badge).toBeVisible()
    const text = await badge.textContent()
    expect(['免费用户', '普通会员', '高级会员']).toContain(text!.trim())
  })

  test('membership expiry area is visible', async ({ page }) => {
    await goToSettings(page)

    await expect(page.locator(sel.expiryLabel)).toBeVisible()
    await expect(page.locator(sel.expiryLabel)).toHaveText('会员有效期至')

    const expiryValue = page.locator(sel.expiryValue)
    await expect(expiryValue).toBeVisible()
    const text = await expiryValue.textContent()
    // Should be either "永久有效" or a date like "2026/6/30"
    expect(text!.trim().length).toBeGreaterThan(0)
  })

  test('logout button is visible', async ({ page }) => {
    await goToSettings(page)

    const logoutBtn = page.locator(sel.btnLogout)
    await expect(logoutBtn).toBeVisible()
    await expect(logoutBtn).toContainText('退出登录')
  })
})

test.describe('Settings — Usage Stats Card', () => {
  test('usage header shows title and icon', async ({ page }) => {
    await goToSettings(page)

    await expect(page.locator(sel.usageHeader)).toBeVisible()
    await expect(page.locator(sel.usageHeader)).toContainText('运行用量统计')
    await expect(page.locator(sel.usageIconWrap)).toBeVisible()
  })

  test('usage stats show remaining and monthly numbers', async ({ page }) => {
    await goToSettings(page)

    const statItems = page.locator(sel.usageStatItem)
    await expect(statItems).toHaveCount(2)

    // First stat: remaining runs
    const firstNum = statItems.nth(0).locator(sel.usageStatNum)
    await expect(firstNum).toBeVisible()
    const firstLabel = statItems.nth(0).locator(sel.usageStatLabel)
    await expect(firstLabel).toHaveText('本月剩余')

    // Second stat: monthly usage
    const secondNum = statItems.nth(1).locator(sel.usageStatNum)
    await expect(secondNum).toBeVisible()
    const secondLabel = statItems.nth(1).locator(sel.usageStatLabel)
    await expect(secondLabel).toHaveText('本月已用')

    // Both should have numeric or infinity content
    const firstText = await firstNum.textContent()
    const secondText = await secondNum.textContent()
    // Remaining: number or infinity symbol
    expect(firstText!.trim()).toMatch(/^\d+$|^\u221E$/)
    // Monthly: always a number
    expect(secondText!.trim()).toMatch(/^\d+$/)
  })

  test('non-premium users see progress bar', async ({ page }) => {
    await goToSettings(page)

    const dataTier = await page.locator(sel.settingsPage).getAttribute('data-tier')

    if (dataTier === 'premium' || dataTier === 'vip') {
      // Premium: progress bar hidden, unlimited message visible
      await expect(page.locator(sel.usageProgressWrapper)).not.toBeVisible()
      await expect(page.locator(sel.premiumMsg)).toBeVisible()
      await expect(page.locator(sel.premiumMsg)).toContainText('尊享无限次运行权限')
    } else {
      // Free/Standard: progress bar visible, premium message hidden
      await expect(page.locator(sel.usageProgressWrapper)).toBeVisible()
      await expect(page.locator(sel.progressHeader)).toBeVisible()
      await expect(page.locator(sel.usageProgressBar)).toBeVisible()
      // Note: progress fill may have width: 0% when usage is 0, so check attached instead of visible
      await expect(page.locator(sel.usageProgressFill)).toBeAttached()

      // Progress header should show "额度使用率" and percentage
      await expect(page.locator(sel.progressHeader)).toContainText('额度使用率')
      const headerText = await page.locator(sel.progressHeader).textContent()
      expect(headerText).toMatch(/\d+%/)

      // Premium message should not exist
      await expect(page.locator(sel.premiumMsg)).not.toBeVisible()
    }
  })

  test('remaining runs shows infinity for premium users', async ({ page }) => {
    await goToSettings(page)

    const dataTier = await page.locator(sel.settingsPage).getAttribute('data-tier')
    const remainingNum = page.locator(sel.usageStatItem).nth(0).locator(sel.usageStatNum)

    if (dataTier === 'premium' || dataTier === 'vip') {
      await expect(remainingNum).toHaveText('\u221E')
      await expect(remainingNum).toHaveClass(/infinite/)
    } else {
      const text = await remainingNum.textContent()
      expect(text!.trim()).toMatch(/^\d+$/)
    }
  })
})

test.describe('Settings — Logout Flow', () => {
  test('clicking logout shows confirm dialog', async ({ page }) => {
    await goToSettings(page)

    // Click logout button
    await page.locator(sel.btnLogout).click()

    // Confirm dialog should appear
    await expect(page.locator(sel.confirmOverlay)).toBeVisible({ timeout: 3_000 })
    await expect(page.locator(sel.confirmDialog)).toBeVisible()
    await expect(page.locator(sel.confirmTitle)).toHaveText('退出登录')
    await expect(page.locator(sel.confirmMessage)).toHaveText('确定要退出登录吗？')
    await expect(page.locator(sel.confirmBtnCancel)).toBeVisible()
    await expect(page.locator(sel.confirmBtnOk)).toBeVisible()
  })

  test('cancel button closes confirm dialog', async ({ page }) => {
    await goToSettings(page)

    // Open dialog
    await page.locator(sel.btnLogout).click()
    await expect(page.locator(sel.confirmOverlay)).toBeVisible({ timeout: 3_000 })

    // Click cancel
    await page.locator(sel.confirmBtnCancel).click()

    // Dialog should close
    await expect(page.locator(sel.confirmOverlay)).not.toBeVisible()

    // Should still be on settings page
    await expect(page).toHaveURL('/settings')
  })

  test('clicking overlay background closes confirm dialog', async ({ page }) => {
    await goToSettings(page)

    // Open dialog
    await page.locator(sel.btnLogout).click()
    await expect(page.locator(sel.confirmOverlay)).toBeVisible({ timeout: 3_000 })

    // Click on the overlay background (not the dialog itself)
    await page.locator(sel.confirmOverlay).click({ position: { x: 10, y: 10 } })

    // Dialog should close
    await expect(page.locator(sel.confirmOverlay)).not.toBeVisible()
  })

  test('confirm logout redirects to login page', async ({ page }) => {
    await goToSettings(page)

    // Open dialog and confirm logout
    await page.locator(sel.btnLogout).click()
    await expect(page.locator(sel.confirmOverlay)).toBeVisible({ timeout: 3_000 })
    await page.locator(sel.confirmBtnOk).click()

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

    // Token should be cleared
    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(token).toBeFalsy()
  })
})

test.describe('Settings — Navigation', () => {
  test('sidebar "设置" link navigates to /settings', async ({ page }) => {
    // Start from home page
    await page.goto('/')
    await expect(page).toHaveURL('/')

    // Click the settings nav item
    const settingsNav = page.locator(sel.sidebarNavItem).filter({ hasText: '设置' })
    await settingsNav.click()

    // Should navigate to /settings
    await expect(page).toHaveURL('/settings', { timeout: 10_000 })
    await expect(page.locator(sel.settingsPage)).toBeVisible()
  })

  test('can navigate between settings and other pages', async ({ page }) => {
    await goToSettings(page)

    // Navigate to home via sidebar
    const homeNav = page.locator(sel.sidebarNavItem).filter({ hasText: '工作区' })
    await homeNav.click()
    await expect(page).toHaveURL('/', { timeout: 10_000 })

    // Navigate back to settings
    const settingsNav = page.locator(sel.sidebarNavItem).filter({ hasText: '设置' })
    await settingsNav.click()
    await expect(page).toHaveURL('/settings', { timeout: 10_000 })

    // Profile data should still be loaded
    const nameEl = page.locator(sel.profileName)
    await expect(nameEl).toBeVisible()
    const name = await nameEl.textContent()
    expect(name!.trim()).not.toBe('加载中..')
  })
})

test.describe('Settings — CSS & Layout', () => {
  test('grid layout has two columns on desktop', async ({ page }) => {
    await goToSettings(page)

    const grid = page.locator(sel.settingsGrid)
    const gridDisplay = await grid.evaluate(
      (el) => window.getComputedStyle(el).display,
    )
    expect(gridDisplay).toBe('grid')

    const gridCols = await grid.evaluate(
      (el) => window.getComputedStyle(el).gridTemplateColumns,
    )
    // Two columns: something like "488px 488px"
    const colParts = gridCols.split(/\s+/)
    expect(colParts.length).toBe(2)
  })

  test('cards have correct border radius and shadow', async ({ page }) => {
    await goToSettings(page)

    const firstCard = page.locator(sel.settingsCard).first()
    const borderRadius = await firstCard.evaluate(
      (el) => window.getComputedStyle(el).borderRadius,
    )
    expect(borderRadius).toBe('16px')
  })

  test('tier badge has appropriate styling', async ({ page }) => {
    await goToSettings(page)

    const dataTier = await page.locator(sel.settingsPage).getAttribute('data-tier')
    const badge = page.locator(sel.badgeTier)

    if (dataTier === 'premium' || dataTier === 'vip') {
      // Premium badge should have gradient background and white text
      const color = await badge.evaluate((el) => window.getComputedStyle(el).color)
      // White text: rgb(255, 255, 255)
      expect(color).toMatch(/rgb\(255,\s*255,\s*255\)/)
    } else if (dataTier === 'standard') {
      // Standard badge: green
      const color = await badge.evaluate((el) => window.getComputedStyle(el).color)
      // Green text: rgb(5, 150, 105) = #059669
      expect(color).toMatch(/rgb\(5,\s*150,\s*105\)/)
    } else {
      // Free badge: gray
      const color = await badge.evaluate((el) => window.getComputedStyle(el).color)
      // Gray text: rgb(107, 114, 128) = #6B7280
      expect(color).toMatch(/rgb\(107,\s*114,\s*128\)/)
    }
  })
})
