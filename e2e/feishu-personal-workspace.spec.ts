/**
 * Personal Feishu workspace — key-path browser coverage.
 *
 * The real backend owns the original tool call, authorization state machine,
 * scopes, CLI argv and credentials. These tests only emulate its public
 * browser contract so they can verify that the Agent UI:
 *
 *  - presents a server-issued external action in the original conversation;
 *  - resumes it through the dedicated lifecycle endpoint, never /answer;
 *  - sends only the fixed lifecycle action, never client-controlled scopes or
 *    command data; and
 *  - safely refreshes an expired URL on a 375 px viewport.
 */

import { expect, test, type Page, type Request } from '@playwright/test'

interface ActionFixture {
  operation_id: string
  session_id: string
  phase: 'user_auth'
  expires_at: string
  url: string
}

interface LifecycleCapture {
  resumeBodies: Array<Record<string, unknown>>
  refreshBodies: Array<string | null>
  ordinaryAnswerRequests: Request[]
}

interface TerminalRefreshFixture {
  terminal: {
    operation_id: string
    state: 'failed'
  }
}

const FUTURE_ACTION: ActionFixture = {
  operation_id: 'feishu-operation-e2e-301',
  session_id: 'feishu-auth-session-e2e-301',
  phase: 'user_auth',
  expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=opaque-e2e-301'
}

// This spec owns every Agent/Feishu request. It therefore uses an opaque test
// token instead of the shared authenticated-state project, whose setup requires
// a live local backend.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'feishu-e2e-opaque-token')
  })
  await page.route('**/v1/credits/balance', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          trial_remaining: 0,
          cycle_remaining: 1500,
          booster_total: 0,
          booster_usable: 0,
          membership_state: 'pro'
        }
      })
    })
  })
})

function sseFrame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function actionStream(runId: number, action: ActionFixture): string {
  const now = new Date().toISOString()
  return [
    sseFrame({
      type: 'stream_start',
      seq: 1,
      ts: now,
      run_id: runId,
      data: { run_id: runId, session_id: `feishu-e2e-run-${runId}` }
    }),
    sseFrame({
      type: 'external_action',
      seq: 2,
      ts: now,
      run_id: runId,
      data: { provider: 'lark', ...action }
    })
  ].join('')
}

async function installLifecycleMocks(
  page: Page,
  runId: number,
  initialAction: ActionFixture,
  refreshedAction?: ActionFixture | TerminalRefreshFixture
): Promise<LifecycleCapture> {
  const capture: LifecycleCapture = {
    resumeBodies: [],
    refreshBodies: [],
    ordinaryAnswerRequests: []
  }

  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/v1\/agent-runs\/\d+\/answer(?:-stream)?(?:\?|$)/.test(request.url())
    ) {
      capture.ordinaryAnswerRequests.push(request)
    }
  })

  await page.route('**/v1/agent-runs/stream', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: { 'Cache-Control': 'no-cache' },
      body: actionStream(runId, initialAction)
    })
  })

  await page.route('**/v1/feishu/operations/*/resume', async (route) => {
    const raw = route.request().postData()
    capture.resumeBodies.push(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { operation_id: initialAction.operation_id, state: 'succeeded' }
      })
    })
  })

  await page.route('**/v1/feishu/actions/*/refresh', async (route) => {
    capture.refreshBodies.push(route.request().postData())
    const result =
      refreshedAction && 'terminal' in refreshedAction
        ? refreshedAction
        : { action: refreshedAction ?? initialAction }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: result })
    })
  })

  return capture
}

async function openAgentConversation(page: Page, prompt: string): Promise<void> {
  await page.goto('/agent/chat/new?agent_id=1')
  await expect(page.locator('textarea').first()).toBeVisible()
  await page.locator('textarea').first().fill(prompt)
  await page.locator('textarea').first().press('Enter')
}

