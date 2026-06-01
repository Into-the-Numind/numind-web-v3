import { test, expect, type Page } from '@playwright/test'

/**
 * 用户端「积分消耗记录」回归测试（NDF feature: credit-consumption-log，S5 永久回归）。
 *
 * 入口：设置页(/settings)「积分与加量包」section 头右侧的「积分消耗记录」按钮，
 * 点击弹出 modal（CreditConsumptionLogModal），内嵌 DataTable 展示 时间/动作/消耗积分。
 *
 * 鉴权：由 e2e/auth.setup.ts 预先登录并缓存 storageState（playwright.config 的 e2e
 * project 自动复用），故测试可直接 goto('/settings')。
 *
 * 数据无关性：测试账号是否有「平账后」消耗记录未知，因此对「有数据 / 空状态」做
 * 数据无关断言——只要求弹窗加载后稳定呈现二者之一，不假设具体条数。
 */

const ENTRY = '.section-action'
const ENTRY_TEXT = '积分消耗记录'
const DIALOG = '.ccl-dialog'

function entryButton(page: Page) {
  return page.locator(ENTRY).filter({ hasText: ENTRY_TEXT })
}

async function goToSettings(page: Page) {
  await page.goto('/settings')
  // 以入口按钮可见作为 SettingsView 就绪信号（该按钮静态渲染，不依赖异步数据）。
  await expect(entryButton(page)).toBeVisible({ timeout: 30_000 })
}

async function openLog(page: Page) {
  await entryButton(page).click()
  await expect(page.locator(DIALOG)).toBeVisible()
}

test.describe('积分消耗记录 (credit consumption log)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSettings(page)
  })

  test('入口位于「积分与加量包」section 头右侧', async ({ page }) => {
    await expect(entryButton(page)).toBeVisible()
    // 入口在积分与加量包 section 头部（与 section-label 同行）。
    const header = page.locator('.section-header').filter({ hasText: '积分与加量包' })
    await expect(header).toBeVisible()
    await expect(header.locator(ENTRY).filter({ hasText: ENTRY_TEXT })).toBeVisible()
  })

  test('点击入口打开弹窗，标题与三列表头正确', async ({ page }) => {
    await openLog(page)
    await expect(page.locator('#ccl-dialog-title')).toHaveText(ENTRY_TEXT)

    const dialog = page.locator(DIALOG)
    await expect(dialog.locator('th').filter({ hasText: '时间' })).toBeVisible()
    await expect(dialog.locator('th').filter({ hasText: '动作' })).toBeVisible()
    await expect(dialog.locator('th').filter({ hasText: '消耗积分' })).toBeVisible()
  })

  test('弹窗加载后稳定呈现数据行或空状态（数据无关）', async ({ page }) => {
    await openLog(page)
    const dialog = page.locator(DIALOG)

    // 等加载骨架消散：要么出现数据行，要么出现空状态（二者必居其一）。
    await expect
      .poll(
        async () => {
          const rows = await dialog.locator('.data-row').count()
          const empty = await dialog.locator('.empty-state').count()
          return rows > 0 || empty > 0
        },
        { timeout: 30_000 },
      )
      .toBe(true)

    const rowCount = await dialog.locator('.data-row').count()
    if (rowCount > 0) {
      // 有数据：分页信息「共 N 条」可见。
      await expect(dialog.locator('.pagination__info')).toContainText(/共\s*\d+\s*条/)
    } else {
      // 无数据：空状态文案。
      await expect(dialog.locator('.empty-state')).toContainText('暂无积分消耗记录')
    }
  })

  test('ESC 关闭弹窗', async ({ page }) => {
    await openLog(page)
    await page.keyboard.press('Escape')
    await expect(page.locator(DIALOG)).toBeHidden()
  })

  test('点关闭按钮关闭弹窗', async ({ page }) => {
    await openLog(page)
    await page.locator('.ccl-close').click()
    await expect(page.locator(DIALOG)).toBeHidden()
  })

  test('点遮罩关闭弹窗', async ({ page }) => {
    await openLog(page)
    // 点遮罩左上角（避开居中的对话框，命中 @click.self 的 .ccl-overlay）。
    await page.locator('.ccl-overlay').click({ position: { x: 5, y: 5 } })
    await expect(page.locator(DIALOG)).toBeHidden()
  })
})
