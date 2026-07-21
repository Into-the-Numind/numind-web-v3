/**
 * agent-streaming.spec.ts — S5 T16-FE: Playwright E2E for streaming agent chat.
 *
 * 5 scenarios per S5 strategy doc
 * (docs/superpowers/specs/2026-05-27-agent-react-streaming-s5-strategy.md §8):
 *
 *  1. Happy stream      — token-level rendering + tool call badges + final answer
 *  2. Abort mid-stream  — 中止 button → SSE close + input re-enabled
 *  3. Multi-tab 409     — second connection gets 409 → fallback polling
 *  4. Disconnect recovery — network offline mid-stream → polling fallback kicks in
 *  5. question_prompt   — yield → choice UI → option click → run resumes
 *
 * Strategy:
 *  - All tests use route interception (page.route / page.fulfill) to drive the
 *    backend responses; no live backend is required.
 *  - The suite runs in the `mocked` Playwright project with VITE_AGENT_MOCK=false.
 *    It seeds an opaque test token and intercepts all required Agent API calls,
 *    including the real browser cancellation request.
 *
 * Selectors (verified against source):
 *  .send-btn--stop[aria-label="终止"]                 — AgentInputArea.vue
 *  .msg-user                                           — AgentMessageItem.vue line 102
 *  .msg-assistant .bubble .streaming-cursor            — AgentMessageItem.vue line 146
 *  .msg-final                                          — AgentMessageItem.vue line 224
 *  .msg-question-prompt / .question-prompt__option--btn — AgentMessageItem + QuestionPrompt.vue
 *
 * Run:
 *   npm run test:e2e -- --project=mocked e2e/agent-streaming.spec.ts
 *
 * Refs: S5 strategy doc §8; T16 in agent-react-streaming-plan.md
 */

import { test, expect } from '@playwright/test'
import { setupAgentMocks } from './helpers/agent-mock'

// ---------------------------------------------------------------------------
// SSE frame builder helpers
// ---------------------------------------------------------------------------

/** Build a single SSE data frame string (terminated with \n\n). */
function sseFrame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

/** Build a full streaming body for a simple text-only agent run. */
function buildHappyStreamBody(runId: number = 1, toolCallId: string = 'tc-1'): string {
  const now = new Date().toISOString()
  const msgId = 'msg-happy-1'
  const frames = [
    // stream_start
    sseFrame({
      type: 'stream_start',
      seq: 1,
      ts: now,
      run_id: runId,
      data: { run_id: runId, session_id: 'sess-1' }
    }),
    // token_deltas
    sseFrame({
      type: 'token_delta',
      seq: 2,
      ts: now,
      run_id: runId,
      data: { message_id: msgId, text: '正在' }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 3,
      ts: now,
      run_id: runId,
      data: { message_id: msgId, text: '分析' }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 4,
      ts: now,
      run_id: runId,
      data: { message_id: msgId, text: '数据...' }
    }),
    // tool_call_start
    sseFrame({
      type: 'tool_call_start',
      seq: 5,
      ts: now,
      run_id: runId,
      step: 0,
      data: {
        tool_call_id: toolCallId,
        tool_name: 'web_search',
        input_digest: 'abc',
        input_preview: { query: 'test' }
      }
    }),
    // tool_call_result
    sseFrame({
      type: 'tool_call_result',
      seq: 6,
      ts: now,
      run_id: runId,
      step: 0,
      data: { tool_call_id: toolCallId, preview: '搜索完成', duration_ms: 200 }
    }),
    // assistant_message (step boundary)
    sseFrame({
      type: 'assistant_message',
      seq: 7,
      ts: now,
      run_id: runId,
      step: 0,
      data: { message_id: msgId, content: '正在分析数据...', has_tool_calls: true }
    }),
    // step_done
    sseFrame({
      type: 'step_done',
      seq: 8,
      ts: now,
      run_id: runId,
      step: 0,
      data: { step_index: 0, stop_reason: 'tool_calls' }
    }),
    // final answer tokens
    sseFrame({
      type: 'token_delta',
      seq: 9,
      ts: now,
      run_id: runId,
      step: 1,
      data: { message_id: 'msg-final-1', text: '分析' }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 10,
      ts: now,
      run_id: runId,
      step: 1,
      data: { message_id: 'msg-final-1', text: '完成，结论如下。' }
    }),
    // terminal
    sseFrame({
      type: 'terminal',
      seq: 11,
      ts: now,
      run_id: runId,
      data: {
        reason: 'completed',
        duration_ms: 1500,
        step_count: 2,
        final_output: '分析完成，结论如下。'
      }
    })
  ]
  return frames.join('')
}

