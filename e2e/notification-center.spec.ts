import { test, expect, type Page } from '@playwright/test'

/**
 * 通知中心（notification-center）E2E 关键路径回归。
 *
 * 鉴权：由 e2e/auth.setup.ts 预先登录并缓存 storageState（playwright.config 的
 * e2e project 自动复用），测试可直接 goto。
 *
 * ── Feature flag 依赖 ───────────────────────────────────────────────
 * 铃铛入口受 VITE_ENABLE_NOTIFICATIONS 控制（dev .env.development 设为 'true'）。
 * 前端 flag 关闭时铃铛整组件不渲染；后端 flag 关闭时所有 /v1/announcements 端点
 * 返回 ErrFeatureDisabled。dev 环境两侧 flag 均开。
 *
 * ── 数据依赖（SEED REQUIRED）────────────────────────────────────────
 * 本 spec 覆盖完整用户路径，需要后端 + 已发布 seed 公告/问卷：
 *   - 至少 1 条 status=published 的普通公告（用于「读后红点减少」）；
 *   - 至少 1 条 status=published 的 survey 公告，且当前测试账号「未提交」
 *     （用于「提交后再次进入显示已提交」）。
 * 完整浏览器栈（server+DB+前端）在 dev 才齐备 —— 本地无栈时本 spec 作为留存的
 * 关键路径文档，部署 dev 后由 gstack /qa 验证（spec §7 诚实声明）。
 * 无 seed 数据时，相关用例用 test.skip 自动跳过（见各用例内的前置判断），
 * 不会产生假阴性。
 */

const BELL = '[data-testid="notification-bell"]'
const BADGE = '[data-testid="notification-bell-badge"]'
const LIST = '[data-testid="notifications-list"]'
const EMPTY = '[data-testid="notifications-empty"]'
const LOADING = '[data-testid="notifications-loading"]'
const SURVEY_SUBMITTED = '[data-testid="survey-submitted"]'
const SURVEY_FORM = '[data-testid="survey-form"]'
const SUBMIT_BTN = '[data-testid="survey-submit"]'

/** 等通知中心列表脱离 loading：列表或空状态二者必居其一。 */
async function waitListSettled(page: Page) {
  await expect
    .poll(
      async () => {
        const list = await page.locator(LIST).count()
        const empty = await page.locator(EMPTY).count()
        return list > 0 || empty > 0
      },
      { timeout: 30_000 }
    )
    .toBe(true)
}

/** 解析铃铛徽标数字（"99+" → 100，缺失 → 0）。 */
async function readBadge(page: Page): Promise<number> {
  const badge = page.locator(BADGE)
  if ((await badge.count()) === 0) return 0
  const txt = (await badge.textContent())?.trim() ?? '0'
  if (txt === '99+') return 100
  return Number(txt) || 0
}

