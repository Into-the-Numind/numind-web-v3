import { test, expect } from '@playwright/test'

/**
 * SOP Page UI/UX regression tests.
 *
 * These tests verify that the legacy SOP page renders correctly within V3
 * after the 1:1 migration. They check layout, CSS loading, and key elements.
 *
 * Prerequisites: auth setup must run first (see playwright.config.ts).
 */

// ── Selectors ──────────────────────────────────────────────────────
const sel = {
  // Loading / error
  loadingSpinner: '.legacy-loading-spinner',
  errorBox: '.legacy-error',

  // Top-level container
  sopContainer: '.sop-page-container',

  // Navigation
  backToHomeBtn: '.back-to-home-btn',
  historyBtn: '.history-btn',

  // Confirm dialog (must be hidden by default)
  confirmOverlay: '#confirm-dialog-overlay',
  confirmTitle: '#confirm-dialog-title',

  // History modal (must be hidden by default)
  historyOverlay: '#history-modal-overlay',

  // Page loading overlay
  pageLoadingOverlay: '#page-loading-overlay',

  // Stepper
  stepper: '.stepper',
  stepItems: '.stepper .step',
  activeStep: '.stepper .step.active',

  // Step content
  stepContent1: '#step-1',
  stepContent2: '#step-2',
  stepContent3: '#step-3',
  stepContent4: '#step-4',
  stepContent5: '#step-5',

  // Step 1 elements
  productInput: '#product-input',
  step1NextBtn: '#step1-next-btn',
  productFileInput: '#product-file-input',

  // Step 5 chat
  chatbotContainer: '#chatbot-container',
  chatbotInput: '#chatbot-input',
  chatbotSendBtn: '#chatbot-send-btn',

  // Input area
  chatbotInputArea: '#chatbot-input-area',

  // Main content
  mainContent: '.main-content',
} as const

// ── Helpers ────────────────────────────────────────────────────────

/** Navigate to SOP page with a template. Wait for legacy init. */
async function goToSOP(page: import('@playwright/test').Page, templateId = '1') {
  await page.goto(`/sop?templateId=${templateId}`)
  // Wait for legacy JS to initialize (loading spinner disappears, container shows)
  await expect(page.locator(sel.sopContainer)).toBeVisible({ timeout: 30_000 })
}

// ── Tests ──────────────────────────────────────────────────────────

