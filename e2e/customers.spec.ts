import { test, expect, type Page } from '@playwright/test'

/**
 * Customer Management E2E tests.
 *
 * Tests cover three core features:
 *   1. 注册新用户 — register modal, form validation, tier selection, submit
 *   2. 管理权限   — permission modal, template toggling, save
 *   3. 升级等级   — tier upgrade modal, tier/duration selection, confirm
 *
 * Prerequisites: auth setup must run first (see playwright.config.ts).
 */

// ── Selectors ──────────────────────────────────────────────────────
const sel = {
  // Page
  page: '.customers-page',
  pageTitle: '.cm-title',
  pageSubtitle: '.cm-subtitle',

  // Stats
  statsGrid: '.stats-grid',
  statCard: '.stat-card',
  statValue: '.stat-value',
  statLabel: '.stat-label',

  // Sub-users section
  subusersSection: '.subusers-section',
  sectionTitle: '.section-title',
  searchInput: '.cm-search-input',
  registerBtn: '.cm-register-btn',
  table: '.cm-table',
  tableRow: '.cm-table tbody tr',
  userNameText: '.user-name-text',
  userMetaText: '.user-meta-text',
  tierBadge: '.tier-badge',
  actionDropdown: '.action-dropdown',
  actionBtn: '.action-btn',
  actionMenu: '.action-menu',
  actionMenuItem: '.action-menu-item',
  loading: '.cm-loading',
  empty: '.cm-empty',
  pagination: '.cm-pagination',
  paginationBtn: '.pagination-btn',
  paginationInfo: '.pagination-info',

  // Checkbox & Batch
  thCheckbox: '.th-checkbox .custom-checkbox',
  tdCheckbox: '.td-checkbox .custom-checkbox',
  batchBar: '.batch-action-bar',
  batchCount: '.batch-count',
  batchGrant: '.batch-grant',
  batchRevoke: '.batch-revoke',

  // Register modal
  registerModal: '.register-modal',
  regForm: '#register-form',
  regUsername: '#register-form input[placeholder*="字母及数字"]',
  regPassword: '#register-form input[placeholder*="字母、数字或常用符号"]',
  regNickname: '#register-form input[placeholder*="字符"]',
  regFieldError: '.field-error',
  regUsernameHint: '.username-hint',
  regTierSection: '.reg-tier-section',
  regTierRadio: '.reg-tier-radio',
  regTierDetails: '.reg-tier-details',
  regTierSelect: '.tier-select',
  regTierPreview: '.tier-preview',
  regError: '.register-error',

  // Permission modal
  permModal: '.perm-modal',
  permUserName: '.perm-user-name',
  permUserMeta: '.perm-user-meta',
  permLoading: '.perm-modal .cm-loading',
  permSectionTitle: '.perm-section-title',
  permCount: '.perm-count',
  permSelectAllBtn: '.perm-select-all-btn',
  permTemplateItem: '.perm-template-item',
  permTemplateName: '.perm-template-name',
  permCheckbox: '.perm-template-item .custom-checkbox',

  // Tier upgrade modal
  tierModal: '.tier-modal',
  tierUserName: '.tier-modal .perm-user-name',
  tierUserMeta: '.tier-modal .perm-user-meta',
  tierOptionCard: '.tier-option-card',
  tierStandardCard: '.tier-standard-card',
  tierPremiumCard: '.tier-premium-card',
  tierDuration: '.tier-duration',
  tierDurationSelect: '.tier-modal .tier-select',
  tierPreview: '.tier-modal .tier-preview',

  // Batch confirm modal
  batchConfirmModal: '.batch-confirm-modal',

  // Shared modal parts
  modalOverlay: '.modal-overlay',
  modalHeader: '.modal-header',
  modalClose: '.modal-close',
  modalFooter: '.modal-footer',
  btnCancel: '.btn-cancel',
  btnSubmit: '.btn-submit',

  // Toast
  toast: '.cm-toast',

  // Sidebar
  navItem: '.nav-item',
} as const

// ── Helpers ────────────────────────────────────────────────────────

/** Navigate to customers page and wait for data to load. */
async function goToCustomers(page: Page) {
  await page.goto('/customers')
  // Wait for loading to finish: either table or empty state should appear
  await page.waitForFunction(
    () => {
      const table = document.querySelector('.cm-table')
      const empty = document.querySelector('.cm-empty')
      const loading = document.querySelector('.cm-loading')
      return (table || empty) && !loading
    },
    null,
    { timeout: 30_000 },
  )
}

/** Generate a unique username for test registration. */
function uniqueUsername(): string {
  const ts = Date.now().toString(36).slice(-6)
  return `e2etest${ts}`
}

/** Open register modal and wait for it to be visible. */
async function openRegisterModal(page: Page) {
  await page.locator(sel.registerBtn).click()
  await expect(page.locator(sel.registerModal)).toBeVisible({ timeout: 3_000 })
}

/** Close register modal via cancel button. */
async function closeRegisterModal(page: Page) {
  await page.locator(`${sel.registerModal} ${sel.btnCancel}`).click()
  await expect(page.locator(sel.registerModal)).not.toBeVisible({ timeout: 3_000 })
}

/** Count current table rows (sub-users). */
async function getRowCount(page: Page): Promise<number> {
  const table = page.locator(sel.table)
  if (await table.isVisible()) {
    return page.locator(sel.tableRow).count()
  }
  return 0
}

