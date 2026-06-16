/**
 * chatbot-session-delete E2E — bug-from-customer 回归 (instant-title-ux / T-delete-bug)
 *
 * Bug: 用户报 dev 上 chatbot 删除会话「不起作用」。浏览器取证根因：删除确认弹窗用
 * `class="modal-overlay"` 但缺 `open` class，全局 sales-modal.css `.modal-overlay{opacity:0;
 * pointer-events:none}` 使其隐形且不可点击（`.modal-overlay.open` 才 opacity:1+pointer-events:auto）。
 * AgentChatView 用 `modal-overlay open` 故 agent 删除正常。修复 = 给 chatbot 删除弹窗加 `open`。
 *
 * 本测试在修复前 FAIL（确认「删除」按钮 pointer-events:none → click 超时 / DELETE 不发），
 * 修复后 PASS。page.route() mock 后端（同 chatbot-session-rename-pin.spec.ts pattern）。
 *
 * Running:
 *   E2E_USERNAME=$E2E_USERNAME E2E_PASSWORD=$E2E_PASSWORD npm run test:e2e -- chatbot-session-delete
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
    },
    {
      id: 2,
      user_id: 1,
      chatbot_id: 42,
      title: '客户B需求',
      status: 'active',
      message_count: 5,
      pinned_at: null,
      created_at: '2026-06-16T09:00:00+08:00',
      updated_at: '2026-06-16T11:00:00+08:00'
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

  // GET list
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

  // DELETE /v1/chatbot/sessions/:id — removes from state
  await page.route(/\/v1\/chatbot\/sessions\/\d+$/, async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    const m = route
      .request()
      .url()
      .match(/\/sessions\/(\d+)$/)
    const id = m ? Number(m[1]) : 0
    state.sessions = state.sessions.filter((s) => s.id !== id)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: null })
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

test.describe('chatbot 删除会话', () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page, { sessions: initSessions() })
    await page.goto('/chatbot/42')
    await expect(page.locator('.session-item').first()).toBeVisible({ timeout: 15_000 })
  })

  test('删除确认弹窗可点击 → 会话被移除 (regression: 弹窗需 open class 否则隐形不可点)', async ({
    page
  }) => {
    await expect(page.locator('.session-item')).toHaveCount(2)

    // 打开第一个会话的操作菜单 → 点"删除"（菜单项）
    await page.getByRole('button', { name: '更多操作' }).first().click()
    await page.locator('.session-menu-dropdown.show').getByRole('button', { name: '删除' }).click()

    // 确认弹窗的"删除"按钮：bug 下 opacity:0 + pointer-events:none → click 超时（复现）
    const deleteFired = page.waitForRequest(
      (r) => r.method() === 'DELETE' && /\/v1\/chatbot\/sessions\/\d+$/.test(r.url()),
      { timeout: 6_000 }
    )
    await page.locator('.modal-overlay .modal-btn.danger').click({ timeout: 5_000 })
    await deleteFired // 修复后才会发出；bug 下点不到 → 超时失败

    // 会话从列表移除（删后 refetch）
    await expect(page.locator('.session-item')).toHaveCount(1)
  })
})
