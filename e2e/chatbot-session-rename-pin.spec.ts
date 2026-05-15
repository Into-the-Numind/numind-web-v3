/**
 * chatbot-session-rename-pin E2E — S5 验证策略 #1-#8（前端可达 8 路径）
 *
 * 用 page.route() mocks 模拟 /v1/chatbot/sessions/* 端点（与 credits-system.spec.ts
 * 同样的 pattern），让 E2E 覆盖前端契约：hover menu / inline RenameModal /
 * pessimistic UI / sortLocally / chatbot_id 查询参数。
 *
 * 真实 dev backend 验证 (#9 未登录 401 + #10 非本人 403 + D2 真实 MySQL ON UPDATE
 * 行为) 走手动 curl，详见 numind-server/docs/superpowers/specs/
 * 2026-05-13-chatbot-session-rename-pin-validation-strategy.md §6
 *
 * Running:
 *   E2E_USERNAME=$E2E_USERNAME E2E_PASSWORD=$E2E_PASSWORD \
 *     npm run test:e2e -- chatbot-session-rename-pin
 *
 * Refs: spec §5.4, plan T7+T8, validation-strategy.md
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ============================================================================
// Mock state (mutable across requests)
// ============================================================================

interface MockSession {
  id: number
  user_id: number
  chatbot_id: number
  title: string
  status: string
  message_count: number
  pinned_at: string | null
  created_at: string
  updated_at: string
}

function initSessions(): MockSession[] {
  return [
    {
      id: 1,
      user_id: 1,
      chatbot_id: 42,
      title: '客户A咨询',
      status: 'active',
      message_count: 3,
      pinned_at: null,
      created_at: '2026-05-13T08:00:00+08:00',
      updated_at: '2026-05-13T10:00:00+08:00'
    },
    {
      id: 2,
      user_id: 1,
      chatbot_id: 42,
      title: '客户B需求',
      status: 'active',
      message_count: 5,
      pinned_at: null,
      created_at: '2026-05-13T09:00:00+08:00',
      updated_at: '2026-05-13T11:00:00+08:00'
    },
    {
      id: 3,
      user_id: 1,
      chatbot_id: 42,
      title: '出海产品定价',
      status: 'active',
      message_count: 2,
      pinned_at: null,
      created_at: '2026-05-13T07:00:00+08:00',
      updated_at: '2026-05-13T09:00:00+08:00'
    }
  ]
}

function sortMockSessions(sessions: MockSession[]): MockSession[] {
  return [...sessions].sort((a, b) => {
    const aPinned = a.pinned_at != null
    const bPinned = b.pinned_at != null
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    if (aPinned) {
      return new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime()
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
}

async function installChatbotMocks(page: Page, state: { sessions: MockSession[] }) {
  // GET /v1/chatbot/list — chatbots available
  await page.route('**/v1/chatbot/list', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          list: [
            {
              id: 42,
              name: 'Test Chatbot',
              description: 'E2E test',
              prompt: 'You are a test assistant',
              published: true,
              created_at: '2026-05-01T08:00:00+08:00',
              updated_at: '2026-05-01T08:00:00+08:00'
            }
          ],
          total: 1
        }
      })
    })
  })

  // GET /v1/chatbot/sessions?chatbot_id=42 — list with new param
  await page.route(/\/v1\/chatbot\/sessions(\?|$)/, async (route: Route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (method !== 'GET') return route.fallback()

    const chatbotId = url.searchParams.get('chatbot_id')
    let filtered = state.sessions
    if (chatbotId) filtered = state.sessions.filter((s) => s.chatbot_id === Number(chatbotId))
    const sorted = sortMockSessions(filtered)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { list: sorted, total: sorted.length }
      })
    })
  })

  // PUT /v1/chatbot/sessions/:id/rename
  await page.route(/\/v1\/chatbot\/sessions\/\d+\/rename$/, async (route: Route) => {
    const method = route.request().method()
    if (method !== 'PUT') return route.fallback()

    const match = route
      .request()
      .url()
      .match(/\/sessions\/(\d+)\/rename/)
    const id = match ? Number(match[1]) : 0
    const body = JSON.parse(route.request().postData() ?? '{}')
    const session = state.sessions.find((s) => s.id === id)
    if (!session) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 1004, message: '对话会话不存在' })
      })
      return
    }
    session.title = body.title // 不更新 updated_at（D2）
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { id, title: body.title }
      })
    })
  })

  // PUT /v1/chatbot/sessions/:id/pin
  await page.route(/\/v1\/chatbot\/sessions\/\d+\/pin$/, async (route: Route) => {
    const method = route.request().method()
    if (method !== 'PUT') return route.fallback()

    const match = route
      .request()
      .url()
      .match(/\/sessions\/(\d+)\/pin/)
    const id = match ? Number(match[1]) : 0
    const body = JSON.parse(route.request().postData() ?? '{}')
    const session = state.sessions.find((s) => s.id === id)
    if (!session) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 1004, message: '对话会话不存在' })
      })
      return
    }
    // pinned=true 写入 NOW（每次刷新，模拟 EC-14 重复置顶）
    // pinned=false 写入 null（取消置顶）
    session.pinned_at = body.pinned ? new Date().toISOString() : null
    // 不更新 updated_at（D2）
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { id, pinned_at: session.pinned_at }
      })
    })
  })

  // GET /v1/chatbot/sessions/:id/messages — return empty for E2E speed
  await page.route(/\/v1\/chatbot\/sessions\/\d+\/messages/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { list: [], total: 0 } })
    })
  })

  // GET /v1/users/me & 其他通用端点 — 简单 success 让页面 load
  await page.route('**/v1/users/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: { id: 1, username: 'e2e_user', email: 'e2e@test.com', billing_mode: 'credits' }
      })
    })
  })
}