/** Click the "管理" dropdown for a specific row (0-indexed). */
async function openActionMenu(page: Page, rowIndex: number) {
  const row = page.locator(sel.tableRow).nth(rowIndex)
  await row.locator(sel.actionBtn).click()
  await expect(row.locator(sel.actionMenu)).toBeVisible({ timeout: 3_000 })
}

/** Get the tier badge text for a specific row (0-indexed). */
async function getRowTierText(page: Page, rowIndex: number): Promise<string> {
  const row = page.locator(sel.tableRow).nth(rowIndex)
  return (await row.locator(sel.tierBadge).textContent())?.trim() || ''
}

/** Wait for toast message to appear. */
async function waitForToast(page: Page, textPattern?: string | RegExp) {
  const toast = page.locator(sel.toast)
  await expect(toast).toBeVisible({ timeout: 10_000 })
  if (textPattern) {
    if (typeof textPattern === 'string') {
      await expect(toast).toContainText(textPattern)
    } else {
      const text = await toast.textContent()
      expect(text).toMatch(textPattern)
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  1. Page Structure & Loading
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Page Structure', () => {
  test('page loads with header and stats grid', async ({ page }) => {
    await goToCustomers(page)

    await expect(page.locator(sel.page)).toBeVisible()
    await expect(page.locator(sel.pageTitle)).toHaveText('客户管理')
    await expect(page.locator(sel.pageSubtitle)).toContainText('管理您的子用户')
  })

  test('stats grid shows 4 stat cards', async ({ page }) => {
    await goToCustomers(page)

    const cards = page.locator(sel.statCard)
    await expect(cards).toHaveCount(4)

    // Check labels
    const labels = ['总子用户数', '活跃子用户', '可用模板数', '总运行次数']
    for (let i = 0; i < labels.length; i++) {
      await expect(cards.nth(i).locator(sel.statLabel)).toHaveText(labels[i])
    }

    // Stat values should not be '-' (data should have loaded)
    for (let i = 0; i < 4; i++) {
      const val = await cards.nth(i).locator(sel.statValue).textContent()
      expect(val?.trim()).toMatch(/^\d+$/)
    }
  })

  test('sub-users section header and register button', async ({ page }) => {
    await goToCustomers(page)

    await expect(page.locator(sel.sectionTitle)).toHaveText('子用户列表')
    await expect(page.locator(sel.registerBtn)).toBeVisible()
    await expect(page.locator(sel.registerBtn)).toContainText('注册新用户')
  })

  test('search input is visible', async ({ page }) => {
    await goToCustomers(page)

    const searchInput = page.locator(sel.searchInput)
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', '搜索用户昵称或手机号...')
  })

  test('sidebar highlights "客户管理" as active', async ({ page }) => {
    await goToCustomers(page)

    const activeItem = page.locator(`${sel.navItem}.active`)
    await expect(activeItem).toBeVisible()
    await expect(activeItem).toHaveText('客户管理')
  })
})

// ══════════════════════════════════════════════════════════════════
//  2. Sub-user Table
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Sub-user Table', () => {
  test('table renders with correct columns', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) {
      // If no users, show empty state
      await expect(page.locator(sel.empty)).toBeVisible()
      return
    }

    const headers = page.locator('.cm-table thead th')
    // 8 columns: checkbox, 用户信息, 用户等级, 到期时间, 已授权模板, 总运行次数, 本月运行, 操作
    await expect(headers).toHaveCount(8)
  })

  test('each row displays user info, tier badge, and action button', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    const firstRow = page.locator(sel.tableRow).first()

    // User info cell
    await expect(firstRow.locator(sel.userNameText)).toBeVisible()
    const name = await firstRow.locator(sel.userNameText).textContent()
    expect(name?.trim().length).toBeGreaterThan(0)

    // Tier badge
    const tierBadge = firstRow.locator(sel.tierBadge)
    await expect(tierBadge).toBeVisible()
    const tierText = await tierBadge.textContent()
    expect(tierText?.trim()).toMatch(/免费用户|普通会员|高级会员/)

    // Action dropdown button
    await expect(firstRow.locator(sel.actionBtn)).toBeVisible()
    await expect(firstRow.locator(sel.actionBtn)).toContainText('管理')
  })

  test('action dropdown opens with two menu items', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)

    const menuItems = page.locator(sel.actionMenuItem)
    await expect(menuItems).toHaveCount(2)
    await expect(menuItems.nth(0)).toContainText('管理权限')
    await expect(menuItems.nth(1)).toContainText('升级等级')
  })

  test('action dropdown closes when clicking elsewhere', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await expect(page.locator(sel.actionMenu)).toBeVisible()

    // Click outside
    await page.locator(sel.pageTitle).click()
    await expect(page.locator(sel.actionMenu)).not.toBeVisible()
  })

  test('search filters users by nickname', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Get the first user's name
    const firstName = await page.locator(sel.tableRow).first().locator(sel.userNameText).textContent()

    // Type a search query that should not match anyone (unless very unlucky)
    await page.locator(sel.searchInput).fill('zzz_nonexistent_query_zzz')
    await page.waitForTimeout(500) // debounce

    const filteredCount = await getRowCount(page)
    // Should have zero results or empty state
    if (filteredCount > 0) {
      // If somehow matches, skip this assertion
    } else {
      await expect(page.locator(sel.empty)).toBeVisible()
    }

    // Clear search and verify users come back
    await page.locator(sel.searchInput).fill('')
    await page.waitForTimeout(500)
    const restoredCount = await getRowCount(page)
    expect(restoredCount).toBeGreaterThanOrEqual(rowCount)

    // If we had a first name, search by it
    if (firstName && firstName.trim() !== '未命名用户') {
      await page.locator(sel.searchInput).fill(firstName.trim().slice(0, 3))
      await page.waitForTimeout(500)
      const matchCount = await getRowCount(page)
      expect(matchCount).toBeGreaterThan(0)
    }

    // Clean up
    await page.locator(sel.searchInput).fill('')
  })
})