test.describe('通知中心 (notification-center)', () => {
  test('铃铛在已登录布局可见，导航到通知中心列表', async ({ page }) => {
    await page.goto('/')
    // 铃铛在全局 Sidebar 中，所有已登录页面可见（dev flag 开）。
    await expect(page.locator(BELL)).toBeVisible({ timeout: 30_000 })

    await page.locator(BELL).click()
    await expect(page).toHaveURL(/\/notifications$/)
    // 进入后从 loading 过渡到 列表 / 空状态。
    await waitListSettled(page)
  })

  test('读公告后铃铛未读红点减少', async ({ page }) => {
    await page.goto('/notifications')
    await waitListSettled(page)

    // 需要至少一条未读公告（红点 > 0）。无 seed 数据时跳过。
    const before = await readBadge(page)
    test.skip(before === 0, 'SEED REQUIRED: 无未读公告，无法验证红点递减')

    // 找到第一条未读项（带 unread-dot）并点击进入详情 → 进入即 POST /read。
    const firstUnread = page
      .locator('[data-testid^="notice-item-"]', {
        has: page.locator('[data-testid="unread-dot"]')
      })
      .first()
    await firstUnread.click()
    await expect(page).toHaveURL(/\/notifications\/\d+$/)
    await expect(page.locator('[data-testid="detail-body"]')).toBeVisible({ timeout: 30_000 })

    // 返回列表，红点应较读前减少（markRead 用响应未读计数更新）。
    await page.locator('[data-testid="detail-back"]').click()
    await expect(page).toHaveURL(/\/notifications$/)
    await waitListSettled(page)

    await expect.poll(async () => readBadge(page), { timeout: 30_000 }).toBeLessThan(before)
  })

  test('问卷作答提交成功，再次进入显示「已提交」只读态', async ({ page }) => {
    await page.goto('/notifications')
    await waitListSettled(page)

    // 找一条 survey 公告。无 survey seed 数据时跳过。
    const surveyItem = page
      .locator('[data-testid^="notice-item-"]', {
        has: page.locator('[data-testid="survey-tag"]')
      })
      .first()
    test.skip((await surveyItem.count()) === 0, 'SEED REQUIRED: 无问卷类公告')

    await surveyItem.click()
    await expect(page).toHaveURL(/\/notifications\/\d+$/)
    const surveyUrl = page.url()

    // 若该问卷已提交（账号曾答过），直接断言只读态并结束（路径仍被覆盖）。
    if ((await page.locator(SURVEY_SUBMITTED).count()) > 0) {
      await expect(page.locator(SURVEY_SUBMITTED)).toContainText('已提交')
      return
    }

    // 未提交：作答表单应渲染。逐题作答（覆盖 single/multi/rating/text 各题型）。
    await expect(page.locator(SURVEY_FORM)).toBeVisible({ timeout: 30_000 })

    const questions = page.locator('[data-testid^="survey-question-"]')
    const qCount = await questions.count()
    for (let i = 0; i < qCount; i++) {
      const q = questions.nth(i)
      // single / multi：点第一个选项。
      const firstOption = q.locator('input[type="radio"], input[type="checkbox"]').first()
      if ((await firstOption.count()) > 0) {
        await firstOption.check()
        continue
      }
      // rating：星级 / NPS 按钮 → 点最后一个（最高分 / NPS 满分）。
      const ratingBtn = q.locator('.star-btn, .nps-btn').last()
      if ((await ratingBtn.count()) > 0) {
        await ratingBtn.click()
        continue
      }
      // text：填文本。
      const textArea = q.locator('textarea')
      if ((await textArea.count()) > 0) {
        await textArea.fill('E2E 自动作答')
      }
    }

    await page.locator(SUBMIT_BTN).click()

    // 提交成功 → store 把 current.is_survey_submitted 置 true → 渲染只读态。
    await expect(page.locator(SURVEY_SUBMITTED)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(SURVEY_SUBMITTED)).toContainText('已提交')

    // 再次进入同一问卷：后端持久化 is_survey_submitted=true，应仍是只读态、无作答表单。
    await page.goto(surveyUrl)
    await expect(page.locator(SURVEY_SUBMITTED)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(SURVEY_FORM)).toHaveCount(0)
  })

  /**
   * Feature-flag-off 隐藏铃铛。
   *
   * 注：dev 运行时 VITE_ENABLE_NOTIFICATIONS 在「构建期」注入，无法在运行时翻转。
   * 这里以「DOM 契约」断言铃铛由该 flag 门控：组件仅在 flag==='true' 渲染
   * <RouterLink data-testid="notification-bell">（见 NotificationBell.vue v-if="enabled"）。
   * flag 关闭的真实隐藏验证方式：以 VITE_ENABLE_NOTIFICATIONS 未设 / !='true'
   * 重新构建前端后铃铛 DOM 不存在。本用例校验「flag 开时铃铛存在」这一可在
   * dev 自动断言的方向，flag 关方向在 prod 构建（无该 env）由部署后人工/QA 确认。
   */
  test('feature flag 开启时铃铛存在（flag 关闭方向见注释）', async ({ page }) => {
    await page.goto('/')
    // dev: flag === 'true' → 铃铛渲染。
    await expect(page.locator(BELL)).toBeVisible({ timeout: 30_000 })
  })

  test('通知中心 4 态：进入后从 loading 过渡到 列表或空状态', async ({ page }) => {
    await page.goto('/notifications')
    // loading skeleton 可能一闪而过；最终必稳定到 列表 / 空状态其一。
    void LOADING
    await waitListSettled(page)
    const hasList = (await page.locator(LIST).count()) > 0
    const hasEmpty = (await page.locator(EMPTY).count()) > 0
    expect(hasList || hasEmpty).toBe(true)
    if (hasEmpty) {
      await expect(page.locator(EMPTY)).toContainText('暂无通知')
    }
  })
})