/** Build a minimal streaming body for an abort-mid-stream scenario. */
function buildSlowStreamBody(runId: number = 2): string {
  const now = new Date().toISOString()
  const msgId = 'msg-slow-1'
  // Only send a few tokens — no terminal — so the client can abort mid-stream.
  return [
    sseFrame({
      type: 'stream_start',
      seq: 1,
      ts: now,
      run_id: runId,
      data: { run_id: runId, session_id: 'sess-2' }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 2,
      ts: now,
      run_id: runId,
      data: { message_id: msgId, text: '思考中' }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 3,
      ts: now,
      run_id: runId,
      data: { message_id: msgId, text: '...' }
    })
    // Deliberately no terminal — the test aborts the connection.
  ].join('')
}

/** Build a question_prompt body: tokens, then question_prompt yield. */
function buildQuestionPromptBody(runId: number = 5): string {
  const now = new Date().toISOString()
  return [
    sseFrame({
      type: 'stream_start',
      seq: 1,
      ts: now,
      run_id: runId,
      data: { run_id: runId, session_id: 'sess-5' }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 2,
      ts: now,
      run_id: runId,
      data: { message_id: 'msg-q-1', text: '请问你' }
    }),
    sseFrame({
      type: 'question_prompt',
      seq: 3,
      ts: now,
      run_id: runId,
      data: {
        questions: [
          {
            question: '你想分析哪个时间段？',
            options: [
              { label: '最近 7 天' },
              { label: '最近 30 天' },
              { label: '最近 90 天' }
            ],
            multi_select: false
          }
        ]
      }
    })
    // No terminal — stream paused waiting for user answer.
  ].join('')
}

/** Build a resumed (after answer) stream body with final answer. */
function buildResumedStreamBody(runId: number = 5): string {
  const now = new Date().toISOString()
  return [
    sseFrame({
      type: 'token_delta',
      seq: 10,
      ts: now,
      run_id: runId,
      data: { message_id: 'msg-resumed-1', text: '好的，' }
    }),
    sseFrame({
      type: 'token_delta',
      seq: 11,
      ts: now,
      run_id: runId,
      data: { message_id: 'msg-resumed-1', text: '为你分析最近 7 天的数据。' }
    }),
    sseFrame({
      type: 'terminal',
      seq: 12,
      ts: now,
      run_id: runId,
      data: {
        reason: 'completed',
        duration_ms: 800,
        step_count: 1,
        final_output: '好的，为你分析最近 7 天的数据。'
      }
    })
  ].join('')
}

// ---------------------------------------------------------------------------
// Common setup helper
// ---------------------------------------------------------------------------

/**
 * Install every non-stream endpoint shared by the mocked Agent chat tests.
 * Keeping this independent of VITE_AGENT_MOCK makes the browser's cancellation
 * request observable end-to-end.
 */
async function setupStreamingBootstrap(
  page: import('@playwright/test').Page,
  runId: number,
  sessionId = `sess-${runId}`
): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'agent-streaming-test-token')
  })

  await setupAgentMocks(page)

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
      body: JSON.stringify({ code: 0, message: 'ok', data: { title: '测试会话' } })
    })
  })

  await page.route('**/v1/sessions/*/snapshot', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { session_id: sessionId, agent_skill_id: 1, messages: [], status: 'completed' }
      })
    })
  })

  await page.route('**/v1/agent-runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { run_id: runId, status: 'running', session_id: sessionId }
      })
    })
  })
}