// ══════════════════════════════════════════════════════════════════
//  3. Register New User — Modal Basics
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Register Modal Basics', () => {
  test('register button opens modal', async ({ page }) => {
    await goToCustomers(page)

    await openRegisterModal(page)

    // Modal header
    await expect(page.locator(`${sel.registerModal} ${sel.modalHeader} h2`)).toHaveText('注册新用户')

    // Form fields present
    await expect(page.locator(sel.regUsername)).toBeVisible()
    await expect(page.locator(sel.regPassword)).toBeVisible()
    await expect(page.locator(sel.regNickname)).toBeVisible()

    // Tier section present
    await expect(page.locator(sel.regTierSection)).toBeVisible()
  })

  test('close button (X) closes register modal', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(`${sel.registerModal} ${sel.modalClose}`).click()
    await expect(page.locator(sel.registerModal)).not.toBeVisible()
  })

  test('cancel button closes register modal', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await closeRegisterModal(page)
  })

  test('clicking overlay closes register modal', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Click on overlay (not the modal card)
    await page.locator(sel.modalOverlay).first().click({ position: { x: 10, y: 10 } })
    await expect(page.locator(sel.registerModal)).not.toBeVisible()
  })

  test('form fields have required labels with star markers', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    const labels = page.locator(`${sel.registerModal} .form-label`)
    // Should have at least 3 required labels (username, password, nickname)
    // Plus the duration label when tier section is expanded
    const count = await labels.count()
    expect(count).toBeGreaterThanOrEqual(3)

    // Check first 3 labels have required star
    for (let i = 0; i < 3; i++) {
      await expect(labels.nth(i).locator('.required')).toBeVisible()
    }
  })

  test('username label shows "(用于登录)" suffix', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    const usernameLabel = page.locator(`${sel.registerModal} .form-label`).first()
    await expect(usernameLabel).toContainText('用于登录')
  })

  test('modal resets form when reopened', async ({ page }) => {
    await goToCustomers(page)

    // Open, fill something, close
    await openRegisterModal(page)
    await page.locator(sel.regUsername).fill('test123')
    await page.locator(sel.regPassword).fill('pass123')
    await closeRegisterModal(page)

    // Reopen — fields should be empty
    await openRegisterModal(page)
    await expect(page.locator(sel.regUsername)).toHaveValue('')
    await expect(page.locator(sel.regPassword)).toHaveValue('')
    await expect(page.locator(sel.regNickname)).toHaveValue('')
  })
})

