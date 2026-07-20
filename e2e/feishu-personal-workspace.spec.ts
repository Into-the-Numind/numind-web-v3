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
import { createDiagnostics } from './helpers/diagnose'

interface ActionFixture {
  operation_id: string
  session_id: string
  phase: 'user_auth' | 'confirmation'
  expires_at: string
  url?: string
}

interface LifecycleCapture {
  resumeBodies: Array<Record<string, unknown>>
  refreshBodies: Array<string | null>
  ordinaryAnswerRequests: Request[]
}

interface TerminalRefreshFixture {
  terminal: {
    operation_id: string
    state: 'succeeded' | 'failed' | 'unknown' | 'cancelled'
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
  await page.route('**/v1/agent-skills/available', async (route) => {
    const now = new Date().toISOString()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          list: [
            {
              id: 1,
              name: '飞书测试 Agent',
              description: '验证个人飞书工作空间',
              is_active: true,
              created_at: now,
              updated_at: now
            }
          ],
          total: 1
        }
      })
    })
  })
  await page.route('**/v1/agent-sessions/history', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] })
    })
  })
  await page.route('**/v1/tenant-settings/support-contact', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: {} })
    })
  })
  await page.route('**/v1/agent-sessions/*/title', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { title: '飞书联调测试' } })
    })
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

function sequentialActionStream(runId: number, action: ActionFixture): string {
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
      type: 'tool_call_start',
      seq: 2,
      ts: now,
      run_id: runId,
      step: 1,
      data: {
        tool_call_id: `feishu-tool-${runId}`,
        tool_name: 'lark_execute',
        input_digest: 'safe-sequential-base-fixture'
      }
    }),
    sseFrame({
      type: 'external_action',
      seq: 3,
      ts: now,
      run_id: runId,
      data: { provider: 'lark', ...action }
    })
  ].join('')
}

function detachedAuthorizationPauseStream(
  runId: number,
  action: ActionFixture,
  provisionalText: string
): string {
  const now = new Date().toISOString()
  const messageId = `feishu-provisional-${runId}`
  return [
    sseFrame({
      type: 'stream_start',
      seq: 1,
      ts: now,
      run_id: runId,
      data: { run_id: runId, session_id: `feishu-e2e-run-${runId}` }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 2,
      ts: now,
      run_id: runId,
      step: 1,
      data: { message_id: messageId, text: provisionalText }
    }),
    sseFrame({
      type: 'assistant_message',
      seq: 3,
      ts: now,
      run_id: runId,
      step: 1,
      data: {
        message_id: messageId,
        content: provisionalText,
        reasoning_content: '',
        has_tool_calls: true
      }
    }),
    sseFrame({
      type: 'external_action',
      seq: 4,
      ts: now,
      run_id: runId,
      data: { provider: 'lark', ...action }
    }),
    sseFrame({
      type: 'terminal',
      seq: 5,
      ts: now,
      run_id: runId,
      data: {
        reason: 'waiting_for_user_choice',
        duration_ms: 500,
        step_count: 1,
        final_output: provisionalText
      }
    })
  ].join('')
}

function continuationStream(runId: number): string {
  const now = new Date().toISOString()
  const messageId = `feishu-continuation-${runId}`
  const toolCallId = `feishu-tool-${runId}`
  return [
    sseFrame({
      type: 'tool_call_start',
      seq: 3,
      ts: now,
      run_id: runId,
      step: 1,
      data: {
        tool_call_id: toolCallId,
        tool_name: 'lark_execute',
        input_digest: 'safe-browser-fixture'
      }
    }),
    sseFrame({
      type: 'tool_call_result',
      seq: 4,
      ts: now,
      run_id: runId,
      step: 1,
      data: { tool_call_id: toolCallId, preview: '文档创建完成', duration_ms: 120 }
    }),
    sseFrame({
      type: 'reasoning_delta',
      seq: 5,
      ts: now,
      run_id: runId,
      step: 1,
      data: { message_id: messageId, text: '正在核对飞书写入结果。' }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 6,
      ts: now,
      run_id: runId,
      step: 1,
      data: { message_id: messageId, text: '飞书文档已经创建完成。' }
    }),
    sseFrame({
      type: 'assistant_message',
      seq: 7,
      ts: now,
      run_id: runId,
      step: 1,
      data: {
        message_id: messageId,
        content: '飞书文档已经创建完成。',
        reasoning_content: '正在核对飞书写入结果。',
        has_tool_calls: false
      }
    }),
    sseFrame({
      type: 'terminal',
      seq: 8,
      ts: now,
      run_id: runId,
      data: {
        reason: 'completed',
        duration_ms: 900,
        step_count: 2,
        final_output: '飞书文档已经创建完成。'
      }
    })
  ].join('')
}

