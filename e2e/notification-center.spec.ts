import { test, expect, type Page } from '@playwright/test'

/**
 * 通知中心（notif-dropdown）E2E 关键路径回归。
 *
 * 入口形态（2026-06-16 改版）：工作区首页右上角「喇叭」icon → 点击展开下拉列表 →
 * 点某条 → 弹窗看详情/填问卷。不再有 /notifications 独立路由页。
 *
 * 鉴权：由 e2e/auth.setup.ts 预登录并缓存 storageState，测试直接 goto('/')。
 *
 * ── Feature flag 依赖 ───────────────────────────────────────────────
 * 喇叭受 VITE_ENABLE_NOTIFICATIONS 控制（dev .env.development='true'，构建期注入）。
 * 前端 flag 关 → 喇叭整组件不渲染；后端 flag 关 → /v1/announcements 返回 ErrFeatureDisabled。
 * dev 两侧 flag 均开。
 *
 * ── 数据依赖（SEED REQUIRED）────────────────────────────────────────
 * 完整路径需后端 + 已发布 seed：≥1 条 published 公告（读后红点减少）、≥1 条
 * published survey 且当前账号未提交（提交后只读态）。无 seed 的用例 test.skip，
 * 不产生假阴性。本地无栈时本 spec 作关键路径文档，dev 部署后由 gstack /qa 验证。
 */

const MEGAPHONE = '[data-testid="notification-megaphone"]'
const MP_BTN = '[data-testid="megaphone-btn"]'
const MP_BADGE = '[data-testid="megaphone-badge"]'
const MP_PANEL = '[data-testid="megaphone-panel"]'
const MP_LIST = '[data-testid="megaphone-list"]'
const MP_EMPTY = '[data-testid="megaphone-empty"]'
const MODAL = '[data-testid="notification-modal"]'
const MODAL_BODY = '[data-testid="modal-body"]'
const MODAL_SURVEY_SUBMITTED = '[data-testid="modal-survey-submitted"]'
const SURVEY_FORM = '[data-testid="survey-form"]'
const SUBMIT_BTN = '[data-testid="survey-submit"]'

/** 打开喇叭下拉并等其脱离 loading（列表或空状态其一）。 */
async function openDropdown(page: Page) {
  await page.locator(MP_BTN).click()
  await expect(page.locator(MP_PANEL)).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(
      async () => {
        const list = await page.locator(MP_LIST).count()
        const empty = await page.locator(MP_EMPTY).count()
        return list > 0 || empty > 0
      },
      { timeout: 30_000 }
    )
    .toBe(true)
}

/** 解析喇叭徽标数字（"99+" → 100，缺失 → 0）。 */
async function readBadge(page: Page): Promise<number> {
  const badge = page.locator(MP_BADGE)
  if ((await badge.count()) === 0) return 0
  const txt = (await badge.textContent())?.trim() ?? '0'
  if (txt === '99+') return 100
  return Number(txt) || 0
}

test.describe('通知喇叭下拉 (notif-dropdown)', () => {
  test('工作区右上角喇叭可见，点击展开下拉列表', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(MEGAPHONE)).toBeVisible({ timeout: 30_000 })
    await openDropdown(page)
  })

  test('读公告后喇叭未读红点减少', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(MEGAPHONE)).toBeVisible({ timeout: 30_000 })

    const before = await readBadge(page)
    test.skip(before === 0, 'SEED REQUIRED: 无未读公告，无法验证红点递减')

    await openDropdown(page)
    // 第一条未读项（含 mp-dot）→ 点开弹窗 → 进入即 markRead。
    const firstUnread = page
      .locator('[data-testid^="megaphone-item-"]', { has: page.locator('.mp-dot') })
      .first()
    await firstUnread.click()
    await expect(page.locator(MODAL_BODY)).toBeVisible({ timeout: 30_000 })

    // 关弹窗（Esc）→ 重新打开下拉 → 红点应较读前减少。
    await page.keyboard.press('Escape')
    await expect(page.locator(MODAL)).toHaveCount(0)
    await expect.poll(async () => readBadge(page), { timeout: 30_000 }).toBeLessThan(before)
  })

  test('问卷在弹窗内作答提交，再次打开显示「已提交」只读态', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(MEGAPHONE)).toBeVisible({ timeout: 30_000 })
    await openDropdown(page)

    const surveyItem = page
      .locator('[data-testid^="megaphone-item-"]', { has: page.locator('.mp-tag') })
      .first()
    test.skip((await surveyItem.count()) === 0, 'SEED REQUIRED: 无问卷类公告')
    await surveyItem.click()
    await expect(page.locator(MODAL_BODY)).toBeVisible({ timeout: 30_000 })

    // 已提交过 → 直接断言只读态（路径仍覆盖）。
    if ((await page.locator(MODAL_SURVEY_SUBMITTED).count()) > 0) {
      await expect(page.locator(MODAL_SURVEY_SUBMITTED)).toContainText('已提交')
      return
    }

    // 未提交：作答表单渲染，逐题作答（覆盖 single/multi/rating/text）。
    await expect(page.locator(SURVEY_FORM)).toBeVisible({ timeout: 30_000 })
    const questions = page.locator('[data-testid^="survey-question-"]')
    const qCount = await questions.count()
    for (let i = 0; i < qCount; i++) {
      const q = questions.nth(i)
      const firstOption = q.locator('input[type="radio"], input[type="checkbox"]').first()
      if ((await firstOption.count()) > 0) {
        await firstOption.check()
        continue
      }
      const ratingBtn = q.locator('.star-btn, .nps-btn').last()
      if ((await ratingBtn.count()) > 0) {
        await ratingBtn.click()
        continue
      }
      const textArea = q.locator('textarea')
      if ((await textArea.count()) > 0) {
        await textArea.fill('E2E 自动作答')
      }
    }

    await page.locator(SUBMIT_BTN).click()
    // 提交成功 → current.is_survey_submitted=true → 弹窗内只读态。
    await expect(page.locator(MODAL_SURVEY_SUBMITTED)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(MODAL_SURVEY_SUBMITTED)).toContainText('已提交')
  })

  /**
   * Feature-flag-off 隐藏喇叭。
   * VITE_ENABLE_NOTIFICATIONS 构建期注入，运行时无法翻转 —— 这里断言「flag 开时喇叭存在」
   * 这一 dev 可自动验证的方向；flag 关方向由 prod 构建（无该 env）部署后人工/QA 确认。
   */
  test('feature flag 开启时喇叭存在（flag 关闭方向见注释）', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator(MEGAPHONE)).toBeVisible({ timeout: 30_000 })
  })
})