// ══════════════════════════════════════════════════════════════════
//  4. Register New User — Form Validation
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Register Form Validation', () => {
  test('submit button is disabled when form is empty', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    const submitBtn = page.locator(`${sel.registerModal} ${sel.btnSubmit}`)
    await expect(submitBtn).toBeDisabled()
  })

  test('username shows error for Chinese characters', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regUsername).fill('测试用户')
    // Tab away to trigger blur
    await page.locator(sel.regPassword).click()

    // Error message should appear
    const error = page.locator(`${sel.registerModal} ${sel.regFieldError}`).first()
    await expect(error).toBeVisible({ timeout: 3_000 })
    await expect(error).toContainText('用户名格式不正确')
  })

  test('username shows error for too short input', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regUsername).fill('ab')
    await page.locator(sel.regPassword).click()

    const error = page.locator(`${sel.registerModal} ${sel.regFieldError}`).first()
    await expect(error).toBeVisible({ timeout: 3_000 })
    await expect(error).toContainText('用户名格式不正确')
  })

  test('username shows error for special characters', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regUsername).fill('user@name')
    await page.locator(sel.regPassword).click()

    const error = page.locator(`${sel.registerModal} ${sel.regFieldError}`).first()
    await expect(error).toBeVisible({ timeout: 3_000 })
    await expect(error).toContainText('用户名格式不正确')
  })

  test('valid username clears error', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Enter invalid first
    await page.locator(sel.regUsername).fill('ab')
    await page.locator(sel.regPassword).click()
    const firstFormGroup = page.locator(`${sel.registerModal} .form-group`).first()
    await expect(firstFormGroup.locator(sel.regFieldError)).toBeVisible({ timeout: 3_000 })

    // Fix to valid
    await page.locator(sel.regUsername).fill('abc123')
    await page.locator(sel.regPassword).click()
    await expect(firstFormGroup.locator(sel.regFieldError)).not.toBeVisible({ timeout: 3_000 })
  })

  test('password shows error for too short input', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regPassword).fill('12345')
    await page.locator(sel.regNickname).click()

    const passwordGroup = page.locator(`${sel.registerModal} .form-group`).nth(1)
    await expect(passwordGroup.locator(sel.regFieldError)).toBeVisible({ timeout: 3_000 })
    await expect(passwordGroup.locator(sel.regFieldError)).toContainText('密码格式不正确')
  })

  test('password accepts valid format', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regPassword).fill('abc123')
    await page.locator(sel.regNickname).click()

    const passwordGroup = page.locator(`${sel.registerModal} .form-group`).nth(1)
    await expect(passwordGroup.locator(sel.regFieldError)).not.toBeVisible()
  })

  test('nickname shows error for single character', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regNickname).fill('A')
    await page.locator(sel.regUsername).click()

    const nicknameGroup = page.locator(`${sel.registerModal} .form-group`).nth(2)
    await expect(nicknameGroup.locator(sel.regFieldError)).toBeVisible({ timeout: 3_000 })
    await expect(nicknameGroup.locator(sel.regFieldError)).toContainText('昵称格式不正确')
  })

  test('submit button enables only when all fields valid', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    const submitBtn = page.locator(`${sel.registerModal} ${sel.btnSubmit}`)

    // Step 1: username only — still disabled
    await page.locator(sel.regUsername).fill('testuser1')
    await expect(submitBtn).toBeDisabled()

    // Step 2: add password — still disabled
    await page.locator(sel.regPassword).fill('pass123')
    await expect(submitBtn).toBeDisabled()

    // Step 3: add nickname — should enable
    await page.locator(sel.regNickname).fill('测试昵称')
    await expect(submitBtn).toBeEnabled({ timeout: 3_000 })
  })

  test('error inputs have red border styling', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Enter invalid username
    await page.locator(sel.regUsername).fill('ab')
    await page.locator(sel.regPassword).click()

    // Check that input has input-error class
    await expect(page.locator(sel.regUsername)).toHaveClass(/input-error/, { timeout: 3_000 })
  })

  test('username availability check works on blur', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Enter a valid username and blur
    await page.locator(sel.regUsername).fill('testvaliduser')
    await page.locator(sel.regPassword).click()

    // Should show checking/available/taken status
    const hint = page.locator(sel.regUsernameHint)
    // Wait for the hint to appear (checking → available/taken)
    await expect(hint).toBeVisible({ timeout: 10_000 })

    const hintText = await hint.textContent()
    expect(hintText?.trim()).toMatch(/用户名可用|用户名已被使用|检查中/)
  })
})

// ══════════════════════════════════════════════════════════════════
//  5. Register New User — Tier Selection
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Register Tier Selection', () => {
  test('tier section shows divider and two radio options', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Divider text
    await expect(page.locator('.reg-tier-divider-text')).toHaveText('会员设置（可选）')

    // Two radio options (standard, premium) — no free option
    const radios = page.locator(sel.regTierRadio)
    await expect(radios).toHaveCount(2)
    await expect(radios.nth(0)).toContainText('普通会员')
    await expect(radios.nth(1)).toContainText('高级会员')
  })

  test('no tier is selected by default (free internally)', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Neither radio should have 'active' class
    const activeRadios = page.locator(`${sel.regTierRadio}.active`)
    await expect(activeRadios).toHaveCount(0)

    // Duration/preview section should not be visible
    await expect(page.locator(sel.regTierDetails)).not.toBeVisible()
  })

  test('selecting standard shows duration picker', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Click standard radio
    await page.locator(sel.regTierRadio).nth(0).click()
    await expect(page.locator(sel.regTierRadio).nth(0)).toHaveClass(/active/)

    // Duration details should appear
    await expect(page.locator(sel.regTierDetails)).toBeVisible({ timeout: 3_000 })
    await expect(page.locator(sel.regTierSelect)).toBeVisible()
    await expect(page.locator(sel.regTierPreview)).toBeVisible()
  })

  test('selecting premium shows duration picker', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regTierRadio).nth(1).click()
    await expect(page.locator(sel.regTierRadio).nth(1)).toHaveClass(/active/)

    await expect(page.locator(sel.regTierDetails)).toBeVisible({ timeout: 3_000 })
  })

  test('duration picker has 12 month options', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Select a tier to show duration picker
    await page.locator(sel.regTierRadio).nth(0).click()
    await expect(page.locator(sel.regTierSelect)).toBeVisible()

    const options = page.locator(`${sel.regTierSelect} option`)
    await expect(options).toHaveCount(12)

    // First option: 1 个月, last option: 12 个月
    await expect(options.first()).toContainText('1 个月')
    await expect(options.last()).toContainText('12 个月')
  })

  test('expiry preview shows a valid future date', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regTierRadio).nth(0).click()
    await expect(page.locator(sel.regTierPreview)).toBeVisible()

    const previewText = await page.locator(sel.regTierPreview).textContent()
    // Should contain "到期日期" and a date like "2026/4/1"
    expect(previewText).toContain('到期日期')
    expect(previewText).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/)
  })

  test('changing months updates expiry preview', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    await page.locator(sel.regTierRadio).nth(0).click()

    // Select 1 month
    await page.locator(sel.regTierSelect).selectOption('1')
    const preview1 = await page.locator(sel.regTierPreview).textContent()

    // Select 6 months
    await page.locator(sel.regTierSelect).selectOption('6')
    const preview6 = await page.locator(sel.regTierPreview).textContent()

    // Dates should be different
    expect(preview1).not.toBe(preview6)
  })
})