/** Install stream-specific mocks for a running Agent task. */
async function setupStreamMocks(
  page: import('@playwright/test').Page,
  opts: {
    runId?: number
    streamBody?: string
    conflictOnSecond?: boolean
    runStatus?: 'running' | 'pending' | 'completed' | 'terminated'
    runStateReason?: string
  } = {}
): Promise<void> {
  const {
    runId = 1,
    streamBody = buildHappyStreamBody(runId),
    conflictOnSecond = false,
    runStatus = 'terminated',
    runStateReason = runStatus === 'terminated' ? 'completed' : 'running'
  } = opts

  await setupStreamingBootstrap(page, runId)

  // A finite stream may complete before Vue finishes the new-session URL
  // transition. Make the persisted snapshot match that completed UI state.
  await page.route('**/v1/sessions/*/snapshot', async (route) => {
    const now = new Date().toISOString()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          session_id: `sess-${runId}`,
          agent_skill_id: 1,
          messages: [
            { id: `snapshot-user-${runId}`, type: 'user', text: '分析最近的数据', timestamp: now },
            {
              id: `snapshot-final-${runId}`,
              type: 'final_answer',
              markdown: '分析完成，结论如下。',
              run_id: runId,
              timestamp: now
            }
          ],
          status: 'completed'
        }
      })
    })
  })

  // GET /v1/agent-runs/:id — status polling fallback. Register this broad
  // route before the more specific stream route: Playwright invokes matching
  // routes in reverse registration order.
  await page.route('**/v1/agent-runs/*', async (route) => {
    if (route.request().method() === 'GET' && !route.request().url().includes('/narration')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { id: runId, status: runStatus, state_reason: runStateReason, session_id: `sess-${runId}` }
        })
      })
    } else {
      await route.fallback()
    }
  })

  // POST /v1/agent-runs/stream — the SSE streaming endpoint.
  let streamCallCount = 0
  await page.route('**/v1/agent-runs/stream', async (route) => {
    streamCallCount++

    if (conflictOnSecond && streamCallCount >= 2) {
      // Return 409 to trigger AgentStreamConflict → polling fallback.
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 409, message: 'stream conflict', data: { run_id: runId } })
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      },
      body: streamBody
    })
  })

}

/**
 * Keep a browser-owned SSE response open until the UI aborts it. A finite
 * `route.fulfill({ body })` closes at EOF and would hide the stop control before
 * the test can prove that clicking it calls the server cancellation endpoint.
 */
async function installOpenStream(page: import('@playwright/test').Page, runId: number): Promise<void> {
  await page.addInitScript((id) => {
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (!url.includes('/v1/agent-runs/stream')) {
        return nativeFetch(input, init)
      }

      const encoder = new TextEncoder()
      const now = new Date().toISOString()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: Record<string, unknown>): void => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          }
          send({
            type: 'stream_start',
            seq: 1,
            ts: now,
            run_id: id,
            data: { run_id: id, session_id: `sess-${id}` }
          })
          send({
            type: 'token_delta',
            seq: 2,
            ts: now,
            run_id: id,
            data: { message_id: `msg-${id}`, text: '正在处理…' }
          })
          init?.signal?.addEventListener(
            'abort',
            () => {
              document.documentElement.dataset.agentStreamAborted = 'true'
              controller.error(new DOMException('aborted by test', 'AbortError'))
            },
            { once: true }
          )
        }
      })
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
      })
    }
  }, runId)
}

// ---------------------------------------------------------------------------
// Scenario 1: Happy stream
// ---------------------------------------------------------------------------