async function installOpenAgentStream(page: Page, body: string): Promise<void> {
  await page.addInitScript(
    ({ initialBody }) => {
      const streamWindow = window as typeof window & {
        __feishuE2EStreamController?: ReadableStreamDefaultController<Uint8Array>
      }
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const rawURL = input instanceof Request ? input.url : String(input)
        const requestURL = new URL(rawURL, window.location.origin)
        if (requestURL.pathname.endsWith('/v1/agent-runs/stream')) {
          const encoder = new TextEncoder()
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              streamWindow.__feishuE2EStreamController = controller
              controller.enqueue(encoder.encode(initialBody))
            }
          })
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
          })
        }
        return originalFetch(input, init)
      }
    },
    { initialBody: body }
  )
}

async function finishOpenAgentStream(page: Page, body: string): Promise<void> {
  await page.evaluate((continuationBody) => {
    const streamWindow = window as typeof window & {
      __feishuE2EStreamController?: ReadableStreamDefaultController<Uint8Array>
    }
    const controller = streamWindow.__feishuE2EStreamController
    if (!controller) throw new Error('Feishu E2E Agent stream was not opened')
    controller.enqueue(new TextEncoder().encode(continuationBody))
    controller.close()
    delete streamWindow.__feishuE2EStreamController
  }, body)
}