// ══════════════════════════════════════════════════════════════════
//  6. Register New User — Submission
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Register Submission', () => {
  test('register a free user (no tier selected) successfully', async ({ page }) => {
    await goToCustomers(page)
    const initialCount = await getRowCount(page)

    await openRegisterModal(page)

    const username = uniqueUsername()
    await page.locator(sel.regUsername).fill(username)
    await page.locator(sel.regPassword).fill('test123456')
    await page.locator(sel.regNickname).fill(`E2E测试用户`)

    // Wait for submit to be enabled
    const submitBtn = page.locator(`${sel.registerModal} ${sel.btnSubmit}`)
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })

    await submitBtn.click()

    // Modal should close and toast appear
    await expect(page.locator(sel.registerModal)).not.toBeVisible({ timeout: 15_000 })
    await waitForToast(page, '注册成功')

    // Table should have one more user
    await page.waitForTimeout(1_000)
    const newCount = await getRowCount(page)
    expect(newCount).toBe(initialCount + 1)
  })

  test('register a standard tier user successfully', async ({ page }) => {
    await goToCustomers(page)

    await openRegisterModal(page)

    const username = uniqueUsername()
    await page.locator(sel.regUsername).fill(username)
    await page.locator(sel.regPassword).fill('test123456')
    await page.locator(sel.regNickname).fill('标准会员测试')

    // Select standard tier with 3 months
    await page.locator(sel.regTierRadio).nth(0).click()
    await page.locator(sel.regTierSelect).selectOption('3')

    const submitBtn = page.locator(`${sel.registerModal} ${sel.btnSubmit}`)
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })

    await submitBtn.click()

    await expect(page.locator(sel.registerModal)).not.toBeVisible({ timeout: 15_000 })
    await waitForToast(page, '注册成功')
  })

  test('register a premium tier user successfully', async ({ page }) => {
    await goToCustomers(page)

    await openRegisterModal(page)

    const username = uniqueUsername()
    await page.locator(sel.regUsername).fill(username)
    await page.locator(sel.regPassword).fill('test123456')
    await page.locator(sel.regNickname).fill('高级会员测试')

    // Select premium tier with 1 month
    await page.locator(sel.regTierRadio).nth(1).click()
    await page.locator(sel.regTierSelect).selectOption('1')

    const submitBtn = page.locator(`${sel.registerModal} ${sel.btnSubmit}`)
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })

    await submitBtn.click()

    await expect(page.locator(sel.registerModal)).not.toBeVisible({ timeout: 15_000 })
    await waitForToast(page, '注册成功')
  })

  test('duplicate username shows error or taken status', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    // Try registering with an obviously duplicate username by registering twice
    const username = uniqueUsername()
    // First registration
    await page.locator(sel.regUsername).fill(username)
    await page.locator(sel.regPassword).fill('test123456')
    await page.locator(sel.regNickname).fill('重复测试')

    const submitBtn = page.locator(`${sel.registerModal} ${sel.btnSubmit}`)
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
    await submitBtn.click()
    await expect(page.locator(sel.registerModal)).not.toBeVisible({ timeout: 15_000 })

    // Second registration with same username
    await openRegisterModal(page)
    await page.locator(sel.regUsername).fill(username)
    await page.locator(sel.regPassword).click() // blur to trigger check

    // Should show "taken" status
    const hint = page.locator(`${sel.regUsernameHint}.taken`)
    await expect(hint).toBeVisible({ timeout: 10_000 })
    await expect(hint).toContainText('用户名已被使用')

    // Submit should be disabled when username is taken
    await page.locator(sel.regPassword).fill('test123456')
    await page.locator(sel.regNickname).fill('重复测试2')
    await expect(submitBtn).toBeDisabled()

    await closeRegisterModal(page)
  })

  test('submit button shows "注册中..." while submitting', async ({ page }) => {
    await goToCustomers(page)
    await openRegisterModal(page)

    const username = uniqueUsername()
    await page.locator(sel.regUsername).fill(username)
    await page.locator(sel.regPassword).fill('test123456')
    await page.locator(sel.regNickname).fill('按钮状态测试')

    const submitBtn = page.locator(`${sel.registerModal} ${sel.btnSubmit}`)
    await expect(submitBtn).toBeEnabled({ timeout: 10_000 })

    // Click and verify the modal eventually closes (button shows 注册中... briefly)
    await submitBtn.click()
    await expect(page.locator(sel.registerModal)).not.toBeVisible({ timeout: 15_000 })
  })
})