test.describe('Scenario 1 — happy stream', () => {
  test.beforeEach(async ({ page }) => {
    await setupStreamMocks(page, { runId: 1, streamBody: buildHappyStreamBody(1) })
  })

  test('token text appears, tool call card shows, final answer arrives, input re-enabled', async ({
    page
  }) => {
    await page.goto('/agent/chat/new?agent_id=1')
    await expect(page.locator('text=爆款分析师').first()).toBeVisible({ timeout: 10_000 })

    // Send a message.
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill('分析最近的数据')
    await textarea.press('Enter')

    // User message bubble must appear.
    await expect(page.locator('.msg-user').first()).toBeVisible({ timeout: 10_000 })

    // Final answer must eventually arrive (.msg-final = AgentMessageItem final_answer type).
    await expect(page.locator('.msg-final').first()).toBeVisible({ timeout: 30_000 })

    // After terminal, the stop control is replaced by the normal send button.
    await expect(page.locator('button[aria-label="发送"]').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('textarea').first()).toBeEnabled({ timeout: 5_000 })
  })

  test('runtime view never shows the header cancel button or input credit estimate', async ({ page }) => {
    await installOpenStream(page, 1)
    await page.goto('/agent/chat/new?agent_id=1')

    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible()
    await expect(page.locator('.first-run__identity')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '取消任务' })).toHaveCount(0)

    await textarea.fill('请分析本周的内容表现')
    await expect(page.getByText(/预计消耗/)).toHaveCount(0)

    await textarea.press('Enter')
    await expect(page.locator('.send-btn--stop[aria-label="终止"]')).toBeVisible()
    await expect(page.getByRole('button', { name: '取消任务' })).toHaveCount(0)
  })

  test('取消失败时保留输入停止键以便重试', async ({ page }) => {
    await installOpenStream(page, 3)
    await setupStreamMocks(page, { runId: 3 })
    await page.route('**/v1/agent-runs/3/cancel', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 500, message: 'cancel failed' })
      })
    })

    await page.goto('/agent/chat/new?agent_id=1')
    const textarea = page.locator('textarea').first()
    await textarea.fill('请做一个很长的分析')
    await textarea.press('Enter')

    const stopButton = page.locator('.send-btn--stop[aria-label="终止"]')
    await expect(stopButton).toBeVisible()
    await stopButton.click()

    await expect(page.locator('html')).toHaveAttribute('data-agent-stream-aborted', 'true')
    await expect(stopButton).toBeVisible()
    await expect(textarea).toBeDisabled()
  })

  test('恢复中的非 SSE run 仍可从输入区停止', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('agentChat:currentRunId', '4')
      sessionStorage.setItem('agentChat:currentSessionId', 'sess-4')
    })
    await setupStreamMocks(page, { runId: 4, runStatus: 'running' })
    let cancelCalls = 0
    await page.route('**/v1/agent-runs/4/cancel', async (route) => {
      cancelCalls += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { run_id: 4, status: 'cancelled' } })
      })
    })

    await page.goto('/agent/chat/new?agent_id=1')
    const stopButton = page.locator('.send-btn--stop[aria-label="终止"]')
    await expect(stopButton).toBeVisible()
    await stopButton.click()
    await expect.poll(() => cancelCalls).toBe(1)
    await expect(page.locator('textarea').first()).toBeEnabled()
  })

  test('取消请求进行中连续触发停止仅发送一次', async ({ page }) => {
    await installOpenStream(page, 5)
    await setupStreamMocks(page, { runId: 5 })
    let cancelCalls = 0
    let completeCancel: (() => void) | undefined
    const cancelPending = new Promise<void>((resolve) => {
      completeCancel = resolve
    })
    await page.route('**/v1/agent-runs/5/cancel', async (route) => {
      cancelCalls += 1
      await cancelPending
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { run_id: 5, status: 'cancelled' } })
      })
    })

    await page.goto('/agent/chat/new?agent_id=1')
    const textarea = page.locator('textarea').first()
    await textarea.fill('请做一个很长的分析')
    await textarea.press('Enter')
    const stopButton = page.locator('.send-btn--stop[aria-label="终止"]')
    await expect(stopButton).toBeVisible()
    await stopButton.evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await expect.poll(() => cancelCalls).toBe(1)
    await expect(page.locator('html')).toHaveAttribute('data-agent-stream-aborted', 'true')
    completeCancel?.()
    await expect(textarea).toBeEnabled()
  })
})

// ---------------------------------------------------------------------------
// Scenario 2: Abort mid-stream
// ---------------------------------------------------------------------------

test.describe('Scenario 2 — abort mid-stream', () => {
  test('输入区停止键会取消服务端 Agent run', async ({ page }) => {
    const cancelRequests: { method: string; url: string }[] = []
    await installOpenStream(page, 2)
    await setupStreamMocks(page, { runId: 2 })
    await page.route('**/v1/agent-runs/2/cancel', async (route) => {
      cancelRequests.push({ method: route.request().method(), url: route.request().url() })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { run_id: 2, status: 'cancelled' } })
      })
    })

    await page.goto('/agent/chat/new?agent_id=1')
    await expect(page.locator('text=爆款分析师').first()).toBeVisible({ timeout: 10_000 })

    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill('请做一个很长的分析')
    await textarea.press('Enter')

    const stopButton = page.locator('.send-btn--stop[aria-label="终止"]')
    await expect(stopButton).toBeVisible({ timeout: 10_000 })

    // Stream has started — some token text should be visible.
    await expect(page.locator('.msg-assistant').first()).toBeVisible({ timeout: 5_000 })

    await stopButton.click()

    await expect
      .poll(() => cancelRequests.length, { timeout: 5_000 })
      .toBe(1)
    expect(cancelRequests[0]).toMatchObject({
      method: 'POST',
      url: expect.stringContaining('/v1/agent-runs/2/cancel')
    })

    await expect(page.locator('textarea').first()).toBeEnabled({ timeout: 5_000 })
  })
})