test.describe('SOP Page — Layout & Rendering', () => {
  test('page loads without error, loading spinner disappears', async ({ page }) => {
    await page.goto('/sop?templateId=1')

    // Either loading spinner or main container should be visible quickly
    await expect(
      page.locator(`${sel.loadingSpinner}, ${sel.sopContainer}`).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Eventually main container shows up
    await expect(page.locator(sel.sopContainer)).toBeVisible({ timeout: 30_000 })

    // No error box
    await expect(page.locator(sel.errorBox)).not.toBeVisible()
  })

  test('body has sop-route class while on SOP page', async ({ page }) => {
    await goToSOP(page)
    const bodyClass = await page.evaluate(() => document.body.className)
    expect(bodyClass).toContain('sop-route')
  })

  test('confirm dialog is hidden by default', async ({ page }) => {
    await goToSOP(page)

    // The overlay should exist in DOM but not be visible
    const overlay = page.locator(sel.confirmOverlay)
    await expect(overlay).toBeAttached()

    // It should have display:none (not visible)
    const isVisible = await overlay.isVisible()
    expect(isVisible).toBe(false)

    // Verify it's not leaking text into the page
    const confirmTitle = page.locator(sel.confirmTitle)
    await expect(confirmTitle).not.toBeVisible()
  })

  test('history modal is hidden by default', async ({ page }) => {
    await goToSOP(page)
    const overlay = page.locator(sel.historyOverlay)
    await expect(overlay).toBeAttached()
    const isVisible = await overlay.isVisible()
    expect(isVisible).toBe(false)
  })

  test('main-content fills available width (flex layout works)', async ({ page }) => {
    await goToSOP(page)

    const mainContent = page.locator(sel.mainContent)
    await expect(mainContent).toBeVisible()

    const box = await mainContent.boundingBox()
    expect(box).not.toBeNull()
    // Main content should take most of the viewport width (sidebar is display:none)
    expect(box!.width).toBeGreaterThan(600)
  })
})

test.describe('SOP Page — Stepper', () => {
  test('stepper shows with correct number of steps', async ({ page }) => {
    await goToSOP(page)
    const stepper = page.locator(sel.stepper)
    await expect(stepper).toBeVisible()

    // Should have steps (at least 2, dynamically rendered by JS)
    const steps = page.locator(sel.stepItems)
    const count = await steps.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('first step is active by default', async ({ page }) => {
    await goToSOP(page)
    const activeStep = page.locator(sel.activeStep)
    await expect(activeStep).toBeVisible()

    // The active step should have data-step="1"
    const stepNumber = await activeStep.getAttribute('data-step')
    expect(stepNumber).toBe('1')
  })

  test('step 1 content is visible, other steps are hidden', async ({ page }) => {
    await goToSOP(page)

    // Step 1 should be visible (has .active class)
    const step1 = page.locator(sel.stepContent1)
    await expect(step1).toBeVisible()

    // Step 2 should not be visible
    const step2 = page.locator(sel.stepContent2)
    await expect(step2).not.toBeVisible()
  })
})

test.describe('SOP Page — Step 1 Elements', () => {
  test('product input textarea is visible and editable', async ({ page }) => {
    await goToSOP(page)

    const textarea = page.locator(sel.productInput)
    await expect(textarea).toBeVisible()

    // Should be editable
    await textarea.fill('Test product description')
    await expect(textarea).toHaveValue('Test product description')
  })

  test('next button exists in step 1', async ({ page }) => {
    await goToSOP(page)
    const btn = page.locator(sel.step1NextBtn)
    await expect(btn).toBeVisible()
  })

  test('file upload input exists (hidden)', async ({ page }) => {
    await goToSOP(page)
    const fileInput = page.locator(sel.productFileInput)
    await expect(fileInput).toBeAttached()
  })
})

test.describe('SOP Page — Navigation', () => {
  test('back-to-home button is visible and functional', async ({ page }) => {
    await goToSOP(page)
    const btn = page.locator(sel.backToHomeBtn)
    await expect(btn).toBeVisible()

    // Click should navigate to home
    await btn.click()
    await expect(page).toHaveURL('/', { timeout: 10_000 })
  })

  test('history button is visible', async ({ page }) => {
    await goToSOP(page)
    const btn = page.locator(sel.historyBtn)
    await expect(btn).toBeVisible()
  })

  test('body.sop-route is removed when navigating away', async ({ page }) => {
    await goToSOP(page)
    // Verify sop-route is present
    let bodyClass = await page.evaluate(() => document.body.className)
    expect(bodyClass).toContain('sop-route')

    // Navigate home
    await page.goto('/')
    await expect(page).toHaveURL('/')

    // sop-route should be removed
    bodyClass = await page.evaluate(() => document.body.className)
    expect(bodyClass).not.toContain('sop-route')
  })
})

test.describe('SOP Page — CSS Integrity', () => {
  test('legacy CSS is loaded in head', async ({ page }) => {
    await goToSOP(page)
    const cssLink = page.locator('link#sop-legacy-css')
    await expect(cssLink).toBeAttached()
    const href = await cssLink.getAttribute('href')
    expect(href).toContain('sop-legacy.css')
  })

  test('legacy CSS is removed when leaving SOP', async ({ page }) => {
    await goToSOP(page)
    // CSS should be present
    await expect(page.locator('link#sop-legacy-css')).toBeAttached()

    // Navigate away
    await page.goto('/')
    await expect(page).toHaveURL('/')

    // CSS should be removed
    await expect(page.locator('link#sop-legacy-css')).not.toBeAttached()
  })

  test('no unstyled text leaking at top of page', async ({ page }) => {
    await goToSOP(page)

    // Get text of the first 100px of the page — should not contain raw dialog text
    const topText = await page.evaluate(() => {
      const el = document.elementFromPoint(10, 10)
      return el?.textContent?.trim() || ''
    })
    // "确认操作" or "取消" at top of page = broken dialog
    expect(topText).not.toContain('确认操作')
    expect(topText).not.toContain('确定要执行此操作吗')
  })

  test('.prose class styles are available (markdown rendering)', async ({ page }) => {
    await goToSOP(page)

    // Check that .prose has proper styles (font-size should be 14px from our CSS)
    const proseStyles = await page.evaluate(() => {
      // Create a temp element to test computed styles
      const el = document.createElement('div')
      el.className = 'prose'
      el.textContent = 'test'
      document.body.appendChild(el)
      const styles = window.getComputedStyle(el)
      const result = {
        fontSize: styles.fontSize,
        lineHeight: styles.lineHeight,
      }
      document.body.removeChild(el)
      return result
    })
    expect(proseStyles.fontSize).toBe('14px')
  })

  test('CSS variables are resolved (not raw var() strings)', async ({ page }) => {
    await goToSOP(page)

    // Check that --accent resolves to an actual color
    const accentColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    })
    // Should be an HSL value, not empty
    expect(accentColor).toBeTruthy()
    expect(accentColor).toContain('hsl')
  })
})

test.describe('SOP Page — Step 5 Chat Area', () => {
  test('chatbot input area exists in DOM', async ({ page }) => {
    await goToSOP(page)
    const inputArea = page.locator(sel.chatbotInputArea)
    await expect(inputArea).toBeAttached()
  })

  test('chatbot textarea exists', async ({ page }) => {
    await goToSOP(page)
    const chatInput = page.locator(sel.chatbotInput)
    await expect(chatInput).toBeAttached()
  })
})
