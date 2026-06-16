/**
 * chatbot-draft-input E2E — QA 回归 (hotfix / chatbot-draft-input)
 *
 * Bug: instant-title-ux 的「新对话 draft 延迟建会话」重构后，点击「新对话」进入 draft 态
 * （store.isDraft=true 且无 store.currentSession）时，ChatbotChat.vue 的输入栏
 * `<div v-if="store.currentSession" class="input-stage">` 因 currentSession 为 null
 * 整个不渲染 → 用户看到空对话页但**没有输入框可打字**，无法发送 → 标题秒生成链路根本走不到。
 * S6 dev 浏览器取证发现（vitest 只测 store 逻辑，覆盖不到模板渲染条件）。
 *
 * 修复 = 输入栏渲染条件改为 `store.currentSession || store.isDraft`。
 * 本测试在修复前 FAIL（draft 态 .chat-input 不可见），修复后 PASS。
 * page.route() mock 后端（同 chatbot-session-delete.spec.ts pattern）。
 *
 * Running:
 *   E2E_USERNAME=$E2E_USERNAME E2E_PASSWORD=$E2E_PASSWORD npm run test:e2e -- chatbot-draft-input
 */

import { test, expect, type Page, type Route } from '@playwright/test'

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
      created_at: '2026-06-16T08:00:00+08:00',
      updated_at: '2026-06-16T10:00:00+08:00'
    }
  ]
}

async function installMocks(page: Page, state: { sessions: MockSession[] }) {
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
              description: 'E2E',
              prompt: 'x',
              published: true,
              created_at: '2026-06-01T08:00:00+08:00',
              updated_at: '2026-06-01T08:00:00+08:00'
            }
          ],
          total: 1
        }
      })
    })
  })

  await page.route(/\/v1\/chatbot\/sessions(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const url = new URL(route.request().url())
    const chatbotId = url.searchParams.get('chatbot_id')
    let list = state.sessions
    if (chatbotId) list = state.sessions.filter((s) => s.chatbot_id === Number(chatbotId))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { list, total: list.length } })
    })
  })

  await page.route(/\/v1\/chatbot\/sessions\/\d+\/messages/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { list: [], total: 0 } })
    })
  })

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

test.describe('chatbot 新对话 draft 态', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page, { sessions: initSessions() })
    await page.goto('/chatbot/42')
    await expect(page.locator('.session-item').first()).toBeVisible({ timeout: 15_000 })
  })

  test('点击「新对话」后仍渲染输入框，用户可打字 (regression: draft 态 input-stage 需 isDraft 守卫)', async ({
    page
  }) => {
    // 进入存量会话时输入框在
    await expect(page.locator('.input-stage textarea.chat-input')).toBeVisible()

    // 点击「新对话」进入 draft 态：侧边栏不新增列表项，但输入框必须仍在
    await page.getByRole('button', { name: '新对话' }).click()

    // draft 态侧边栏会话数不变（不提前插入占位）
    await expect(page.locator('.session-item')).toHaveCount(1)

    // 核心回归断言：bug 下 input-stage 整个不渲染 → textarea 不可见 → 此处超时失败
    await expect(page.locator('.input-stage textarea.chat-input')).toBeVisible({ timeout: 5_000 })

    // 能正常输入
    await page.locator('.input-stage textarea.chat-input').fill('帮我写一份市场调研提纲')
    await expect(page.locator('.input-stage textarea.chat-input')).toHaveValue(
      '帮我写一份市场调研提纲'
    )
  })
})