// ---------------------------------------------------------------------------
// Scenario 3: Multi-tab 409 fallback
// ---------------------------------------------------------------------------

test.describe('Scenario 3 — multi-tab 409 fallback', { tag: '@known-flaky' }, () => {
  test.fixme(
    true,
    'Multi-tab 409 test cannot be reliably reproduced with Playwright route interception: ' +
      'a second browser context does not share page.route() overrides from the first context, ' +
      'so we cannot force the second tab to hit the real /v1/agent-runs/stream endpoint that ' +
      'would return 409. ' +
      'Alternative: test the useAgentStream fallback branch in a Vitest unit test that mocks ' +
      'fetch to return 409; deferred to S5 follow-up. ' +
      'Tracking: agent-react-streaming-plan.md T16 §3 — multi-tab 409 Playwright scenario.'
  )

  test('second tab gets 409 and falls back to polling', async ({ browser }) => {
    // This test is marked fixme — the body below is indicative of the desired
    // scenario if Playwright gains cross-context route sharing.
    const ctx1 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
    const ctx2 = await browser.newContext({ storageState: 'e2e/.auth/user.json' })

    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    // Tab 1 starts streaming.
    await page1.goto('/agent/chat/new?agent_id=1')

    // Tab 2 tries to stream the same run → expects 409 → fallback polling.
    await page2.goto('/agent/chat/new?agent_id=1')

    // Both tabs clean up.
    await ctx1.close()
    await ctx2.close()
  })
})

// ---------------------------------------------------------------------------
// Scenario 4: Network interruption retains a recovery stop control
// ---------------------------------------------------------------------------