test.describe('personal Feishu workspace', () => {
  test('desktop: authorization resumes the original Agent task through the lifecycle API', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const capture = await installLifecycleMocks(page, 301, FUTURE_ACTION)

    await openAgentConversation(page, '把这份分析写入飞书文档')

    const card = page.getByTestId('feishu-action-card')
    await expect(card).toBeVisible()
    await expect(card.getByTestId('feishu-phase')).toHaveText('授权并继续')
    await expect(card.getByTestId('feishu-url')).toHaveText(FUTURE_ACTION.url)
    await expect(page.locator('.msg-user')).toContainText('把这份分析写入飞书文档')

    await card.getByTestId('feishu-continue').click()

    await expect.poll(() => capture.resumeBodies).toEqual([{ action: 'user_completed' }])
    await expect(card).toContainText('授权步骤已完成，正在继续原任务。')
    await expect(card.getByTestId('feishu-url')).toHaveCount(0)

    // The browser is only allowed to acknowledge a fixed lifecycle transition.
    // It must not reconstruct an Agent answer or send Feishu scopes/argv/secrets.
    expect(JSON.stringify(capture.resumeBodies[0])).not.toMatch(
      /argv|scope|permission|token|secret|credential/i
    )
    expect(capture.ordinaryAnswerRequests).toHaveLength(0)
  })

  test('mobile: an expired authorization link refreshes safely before continuing', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const expiredAction: ActionFixture = {
      ...FUTURE_ACTION,
      operation_id: 'feishu-operation-e2e-302',
      session_id: 'feishu-auth-session-e2e-302',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=expired-e2e-302'
    }
    const refreshedAction: ActionFixture = {
      ...expiredAction,
      session_id: 'feishu-auth-session-e2e-302-refresh',
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=fresh-e2e-302'
    }
    const capture = await installLifecycleMocks(page, 302, expiredAction, refreshedAction)

    await openAgentConversation(page, '把本周复盘写入飞书文档')

    const card = page.getByTestId('feishu-action-card')
    await expect(card).toBeVisible()
    await expect(card).toContainText('链接已过期，请重新生成后继续。')
    await expect(card.getByTestId('feishu-url')).toHaveCount(0)

    await card.getByTestId('feishu-refresh').click()
    await expect.poll(() => capture.refreshBodies.length).toBe(1)
    expect(capture.refreshBodies[0]).toBeNull()
    await expect(card.getByTestId('feishu-url')).toHaveText(refreshedAction.url)

    const cardBox = await card.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.width).toBeLessThanOrEqual(375)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(375)

    await card.getByTestId('feishu-continue').click()
    await expect.poll(() => capture.resumeBodies).toEqual([{ action: 'user_completed' }])
    expect(capture.ordinaryAnswerRequests).toHaveLength(0)
  })

  test('mobile: a terminal refresh closes the stale card without replaying the Agent task', async ({
    page
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const expiredAction: ActionFixture = {
      ...FUTURE_ACTION,
      operation_id: 'feishu-operation-e2e-303',
      session_id: 'feishu-auth-session-e2e-303',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=expired-e2e-303'
    }
    const capture = await installLifecycleMocks(page, 303, expiredAction, {
      terminal: { operation_id: expiredAction.operation_id, state: 'failed' }
    })

    await openAgentConversation(page, '把客户分析写入飞书文档')

    const card = page.getByTestId('feishu-action-card')
    await expect(card).toContainText('链接已过期，请重新生成后继续。')
    await card.getByTestId('feishu-refresh').click()

    await expect.poll(() => capture.refreshBodies.length).toBe(1)
    expect(capture.refreshBodies[0]).toBeNull()
    await expect(card).toContainText('原飞书任务已结束，请重新发送原指令。')
    await expect(card.getByTestId('feishu-refresh')).toHaveCount(0)
    await expect(card.getByTestId('feishu-continue')).toHaveCount(0)
    expect(capture.ordinaryAnswerRequests).toHaveLength(0)

    await page.waitForTimeout(100)
    expect(capture.refreshBodies).toHaveLength(1)
  })
})