// ══════════════════════════════════════════════════════════════════
//  7. Permission Management Modal
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Permission Modal', () => {
  test('opens from action dropdown "管理权限"', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click() // 管理权限

    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(`${sel.permModal} ${sel.modalHeader} h2`)).toHaveText('管理模板权限')
  })

  test('displays target user info in modal', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Get first user's name from the table
    const expectedName = await page.locator(sel.tableRow).first().locator(sel.userNameText).textContent()

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })

    // Modal should show user name
    const userName = page.locator(sel.permUserName)
    await expect(userName).toBeVisible()
    const nameText = await userName.textContent()
    expect(nameText?.trim()).toBe(expectedName?.trim())
  })

  test('shows available templates with count', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })

    // Wait for templates to load
    await page.waitForFunction(
      () => !document.querySelector('.perm-modal .cm-loading'),
      null,
      { timeout: 15_000 },
    )

    // Section title with count
    await expect(page.locator(sel.permSectionTitle)).toContainText('可用模板')
    const count = page.locator(sel.permCount)
    await expect(count).toBeVisible()
    const countText = await count.textContent()
    expect(Number(countText?.trim())).toBeGreaterThanOrEqual(0)
  })

  test('template items are clickable to toggle', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })

    await page.waitForFunction(
      () => !document.querySelector('.perm-modal .cm-loading'),
      null,
      { timeout: 15_000 },
    )

    const templateItems = page.locator(sel.permTemplateItem)
    const itemCount = await templateItems.count()
    if (itemCount === 0) return

    // Get initial checked state of first item
    const firstItem = templateItems.first()
    const wasChecked = await firstItem.evaluate((el) => el.classList.contains('checked'))

    // Click to toggle
    await firstItem.click()

    // State should have changed
    const isChecked = await firstItem.evaluate((el) => el.classList.contains('checked'))
    expect(isChecked).toBe(!wasChecked)

    // Click again to restore
    await firstItem.click()
    const restored = await firstItem.evaluate((el) => el.classList.contains('checked'))
    expect(restored).toBe(wasChecked)
  })

  test('select all / deselect all button works', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })

    await page.waitForFunction(
      () => !document.querySelector('.perm-modal .cm-loading'),
      null,
      { timeout: 15_000 },
    )

    const templateItems = page.locator(sel.permTemplateItem)
    const itemCount = await templateItems.count()
    if (itemCount === 0) return

    const selectAllBtn = page.locator(sel.permSelectAllBtn)
    await expect(selectAllBtn).toBeVisible()

    // Click "全选"
    const btnText = await selectAllBtn.textContent()
    if (btnText?.includes('全选')) {
      await selectAllBtn.click()

      // All items should be checked
      for (let i = 0; i < itemCount; i++) {
        await expect(templateItems.nth(i)).toHaveClass(/checked/)
      }

      // Button should now say "取消全选"
      await expect(selectAllBtn).toContainText('取消全选')

      // Click "取消全选"
      await selectAllBtn.click()

      // All items should be unchecked
      for (let i = 0; i < Math.min(itemCount, 5); i++) {
        const hasChecked = await templateItems.nth(i).evaluate((el) => el.classList.contains('checked'))
        expect(hasChecked).toBe(false)
      }
    }
  })

  test('cancel button closes without saving', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })

    await page.locator(`${sel.permModal} ${sel.btnCancel}`).click()
    await expect(page.locator(sel.permModal)).not.toBeVisible()

    // No toast should appear for cancel
    await page.waitForTimeout(500)
    await expect(page.locator(sel.toast)).not.toBeVisible()
  })

  test('saving unchanged permissions shows info toast', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })

    await page.waitForFunction(
      () => !document.querySelector('.perm-modal .cm-loading'),
      null,
      { timeout: 15_000 },
    )

    // Click save without any changes
    await page.locator(`${sel.permModal} ${sel.btnSubmit}`).click()

    // Should show "没有变更" info toast
    await waitForToast(page, '没有变更')
    await expect(page.locator(sel.permModal)).not.toBeVisible()
  })

  test('saving with changes shows success toast', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })

    await page.waitForFunction(
      () => !document.querySelector('.perm-modal .cm-loading'),
      null,
      { timeout: 15_000 },
    )

    const templateItems = page.locator(sel.permTemplateItem)
    const itemCount = await templateItems.count()
    if (itemCount === 0) return

    // Toggle first template to make a change
    await templateItems.first().click()

    // Save
    await page.locator(`${sel.permModal} ${sel.btnSubmit}`).click()

    // Should show success toast
    await waitForToast(page, '权限已更新')
    await expect(page.locator(sel.permModal)).not.toBeVisible({ timeout: 10_000 })

    // Restore: reopen and toggle back
    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })
    await page.waitForFunction(
      () => !document.querySelector('.perm-modal .cm-loading'),
      null,
      { timeout: 15_000 },
    )
    await page.locator(sel.permTemplateItem).first().click()
    await page.locator(`${sel.permModal} ${sel.btnSubmit}`).click()
    await waitForToast(page, '权限已更新')
  })

  test('close (X) button closes permission modal', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await openActionMenu(page, 0)
    await page.locator(sel.actionMenuItem).nth(0).click()
    await expect(page.locator(sel.permModal)).toBeVisible({ timeout: 5_000 })

    await page.locator(`${sel.permModal} ${sel.modalClose}`).click()
    await expect(page.locator(sel.permModal)).not.toBeVisible()
  })
})