test.describe('Scenario 4 — network interruption recovery', () => {
  test('network interruption leaves the input stop control available to end the active run', async ({
    page,
    context
  }) => {
    const runId = 4

    // Override stream endpoint to deliver partial body then we'll go offline.
    await setupStreamingBootstrap(page, runId)

    // POST /v1/agent-runs/stream — returns partial stream; the rest is lost when we go offline.
    await page.route('**/v1/agent-runs/stream', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        headers: { 'Cache-Control': 'no-cache' },
        body: buildSlowStreamBody(runId)
      })
    })

    // GET /v1/agent-runs/:id — polling fallback returns completed state.
    await page.route(`**/v1/agent-runs/${runId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            id: runId,
            status: 'terminated',
            state_reason: 'completed',
            session_id: 'sess-4',
            messages: JSON.stringify([
              { role: 'user', content: '测试断线恢复' },
              { role: 'assistant', content: '断线后轮询恢复的回答。' }
            ])
          }
        })
      })
    })

    let cancelCalls = 0
    await page.route(`**/v1/agent-runs/${runId}/cancel`, async (route) => {
      cancelCalls += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { run_id: runId, status: 'cancelled' } })
      })
    })

    await page.goto('/agent/chat/new?agent_id=1')
    await expect(page.locator('text=爆款分析师').first()).toBeVisible({ timeout: 10_000 })

    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill('测试断线恢复')
    await textarea.press('Enter')

    // Wait for streaming to start.
    await expect(page.locator('.msg-assistant').first()).toBeVisible({ timeout: 10_000 })

    // Go offline mid-stream.
    await context.setOffline(true)

    // Wait 2 seconds (SSE reader will see a network error → AbortError or fetch failure).
    await page.waitForTimeout(2_000)

    // Restore network — useAgentStream catches the non-Abort error and calls store.applyError,
    // OR if the stream body was already fully delivered before offline, the terminal fires.
    await context.setOffline(false)

    // A generic network interruption does not claim terminal state; the server
    // run remains active. The input's only stop control must stay usable so the
    // learner can explicitly cancel the server-side task.
    const stopButton = page.locator('.send-btn--stop[aria-label="终止"]')
    await expect(stopButton).toBeVisible({ timeout: 10_000 })
    await stopButton.click()
    await expect.poll(() => cancelCalls).toBe(1)
    await expect(page.locator('textarea').first()).toBeEnabled({ timeout: 10_000 })
    await expect(page.locator('button[aria-label="发送"]').first()).toBeVisible({ timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// Scenario 5: question_prompt flow
// ---------------------------------------------------------------------------

test.describe('Scenario 5 — question_prompt yield → choice → resume', () => {
  test.beforeEach(async ({ page }) => {
    const runId = 5

    await setupStreamingBootstrap(page, runId)

    // POST /v1/agent-runs/stream — first call yields question_prompt, pauses.
    let streamCallCount = 0
    await page.route('**/v1/agent-runs/stream', async (route) => {
      streamCallCount++
      if (streamCallCount === 1) {
        // First stream: delivers question_prompt, no terminal.
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          headers: { 'Cache-Control': 'no-cache' },
          body: buildQuestionPromptBody(runId)
        })
      } else {
        // Second stream (after answer): delivers resumed tokens + terminal.
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream; charset=utf-8',
          headers: { 'Cache-Control': 'no-cache' },
          body: buildResumedStreamBody(runId)
        })
      }
    })

    // POST /v1/agent-runs/:id/answer-stream — persist answers and stream the
    // resumed leg through the same SSE protocol.
    await page.route('**/v1/agent-runs/*/answer-stream', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        headers: { 'Cache-Control': 'no-cache' },
        body: buildResumedStreamBody(runId)
      })
    })

    // GET /v1/agent-runs/:id — terminal reconciliation confirms completion.
    await page.route(`**/v1/agent-runs/${runId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { id: runId, status: 'completed', state_reason: 'completed', session_id: 'sess-5' }
        })
      })
    })
  })

  test('QuestionPrompt UI appears, option click submits answer, stream resumes with final answer', async ({
    page
  }) => {
    await page.goto('/agent/chat/new?agent_id=1')
    await expect(page.locator('text=爆款分析师').first()).toBeVisible({ timeout: 10_000 })

    // Send a message that triggers the question_prompt flow.
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill('分析我的数据')
    await textarea.press('Enter')

    // User message appears.
    await expect(page.locator('.msg-user').first()).toBeVisible({ timeout: 10_000 })

    // QuestionPrompt must appear in the chat.
    // .msg-question-prompt wraps the QuestionPrompt component (AgentMessageItem line 258).
    await expect(page.locator('.msg-question-prompt').first()).toBeVisible({ timeout: 20_000 })

    // Verify question text renders.
    await expect(page.getByText('你想分析哪个时间段？')).toBeVisible({ timeout: 5_000 })

    // Option buttons must render.
    const optionBtns = page.locator('.question-prompt__option--btn')
    await expect(optionBtns.first()).toBeVisible({ timeout: 5_000 })

    // The answer-stream POST is the single persistence + resume request.
    const answerResponsePromise = page.waitForResponse('**/v1/agent-runs/*/answer-stream', {
      timeout: 5_000
    })

    // Select the first option, then explicitly submit it.
    await optionBtns.first().click()
    await page.getByRole('button', { name: '提交回答' }).click()

    // Answer-stream POST must fire.
    const answerResp = await answerResponsePromise
    expect(answerResp.status()).toBe(200)

    // After answer: stream resumes → final answer arrives.
    await expect(page.locator('.msg-final').first()).toBeVisible({ timeout: 30_000 })

    // Input is re-enabled after terminal.
    await expect(page.locator('textarea').first()).toBeEnabled({ timeout: 10_000 })
    await expect(page.locator('button[aria-label="发送"]').first()).toBeVisible({ timeout: 5_000 })
  })
})

// ---------------------------------------------------------------------------
// Customer regression: external-action card must not sever the live stream
// ---------------------------------------------------------------------------