// ============================================================================
// Tests
// ============================================================================

test.describe('chatbot-session-rename-pin (8 paths)', () => {
  let state: { sessions: MockSession[] }

  test.beforeEach(async ({ page }) => {
    state = { sessions: initSessions() }
    await installChatbotMocks(page, state)
    await page.goto('/chatbot/42')
    // Wait for the session list to load (the menu trigger element should appear)
    await expect(page.locator('.session-item').first()).toBeVisible({ timeout: 15_000 })
  })

  test('Path 1: 改名 happy path', async ({ page }) => {
    const firstSession = page.locator('.session-item').first()
    await firstSession.hover()
    const moreBtn = firstSession.locator('.session-more-btn')
    await expect(moreBtn).toBeVisible({ timeout: 5_000 })
    await moreBtn.click()

    // 点击重命名
    await page.getByRole('button', { name: '重命名' }).click()

    // 输入新名 + 保存
    const input = page.locator('.modal-card-simple input')
    await expect(input).toBeVisible()
    await input.fill('Renamed by E2E')
    await page.getByRole('button', { name: '保存' }).click()

    // 验证 modal 关闭 + 列表显示新名
    await expect(page.locator('.modal-card-simple')).not.toBeVisible({ timeout: 5_000 })
    await expect(page.locator('.session-title').first()).toContainText('Renamed by E2E')
  })

  test('Path 2: 改名空白校验 (toast warning)', async ({ page }) => {
    const firstSession = page.locator('.session-item').first()
    await firstSession.hover()
    await firstSession.locator('.session-more-btn').click()
    await page.getByRole('button', { name: '重命名' }).click()

    const input = page.locator('.modal-card-simple input')
    await input.fill('   ') // 纯空白
    await page.getByRole('button', { name: '保存' }).click()

    // 验证 toast 出现（具体 selector 依赖项目 notifications 实现）
    // 至少 modal 仍开着（未关闭说明未通过校验）
    await expect(page.locator('.modal-card-simple')).toBeVisible()
  })

  test('Path 3: 置顶 happy path + 视觉强调', async ({ page }) => {
    // 找到 session id=3 (最旧 updated_at, 在列表第 3)
    const session3 = page.locator('.session-item').nth(2)
    await session3.hover()
    await session3.locator('.session-more-btn').click()
    await page.getByRole('button', { name: '置顶' }).click()

    // 等待 API 完成 + 列表重排
    await page.waitForTimeout(500)

    // session id=3 应该移到列表顶部 + 含 .session-item--pinned class
    const firstSession = page.locator('.session-item').first()
    await expect(firstSession).toHaveClass(/session-item--pinned/)
    // 📌 指示器存在
    await expect(firstSession.locator('.session-pinned-indicator')).toBeVisible()
  })

  test('Path 4: 重复置顶 pinned_at 刷新', async ({ page }) => {
    // 先置顶 session 1
    const session1 = page.locator('.session-item').first()
    await session1.hover()
    await session1.locator('.session-more-btn').click()
    await page.getByRole('button', { name: '置顶' }).click()
    await page.waitForTimeout(300)
    const firstTitleAfterPin1 = await page.locator('.session-title').first().textContent()

    // 等 1 秒确保 pinned_at 时间戳变化
    await page.waitForTimeout(1100)

    // 再置顶 session 2（之前 id=2，应该排在第 2 位非置顶组）
    const sessionForSecondPin = page.locator('.session-item').nth(1)
    const secondTitle = await sessionForSecondPin.locator('.session-title').textContent()
    await sessionForSecondPin.hover()
    await sessionForSecondPin.locator('.session-more-btn').click()
    await page.getByRole('button', { name: '置顶' }).click()
    await page.waitForTimeout(300)

    // 第二次置顶应该在最顶（pinned_at 更新于第一次）
    const firstTitleAfterPin2 = await page.locator('.session-title').first().textContent()
    expect(firstTitleAfterPin2).toBe(secondTitle)
    expect(firstTitleAfterPin2).not.toBe(firstTitleAfterPin1)
  })

  test('Path 5: 取消置顶 → 回到 updated_at 排序', async ({ page }) => {
    // 先置顶 session 3 (最旧 updated_at)
    const session3 = page.locator('.session-item').nth(2)
    const session3Title = await session3.locator('.session-title').textContent()
    await session3.hover()
    await session3.locator('.session-more-btn').click()
    await page.getByRole('button', { name: '置顶' }).click()
    await page.waitForTimeout(300)
    // session 3 应在最顶
    await expect(page.locator('.session-title').first()).toHaveText(session3Title!)

    // 取消置顶
    const pinnedSession = page.locator('.session-item').first()
    await pinnedSession.hover()
    await pinnedSession.locator('.session-more-btn').click()
    await page.getByRole('button', { name: '取消置顶' }).click()
    await page.waitForTimeout(300)

    // session 3 回到原最旧 updated_at 位置（列表第 3）
    await expect(page.locator('.session-title').nth(2)).toHaveText(session3Title!)
  })

  test('Path 7: 删除按钮迁移菜单 + ConfirmModal 复用', async ({ page }) => {
    const firstSession = page.locator('.session-item').first()
    await firstSession.hover()
    await firstSession.locator('.session-more-btn').click()
    // 删除按钮应该在新 dropdown 菜单内
    const deleteBtn = page.locator('.dropdown-item--danger')
    await expect(deleteBtn).toBeVisible()
    await expect(deleteBtn).toContainText('删除')

    // 老的 hover trash icon 不应该存在（已移到菜单）
    const oldTrashIcon = firstSession.locator('.session-delete-btn')
    expect(await oldTrashIcon.count()).toBe(0)
  })

  test('Path 8: 跨 chatbot 隔离 — 查询参数生效', async ({ page }) => {
    // 验证 GET /v1/chatbot/sessions 请求确实带 chatbot_id 参数
    let listReqUrl: string | undefined
    await page.route(/\/v1\/chatbot\/sessions(\?|$)/, async (route: Route) => {
      if (route.request().method() === 'GET') {
        listReqUrl = route.request().url()
        const sorted = sortMockSessions(state.sessions)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            data: { list: sorted, total: sorted.length }
          })
        })
      } else {
        await route.fallback()
      }
    })

    // 重新触发 fetchSessions
    await page.reload()
    await expect(page.locator('.session-item').first()).toBeVisible({ timeout: 15_000 })

    expect(listReqUrl).toBeDefined()
    expect(listReqUrl).toContain('chatbot_id=42')
  })
})

// Path 6 (D2 updated_at 不变量) + Path 9 (401) + Path 10 (403) 不在前端 E2E 范围,
// 走 dev backend 真实 API 手动 curl (详 validation-strategy.md §6 + §4).