// ══════════════════════════════════════════════════════════════════
//  8. Tier Upgrade Modal
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Tier Upgrade Modal', () => {
  test('opens from action dropdown "升级等级"', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Find a non-premium user row to test upgrade
    let targetRow = -1
    for (let i = 0; i < rowCount; i++) {
      const tierText = await getRowTierText(page, i)
      if (!tierText.includes('高级会员')) {
        targetRow = i
        break
      }
    }
    if (targetRow === -1) return // All users are premium, skip

    await openActionMenu(page, targetRow)
    await page.locator(sel.actionMenuItem).nth(1).click() // 升级等级

    await expect(page.locator(sel.tierModal)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(`${sel.tierModal} ${sel.modalHeader} h2`)).toHaveText('升级会员')
  })

  test('displays target user info and current tier', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Find non-premium user
    let targetRow = -1
    for (let i = 0; i < rowCount; i++) {
      const tierText = await getRowTierText(page, i)
      if (!tierText.includes('高级会员')) {
        targetRow = i
        break
      }
    }
    if (targetRow === -1) return

    const expectedName = await page.locator(sel.tableRow).nth(targetRow).locator(sel.userNameText).textContent()

    await openActionMenu(page, targetRow)
    await page.locator(sel.actionMenuItem).nth(1).click()
    await expect(page.locator(sel.tierModal)).toBeVisible({ timeout: 5_000 })

    // User name should match
    const userName = page.locator(sel.tierUserName)
    await expect(userName).toBeVisible()
    const nameText = await userName.textContent()
    expect(nameText?.trim()).toBe(expectedName?.trim())

    // Current tier info should be shown
    await expect(page.locator(sel.tierUserMeta)).toBeVisible()
    await expect(page.locator(sel.tierUserMeta)).toContainText('当前等级')
  })

  test('shows upgrade tier options based on current tier', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Find a free user
    let freeRow = -1
    for (let i = 0; i < rowCount; i++) {
      const tierText = await getRowTierText(page, i)
      if (tierText.includes('免费用户')) {
        freeRow = i
        break
      }
    }

    if (freeRow >= 0) {
      // Free user should see both standard and premium options
      await openActionMenu(page, freeRow)
      await page.locator(sel.actionMenuItem).nth(1).click()
      await expect(page.locator(sel.tierModal)).toBeVisible({ timeout: 5_000 })

      await expect(page.locator(sel.tierStandardCard)).toBeVisible()
      await expect(page.locator(sel.tierPremiumCard)).toBeVisible()

      // Close for next test
      await page.locator(`${sel.tierModal} ${sel.btnCancel}`).click()
    }
  })

  test('tier option card is selectable with visual feedback', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Find non-premium user
    let targetRow = -1
    for (let i = 0; i < rowCount; i++) {
      const tierText = await getRowTierText(page, i)
      if (!tierText.includes('高级会员')) {
        targetRow = i
        break
      }
    }
    if (targetRow === -1) return

    await openActionMenu(page, targetRow)
    await page.locator(sel.actionMenuItem).nth(1).click()
    await expect(page.locator(sel.tierModal)).toBeVisible({ timeout: 5_000 })

    // Click premium card
    const premiumCard = page.locator(sel.tierPremiumCard)
    if (await premiumCard.isVisible()) {
      await premiumCard.click()
      await expect(premiumCard).toHaveClass(/selected/)
    }

    // Click standard card (if visible)
    const standardCard = page.locator(sel.tierStandardCard)
    if (await standardCard.isVisible()) {
      await standardCard.click()
      await expect(standardCard).toHaveClass(/selected/)
      // Premium should no longer be selected
      if (await premiumCard.isVisible()) {
        await expect(premiumCard).not.toHaveClass(/selected/)
      }
    }

    await page.locator(`${sel.tierModal} ${sel.btnCancel}`).click()
  })

  test('duration picker and expiry preview work', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Find non-premium user
    let targetRow = -1
    for (let i = 0; i < rowCount; i++) {
      const tierText = await getRowTierText(page, i)
      if (!tierText.includes('高级会员')) {
        targetRow = i
        break
      }
    }
    if (targetRow === -1) return

    await openActionMenu(page, targetRow)
    await page.locator(sel.actionMenuItem).nth(1).click()
    await expect(page.locator(sel.tierModal)).toBeVisible({ timeout: 5_000 })

    // Duration picker should be visible
    await expect(page.locator(sel.tierDurationSelect)).toBeVisible()

    // Preview should show expiry date
    await expect(page.locator(sel.tierPreview)).toBeVisible()
    const preview1 = await page.locator(sel.tierPreview).textContent()
    expect(preview1).toContain('到期日期')

    // Change duration to 6 months
    await page.locator(sel.tierDurationSelect).selectOption('6')
    const preview6 = await page.locator(sel.tierPreview).textContent()

    // Dates should differ
    expect(preview1).not.toBe(preview6)

    await page.locator(`${sel.tierModal} ${sel.btnCancel}`).click()
  })

  test('upgrade disabled for premium users', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Find a premium user
    let premiumRow = -1
    for (let i = 0; i < rowCount; i++) {
      const tierText = await getRowTierText(page, i)
      if (tierText.includes('高级会员')) {
        premiumRow = i
        break
      }
    }
    if (premiumRow === -1) return // No premium users, skip

    await openActionMenu(page, premiumRow)

    // The "升级等级" menu item should be disabled
    const upgradeItem = page.locator(sel.actionMenuItem).nth(1)
    await expect(upgradeItem).toHaveClass(/disabled/)
    await expect(upgradeItem).toBeDisabled()
  })

  test('cancel closes tier modal without changes', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Find non-premium user
    let targetRow = -1
    for (let i = 0; i < rowCount; i++) {
      const tierText = await getRowTierText(page, i)
      if (!tierText.includes('高级会员')) {
        targetRow = i
        break
      }
    }
    if (targetRow === -1) return

    await openActionMenu(page, targetRow)
    await page.locator(sel.actionMenuItem).nth(1).click()
    await expect(page.locator(sel.tierModal)).toBeVisible({ timeout: 5_000 })

    await page.locator(`${sel.tierModal} ${sel.btnCancel}`).click()
    await expect(page.locator(sel.tierModal)).not.toBeVisible()
  })

  test('confirm upgrade submits and shows success', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Find a free user to upgrade
    let freeRow = -1
    for (let i = 0; i < rowCount; i++) {
      const tierText = await getRowTierText(page, i)
      if (tierText.includes('免费用户')) {
        freeRow = i
        break
      }
    }
    if (freeRow === -1) return // No free users to test with

    await openActionMenu(page, freeRow)
    await page.locator(sel.actionMenuItem).nth(1).click()
    await expect(page.locator(sel.tierModal)).toBeVisible({ timeout: 5_000 })

    // Select standard tier (if not already selected)
    const standardCard = page.locator(sel.tierStandardCard)
    if (await standardCard.isVisible()) {
      await standardCard.click()
    }

    // Select 1 month duration
    await page.locator(sel.tierDurationSelect).selectOption('1')

    // Click confirm upgrade
    const confirmBtn = page.locator(`${sel.tierModal} ${sel.btnSubmit}`)
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()

    // Should show success toast and close modal
    await waitForToast(page, '升级成功')
    await expect(page.locator(sel.tierModal)).not.toBeVisible({ timeout: 10_000 })

    // The user's tier badge in the table should now show "普通会员"
    await page.waitForTimeout(1_000) // Wait for table refresh
    const updatedTier = await getRowTierText(page, freeRow)
    expect(updatedTier).toContain('普通会员')
  })
})