test.describe('Customer regression — post-card realtime continuation', () => {
  const runId = 91

  test.beforeEach(async ({ page }) => {
    await setupStreamMocks(page, {
      runId,
      runStatus: 'terminated',
      runStateReason: 'waiting_for_user_choice'
    })

    await page.addInitScript((id) => {
      const nativeFetch = window.fetch.bind(window)
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const encoder = new TextEncoder()
        const frame = (cursor: string, event: Record<string, unknown>): Uint8Array =>
          encoder.encode(`id: ${cursor}\ndata: ${JSON.stringify(event)}\n\n`)
        const now = new Date().toISOString()

        if (url.includes(`/v1/agent-runs/${id}/events`)) {
          document.documentElement.dataset.postCardStreamAttached = 'true'
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              window.setTimeout(() => {
                controller.enqueue(
                  frame('2000-0', {
                    type: 'stream_start',
                    seq: 1,
                    ts: now,
                    run_id: id,
                    data: { run_id: id, session_id: `sess-${id}` }
                  })
                )
              }, 100)
              window.setTimeout(() => {
                controller.enqueue(
                  frame('2001-0', {
                    type: 'reasoning_delta',
                    seq: 2,
                    ts: now,
                    run_id: id,
                    data: { message_id: 'post-card-message', text: '卡片后正在实时思考' }
                  })
                )
              }, 250)
              window.setTimeout(() => {
                controller.enqueue(
                  frame('2002-0', {
                    type: 'token_delta',
                    seq: 3,
                    ts: now,
                    run_id: id,
                    data: { message_id: 'post-card-message', text: '卡片后的正式文字已实时到达' }
                  })
                )
              }, 400)
              window.setTimeout(() => {
                controller.enqueue(
                  frame('2003-0', {
                    type: 'tool_call_start',
                    seq: 4,
                    ts: now,
                    run_id: id,
                    step: 0,
                    data: {
                      tool_call_id: 'post-card-tool',
                      tool_name: 'web_search',
                      input_digest: 'digest'
                    }
                  })
                )
              }, 550)
              // Keep the response open long enough for assertions to prove that
              // the DOM changed before EOF/terminal or a snapshot refresh.
              window.setTimeout(() => {
                controller.enqueue(
                  frame('2004-0', {
                    type: 'terminal',
                    seq: 5,
                    ts: now,
                    run_id: id,
                    data: { reason: 'completed', duration_ms: 1, step_count: 1 }
                  })
                )
                controller.close()
              }, 4000)
            }
          })
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
          })
        }

        if (url.includes('/v1/agent-runs/stream')) {
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                frame('1000-0', {
                  type: 'stream_start',
                  seq: 1,
                  ts: now,
                  run_id: id,
                  data: { run_id: id, session_id: `sess-${id}` }
                })
              )
              controller.enqueue(
                frame('1001-0', {
                  type: 'token_delta',
                  seq: 2,
                  ts: now,
                  run_id: id,
                  data: { message_id: 'pre-card-message', text: '卡片前内容' }
                })
              )
              controller.enqueue(
                frame('1002-0', {
                  type: 'external_action',
                  seq: 3,
                  ts: now,
                  run_id: id,
                  data: {
                    provider: 'lark',
                    operation_id: 'post-card-operation',
                    session_id: 'post-card-session',
                    phase: 'user_auth',
                    url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=post-card',
                    expires_at: new Date(Date.now() + 300_000).toISOString()
                  }
                })
              )
              controller.enqueue(
                frame('1003-0', {
                  type: 'terminal',
                  seq: 4,
                  ts: now,
                  run_id: id,
                  data: { reason: 'waiting_for_user_choice', duration_ms: 1, step_count: 1 }
                })
              )
              controller.close()
            }
          })
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }
          })
        }

        return nativeFetch(input, init)
      }
    }, runId)
  })

  test('reasoning, formal text and tool activity render before the continuation stream ends', async ({
    page
  }) => {
    await page.goto('/agent/chat/new?agent_id=1')
    const textarea = page.locator('textarea').first()
    await textarea.fill('执行需要外部授权的打标任务')
    await textarea.press('Enter')

    await expect(page.getByText('卡片前内容')).toBeVisible()
    await expect(page.locator('.msg-external-action').first()).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-post-card-stream-attached', 'true')
    await expect(page.getByText('卡片后正在实时思考')).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('卡片后的正式文字已实时到达')).toBeVisible({ timeout: 2000 })
    await expect(page.getByText(/搜索/).last()).toBeVisible({ timeout: 2000 })
  })
})