async function installLifecycleMocks(
  page: Page,
  runId: number,
  initialAction: ActionFixture,
  refreshedAction?: ActionFixture | TerminalRefreshFixture,
  resumeDelayMs = 0
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
    if (resumeDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, resumeDelayMs))
    }
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
  test('desktop: a legacy confirmation continues without buttons, reload, or a second user action', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const runId = 309
    let pageLoads = 0
    const resumeBodies: Array<Record<string, unknown>> = []
    page.on('load', () => {
      pageLoads += 1
    })
    await installOpenAgentStream(
      page,
      actionStream(runId, {
        operation_id: 'feishu-operation-e2e-309',
        session_id: 'legacy-confirmation-e2e-309',
        phase: 'confirmation',
        expires_at: new Date(Date.now() - 60_000).toISOString()
      })
    )
    await page.route('**/v1/feishu/operations/*/resume', async (route) => {
      const raw = route.request().postData()
      resumeBodies.push(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { operation_id: 'feishu-operation-e2e-309', state: 'executing' }
        })
      })
    })

    await openAgentConversation(page, '继续旧版飞书任务')
    await expect(page.getByTestId('feishu-confirm')).toHaveCount(0)
    await expect(page.getByTestId('feishu-cancel')).toHaveCount(0)
    await expect.poll(() => resumeBodies.length).toBe(1)
    expect(resumeBodies[0]).toEqual({
      action: 'confirmed',
      session_id: 'legacy-confirmation-e2e-309'
    })

    await finishOpenAgentStream(page, continuationStream(runId))
    await expect(page.getByText('飞书文档已经创建完成。', { exact: true })).toBeVisible()
    expect(pageLoads).toBe(1)
  })

  test('desktop: a concurrent terminal poll cannot swallow a successful resume before the next permission', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const diag = createDiagnostics(page)
    const runId = 307
    const firstAction: ActionFixture = {
      operation_id: 'feishu-operation-e2e-307-create',
      session_id: 'feishu-auth-session-e2e-307-create',
      phase: 'user_auth',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=CREATE-307'
    }
    const secondAction: ActionFixture = {
      operation_id: 'feishu-operation-e2e-307-node',
      session_id: 'feishu-auth-session-e2e-307-node',
      phase: 'user_auth',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
    }
    const refreshedSecondAction: ActionFixture = {
      ...secondAction,
      session_id: 'feishu-auth-session-e2e-307-node-fresh',
      url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=NODE-307'
    }
    let resumeCompleted = false
    let statusReads = 0
    let snapshotReads = 0

    await installOpenAgentStream(page, sequentialActionStream(runId, firstAction))
    await page.route('**/v1/feishu/operations/*/resume', async (route) => {
      // Reproduce the Dev race: the already-scheduled status poll settles the
      // old card just before the lifecycle request reports success.
      await new Promise((resolve) => setTimeout(resolve, 5_500))
      resumeCompleted = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { operation_id: firstAction.operation_id, state: 'succeeded' }
        })
      })
    })
    await page.route('**/v1/feishu/actions/*/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { action: refreshedSecondAction } })
      })
    })
    await page.route(new RegExp(`/v1/agent-runs/${runId}(?:\\?.*)?$`), async (route) => {
      statusReads += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: runId,
            session_id: `feishu-e2e-run-${runId}`,
            status: resumeCompleted ? 'running' : 'completed',
            state_reason: resumeCompleted ? 'waiting_for_user_choice' : 'completed',
            final_output: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    await page.route(`**/v1/sessions/feishu-e2e-run-${runId}/snapshot`, async (route) => {
      snapshotReads += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            session_id: `feishu-e2e-run-${runId}`,
            agent_skill_id: 1,
            agent_run_ids: [runId],
            last_active_at: new Date().toISOString(),
            status: 'running',
            run: {
              id: runId,
              session_id: `feishu-e2e-run-${runId}`,
              status: 'running',
              state_reason: 'waiting_for_user_choice',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            messages: [
              {
                id: `external-action-${runId}-node`,
                type: 'external_action',
                run_id: runId,
                provider: 'feishu',
                ...secondAction,
                timestamp: new Date().toISOString()
              }
            ]
          }
        })
      })
    })
    await page.route(`**/v1/agent-runs/${runId}/narration*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: [] })
      })
    })

    await openAgentConversation(page, '创建知识库并继续创建节点')
    const cards = page.getByTestId('feishu-action-card')
    await expect(cards).toHaveCount(1)
    await cards.first().getByTestId('feishu-continue').click()

    try {
      await expect(cards).toHaveCount(2, { timeout: 15_000 })
    } catch (error) {
      diag.dump()
      diag.networkFor(`/v1/agent-runs/${runId}`)
      await diag.domText('.agent-message-list')
      await diag.screenshot('feishu-resume-settlement-race')
      throw error
    }
    await expect(cards.nth(1).getByTestId('feishu-url')).toHaveText(refreshedSecondAction.url ?? '')
    expect(statusReads).toBeGreaterThanOrEqual(2)
    expect(snapshotReads).toBeGreaterThanOrEqual(1)
  })

  test('desktop: a second Feishu permission appears from polling without reload and refreshes with an empty body', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const runId = 306
    const firstAction: ActionFixture = {
      operation_id: 'feishu-operation-e2e-306-create',
      session_id: 'feishu-auth-session-e2e-306-create',
      phase: 'user_auth',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=CREATE-306'
    }
    const secondAction: ActionFixture = {
      operation_id: 'feishu-operation-e2e-306-read',
      session_id: 'feishu-auth-session-e2e-306-read',
      phase: 'user_auth',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
    }
    const refreshedSecondAction: ActionFixture = {
      ...secondAction,
      session_id: 'feishu-auth-session-e2e-306-read-fresh',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=READ-306'
    }
    const refreshBodies: Array<string | null> = []
    const ordinaryAnswerRequests: Request[] = []
    const browserErrors: string[] = []
    let pageLoadCount = 0

    page.on('load', () => {
      pageLoadCount += 1
    })
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /\/v1\/agent-runs\/\d+\/answer(?:-stream)?(?:\?|$)/.test(request.url())
      ) {
        ordinaryAnswerRequests.push(request)
      }
    })
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))

    await installOpenAgentStream(page, sequentialActionStream(runId, firstAction))
    await page.route('**/v1/feishu/operations/*/resume', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { operation_id: firstAction.operation_id, state: 'succeeded' }
        })
      })
    })
    await page.route(new RegExp(`/v1/agent-runs/${runId}(?:\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: runId,
            session_id: `feishu-e2e-run-${runId}`,
            status: 'running',
            state_reason: 'waiting_for_user_choice',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    await page.route(`**/v1/sessions/feishu-e2e-run-${runId}/snapshot`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            session_id: `feishu-e2e-run-${runId}`,
            agent_skill_id: 1,
            agent_run_ids: [runId],
            last_active_at: new Date().toISOString(),
            status: 'running',
            run: {
              id: runId,
              session_id: `feishu-e2e-run-${runId}`,
              status: 'running',
              state_reason: 'waiting_for_user_choice',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            messages: [
              {
                id: `external-action-${runId}`,
                type: 'external_action',
                run_id: runId,
                provider: 'feishu',
                ...secondAction,
                timestamp: new Date().toISOString()
              }
            ]
          }
        })
      })
    })
    await page.route('**/v1/feishu/actions/*/refresh', async (route) => {
      refreshBodies.push(route.request().postData())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { action: refreshedSecondAction }
        })
      })
    })
    await page.route(`**/v1/agent-runs/${runId}/narration*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: [] })
      })
    })

    await openAgentConversation(page, '创建多维表格，写入记录后重新读取')
    expect(pageLoadCount).toBe(1)
    const cards = page.getByTestId('feishu-action-card')
    await expect(cards).toHaveCount(1)
    await expect(page.locator('.tl-line.active')).toHaveCount(1)

    await cards.first().getByTestId('feishu-continue').click()
    await expect(cards).toHaveCount(2, { timeout: 15_000 })
    await expect(cards.first()).toContainText('飞书操作已完成，正在继续原任务。')
    await expect(page.locator('.tl-line.active')).toHaveCount(0)
    await expect(page.locator('.tl-line.done')).toHaveCount(1)

    await expect.poll(() => refreshBodies).toEqual([null])
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(1).getByTestId('feishu-url')).toHaveText(refreshedSecondAction.url ?? '')
    await expect(cards.nth(1).locator('img[alt="飞书操作二维码"]')).toBeVisible()
    expect(pageLoadCount).toBe(1)
    expect(ordinaryAnswerRequests).toHaveLength(0)
    expect(browserErrors).toEqual([])
  })

  test('desktop: replacement authorization and Agent continuation stay live without a reload', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const runId = 304
    const replacementAction: ActionFixture = {
      ...FUTURE_ACTION,
      session_id: 'feishu-auth-session-e2e-304-replacement',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=REPLACEMENT-304'
    }
    const resumeBodies: Array<Record<string, unknown>> = []
    const ordinaryAnswerRequests: Request[] = []
    const browserErrors: string[] = []
    let pageLoadCount = 0
    let continuationCompleted = false

    page.on('load', () => {
      pageLoadCount += 1
    })
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /\/v1\/agent-runs\/\d+\/answer(?:-stream)?(?:\?|$)/.test(request.url())
      ) {
        ordinaryAnswerRequests.push(request)
      }
    })
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))

    await installOpenAgentStream(page, actionStream(runId, FUTURE_ACTION))
    await page.route('**/v1/feishu/operations/*/resume', async (route) => {
      const raw = route.request().postData()
      resumeBodies.push(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      const firstResume = resumeBodies.length === 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: firstResume
            ? {
                operation_id: FUTURE_ACTION.operation_id,
                state: 'waiting_user_auth',
                notice_code: 'authorization_expired',
                action: replacementAction
              }
            : { operation_id: FUTURE_ACTION.operation_id, state: 'succeeded' }
        })
      })
      if (!firstResume) {
        continuationCompleted = true
        await finishOpenAgentStream(page, continuationStream(runId))
      }
    })
    await page.route(new RegExp(`/v1/agent-runs/${runId}(?:\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: runId,
            session_id: `feishu-e2e-run-${runId}`,
            status: continuationCompleted ? 'completed' : 'running',
            state_reason: continuationCompleted ? 'completed' : 'waiting_for_user_choice',
            final_output: continuationCompleted ? '飞书文档已经创建完成。' : '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    await page.route(`**/v1/agent-runs/${runId}/narration*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: [] })
      })
    })

    await openAgentConversation(page, '创建一篇飞书文档并在授权后继续告诉我结果')
    expect(pageLoadCount).toBe(1)
    const card = page.getByTestId('feishu-action-card')
    await expect(card).toHaveCount(1)
    await expect(card.getByTestId('feishu-url')).toHaveText(FUTURE_ACTION.url ?? '')

    await card.getByTestId('feishu-continue').click()
    await expect(card).toHaveCount(1)
    await expect(card.getByTestId('feishu-notice')).toHaveText('原链接已过期，已生成新的授权链接。')
    await expect(card.getByTestId('feishu-url')).toHaveText(replacementAction.url ?? '')
    await expect(card.locator('img[alt="飞书操作二维码"]')).toBeVisible()

    await card.getByTestId('feishu-continue').click()
    await expect
      .poll(() => resumeBodies)
      .toEqual([
        { action: 'user_completed', session_id: FUTURE_ACTION.session_id },
        { action: 'user_completed', session_id: replacementAction.session_id }
      ])
    await expect(page.getByText('正在核对飞书写入结果。', { exact: true }).first()).toBeVisible()
    await expect(page.locator('.msg-final')).toContainText('飞书文档已经创建完成。')
    await expect(card).toHaveCount(1)
    await expect(card.getByTestId('feishu-url')).toHaveCount(0)

    expect(pageLoadCount).toBe(1)
    expect(ordinaryAnswerRequests).toHaveLength(0)
    expect(browserErrors).toEqual([])
  })

  test('desktop: a closed authorization stream finishes from status polling without a reload', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const runId = 307
    const action: ActionFixture = {
      operation_id: 'feishu-operation-e2e-307',
      session_id: 'feishu-auth-session-e2e-307',
      phase: 'user_auth',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=DETACHED-307'
    }
    const provisionalText = '记录已经创建，正在等待授权后重新读取。'
    const finalText = '真正的最终结果：记录读取成功。'
    const resumeBodies: Array<Record<string, unknown>> = []
    const observedRunStates: string[] = []
    let pageLoadCount = 0
    let resumed = false
    let postResumeStatusReads = 0
    let continuationNarrationServed = false
    let allowCompletion = false

    page.on('load', () => {
      pageLoadCount += 1
    })

    // Unlike installOpenAgentStream, this finite response closes at the
    // authorization pause. The resumed leg can therefore arrive only through
    // the normal detached run-status observer, matching the production path.
    await page.route('**/v1/agent-runs/stream', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        headers: { 'Cache-Control': 'no-cache' },
        body: detachedAuthorizationPauseStream(runId, action, provisionalText)
      })
    })
    await page.route('**/v1/feishu/operations/*/resume', async (route) => {
      const raw = route.request().postData()
      resumeBodies.push(raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      resumed = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { operation_id: action.operation_id, state: 'succeeded' }
        })
      })
    })
    await page.route(
      new RegExp(`/v1/feishu/operations/${action.operation_id}(?:\\?.*)?$`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            message: 'ok',
            data: { operation_id: action.operation_id, state: 'waiting_user_auth', action }
          })
        })
      }
    )
    await page.route(new RegExp(`/v1/agent-runs/${runId}(?:\\?.*)?$`), async (route) => {
      let status = 'running'
      let stateReason = 'waiting_for_user_choice'
      let finalOutput = provisionalText
      if (resumed) {
        postResumeStatusReads += 1
        if (!allowCompletion) {
          status = 'running'
          stateReason = 'external_resume_ready'
        } else {
          status = 'completed'
          stateReason = 'completed'
          finalOutput = finalText
        }
      }
      observedRunStates.push(stateReason)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: runId,
            session_id: `feishu-e2e-run-${runId}`,
            status,
            state_reason: stateReason,
            final_output: finalOutput,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            started_at: new Date(Date.now() - 30_000).toISOString()
          }
        })
      })
    })
    await page.route(`**/v1/agent-runs/${runId}/narration*`, async (route) => {
      const events =
        resumed && !continuationNarrationServed
          ? [
              {
                run_id: runId,
                tool_call_id: `feishu-detached-tool-${runId}`,
                tool_name: 'lark_execute',
                state: 'use',
                message: '重新读取飞书记录',
                timestamp: new Date().toISOString()
              },
              {
                run_id: runId,
                tool_call_id: `feishu-detached-tool-${runId}`,
                tool_name: 'lark_execute',
                state: 'result',
                message: '飞书记录读取完成',
                timestamp: new Date(Date.now() + 1).toISOString()
              }
            ]
          : []
      if (events.length > 0) continuationNarrationServed = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: events })
      })
    })

    await openAgentConversation(page, '创建多维表格，授权后重新读取记录并告诉我结果')
    const card = page.getByTestId('feishu-action-card')
    await expect(card).toBeVisible()
    await expect(page.locator('.msg-assistant')).toContainText(provisionalText)
    await expect(page.locator('.msg-final')).toHaveCount(0)
    expect(pageLoadCount).toBe(1)

    await card.getByTestId('feishu-continue').click()

    await expect
      .poll(() => resumeBodies)
      .toEqual([{ action: 'user_completed', session_id: action.session_id }])
    await expect(card).toContainText('飞书操作已完成，正在继续原任务。')
    await expect(page.locator('.tl-line.done')).toContainText('飞书记录读取完成')
    const runPulse = page.locator('.run-pulse')
    await expect(runPulse).toBeVisible()
    await expect(runPulse.locator('.time')).toHaveCount(0)
    await expect(runPulse).not.toContainText(/\d+:\d{2}/)
    await expect(runPulse.locator('[title*="已用时"], [aria-label*="已用时"]')).toHaveCount(0)
    await expect(runPulse.locator('.sr-only')).not.toContainText(/\d+:\d{2}/)

    allowCompletion = true
    await expect(page.locator('.msg-final')).toContainText(finalText, { timeout: 15_000 })
    await expect(page.locator('.msg-final')).not.toContainText(provisionalText)
    const timelineOrder = await page.locator('.messages-container > .msg').evaluateAll((nodes) =>
      nodes.map((node) => ({
        assistant: node.classList.contains('msg-assistant'),
        externalAction: node.classList.contains('msg-external-action'),
        toolGroup: node.classList.contains('msg-tool-group'),
        finalAnswer: node.classList.contains('msg-final')
      }))
    )
    const assistantIndex = timelineOrder.findIndex((item) => item.assistant)
    const externalActionIndex = timelineOrder.findIndex((item) => item.externalAction)
    const toolGroupIndex = timelineOrder.findIndex((item) => item.toolGroup)
    const finalAnswerIndex = timelineOrder.findIndex((item) => item.finalAnswer)
    expect(assistantIndex).toBeGreaterThanOrEqual(0)
    expect(externalActionIndex).toBeGreaterThan(assistantIndex)
    expect(toolGroupIndex).toBeGreaterThan(externalActionIndex)
    expect(finalAnswerIndex).toBeGreaterThan(toolGroupIndex)
    expect(finalAnswerIndex).toBe(timelineOrder.length - 1)
    await expect.poll(() => postResumeStatusReads).toBeGreaterThanOrEqual(1)
    expect(observedRunStates.at(-1)).toBe('completed')
    expect(pageLoadCount).toBe(1)
  })

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

    await expect
      .poll(() => capture.resumeBodies)
      .toEqual([{ action: 'user_completed', session_id: FUTURE_ACTION.session_id }])
    await expect(card).toContainText('飞书操作已完成，正在继续原任务。')
    await expect(card.getByTestId('feishu-url')).toHaveCount(0)

    // The browser is only allowed to acknowledge a fixed lifecycle transition.
    // It must not reconstruct an Agent answer or send Feishu scopes/argv/secrets.
    expect(JSON.stringify(capture.resumeBodies[0])).not.toMatch(
      /argv|scope|permission|token|secret|credential/i
    )
    expect(capture.ordinaryAnswerRequests).toHaveLength(0)
  })

  test('desktop: authorization confirmation may finish after the global 30-second API timeout', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const capture = await installLifecycleMocks(page, 305, FUTURE_ACTION, undefined, 31_000)
    await page.route(new RegExp('/v1/agent-runs/305(?:\\?.*)?$'), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: 305,
            session_id: 'feishu-e2e-run-305',
            status: 'running',
            state_reason: 'waiting_for_user_choice',
            final_output: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    await page.route('**/v1/agent-runs/305/narration*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: [] })
      })
    })

    await openAgentConversation(page, '授权完成后继续原来的飞书任务')

    const card = page.getByTestId('feishu-action-card')
    await expect(card).toBeVisible()
    await card.getByTestId('feishu-continue').click()

    await expect
      .poll(() => capture.resumeBodies)
      .toEqual([{ action: 'user_completed', session_id: FUTURE_ACTION.session_id }])
    await expect(card).toContainText('飞书操作已完成，正在继续原任务。', { timeout: 40_000 })
    await expect(card).not.toContainText('请求超时')
    expect(capture.ordinaryAnswerRequests).toHaveLength(0)
  })

  test('mobile: an expired authorization link refreshes safely before continuing', async ({
    page
  }) => {
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
    await expect
      .poll(() => capture.resumeBodies)
      .toEqual([{ action: 'user_completed', session_id: refreshedAction.session_id }])
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
    await expect(page.getByRole('button', { name: '取消任务' })).toHaveCount(0)
    await expect(page.getByText('处理中…', { exact: true })).toHaveCount(0)
    await expect(page.locator('textarea').first()).toBeEnabled()
    expect(capture.ordinaryAnswerRequests).toHaveLength(0)
    await page.waitForTimeout(100)
    expect(capture.refreshBodies).toHaveLength(1)
  })

  test('restored missing-link action regenerates in place without a duplicate card', async ({
    page
  }) => {
    const sessionId = 'feishu-e2e-restored-305'
    const runId = 305
    const operationId = 'feishu-operation-e2e-305'
    const staleSessionId = 'feishu-auth-session-e2e-305-stale'
    const refreshedAction: ActionFixture = {
      operation_id: operationId,
      session_id: 'feishu-auth-session-e2e-305-fresh',
      phase: 'user_auth',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=FRESH-305'
    }
    const refreshBodies: Array<string | null> = []
    const browserErrors: string[] = []

    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })
    page.on('pageerror', (error) => browserErrors.push(error.message))

    await page.route(`**/v1/sessions/${sessionId}/snapshot`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            session_id: sessionId,
            agent_skill_id: 1,
            agent_run_ids: [runId],
            last_active_at: new Date().toISOString(),
            status: 'running',
            run: {
              id: runId,
              session_id: sessionId,
              status: 'running',
              state_reason: 'waiting_for_user_choice',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            messages: [
              {
                id: 'external-action-restored-305',
                type: 'external_action',
                run_id: runId,
                operation_id: operationId,
                session_id: staleSessionId,
                phase: 'user_auth',
                expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
                provider: 'feishu',
                timestamp: new Date().toISOString()
              }
            ]
          }
        })
      })
    })
    await page.route('**/v1/feishu/actions/*/refresh', async (route) => {
      refreshBodies.push(route.request().postData())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { action: refreshedAction }
        })
      })
    })
    await page.route(new RegExp(`/v1/agent-runs/${runId}(?:\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: runId,
            session_id: sessionId,
            status: 'running',
            state_reason: 'waiting_for_user_choice',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      })
    })
    await page.route(`**/v1/agent-runs/${runId}/narration*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: [] })
      })
    })

    await page.goto(`/agent/chat/${sessionId}?agent_id=1`)
    const card = page.getByTestId('feishu-action-card')
    await expect(card).toHaveCount(1)
    await expect.poll(() => refreshBodies).toEqual([null])
    await expect(card).toHaveCount(1)
    await expect(card.getByTestId('feishu-url')).toHaveText(refreshedAction.url ?? '')
    await expect(card.locator('img[alt="飞书操作二维码"]')).toBeVisible()
    expect(browserErrors).toEqual([])
  })
})