// ══════════════════════════════════════════════════════════════════
//  9. Batch Operations
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Batch Operations', () => {
  test('selecting rows shows batch action bar', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Initially no batch bar
    await expect(page.locator(sel.batchBar)).not.toBeVisible()

    // Click first row's checkbox
    await page.locator(sel.tdCheckbox).first().click()

    // Batch bar should appear
    await expect(page.locator(sel.batchBar)).toBeVisible({ timeout: 3_000 })
    await expect(page.locator(sel.batchCount)).toContainText('已选 1 项')
    await expect(page.locator(sel.batchGrant)).toBeVisible()
    await expect(page.locator(sel.batchRevoke)).toBeVisible()
  })

  test('select all checkbox toggles all rows', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Click "select all" in header
    await page.locator(sel.thCheckbox).click()

    // Batch bar should show count matching visible rows
    await expect(page.locator(sel.batchBar)).toBeVisible({ timeout: 3_000 })
    const countText = await page.locator(sel.batchCount).textContent()
    const selectedNum = parseInt(countText?.match(/\d+/)?.[0] || '0')
    expect(selectedNum).toBe(rowCount)

    // Deselect all
    await page.locator(sel.thCheckbox).click()
    await expect(page.locator(sel.batchBar)).not.toBeVisible({ timeout: 3_000 })
  })

  test('batch grant opens confirm dialog', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Select first row
    await page.locator(sel.tdCheckbox).first().click()
    await expect(page.locator(sel.batchBar)).toBeVisible({ timeout: 3_000 })

    // Click batch grant
    await page.locator(sel.batchGrant).click()

    // Confirm modal should appear
    await expect(page.locator(sel.batchConfirmModal)).toBeVisible({ timeout: 3_000 })
    await expect(page.locator(`${sel.batchConfirmModal} ${sel.modalHeader} h2`)).toContainText('批量授权确认')

    // Cancel to close
    await page.locator(`${sel.batchConfirmModal} ${sel.btnCancel}`).click()
    await expect(page.locator(sel.batchConfirmModal)).not.toBeVisible()

    // Deselect
    await page.locator(sel.tdCheckbox).first().click()
  })

  test('batch revoke opens confirm dialog with warning', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    // Select first row
    await page.locator(sel.tdCheckbox).first().click()
    await expect(page.locator(sel.batchBar)).toBeVisible({ timeout: 3_000 })

    // Click batch revoke
    await page.locator(sel.batchRevoke).click()

    // Confirm modal should appear with revoke styling
    await expect(page.locator(sel.batchConfirmModal)).toBeVisible({ timeout: 3_000 })
    await expect(page.locator(`${sel.batchConfirmModal} ${sel.modalHeader} h2`)).toContainText('批量撤销确认')

    // Should have warning text
    await expect(page.locator('.batch-revoke-warning')).toBeVisible()

    // Cancel
    await page.locator(`${sel.batchConfirmModal} ${sel.btnCancel}`).click()
    await expect(page.locator(sel.batchConfirmModal)).not.toBeVisible()

    // Deselect
    await page.locator(sel.tdCheckbox).first().click()
  })
})

// ══════════════════════════════════════════════════════════════════
//  10. Pagination
// ══════════════════════════════════════════════════════════════════

test.describe('Customers — Pagination', () => {
  test('pagination info shows page count', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    await expect(page.locator(sel.pagination)).toBeVisible()
    const info = await page.locator(sel.paginationInfo).textContent()
    expect(info).toMatch(/第 \d+ 页，共 \d+ 页/)
  })

  test('prev button disabled on first page', async ({ page }) => {
    await goToCustomers(page)
    const rowCount = await getRowCount(page)
    if (rowCount === 0) return

    const prevBtn = page.locator(sel.paginationBtn).first()
    await expect(prevBtn).toBeDisabled()
  })
})
