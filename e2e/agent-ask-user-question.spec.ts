/**
 * agent-ask-user-question.spec.ts — E2E test for ask_user_question yield flow.
 *
 * Strategy: mock-driven
 *   - VITE_AGENT_MOCK=true handles /v1/agent-runs and /v1/agent-sessions/** via
 *     src/api/agent.mock.ts.
 *   - This test additionally overrides /v1/agent-runs/:id/narration to inject a
 *     tool_call_yield event so QuestionPrompt renders in the chat.
 *   - /v1/agent-runs/:id/answer is intercepted to return { data: { run_id, status: "resumed" } }
 *     without hitting the backend.
 *
 * Run:
 *   VITE_AGENT_MOCK=true npm run test:e2e -- agent-ask-user-question
 *
 * Refs: docs/superpowers/plans/agent-mode-p0-tools-plan.md §3
 */

import { test, expect } from '@playwright/test'
import { setupAgentMocks } from './helpers/agent-mock'

// Narration poll responses: first call → tool_call_yield, subsequent calls → empty
let narrationCallCount = 0

test.describe('ask_user_question yield → answer → resume flow', () => {
  test.beforeEach(async ({ page }) => {
    // Reset per-test counter
    narrationCallCount = 0

    // Standard agent bootstrap mocks (agent list, credits balance)
    await setupAgentMocks(page)

    // Override narration to inject tool_call_yield on first poll
    await page.route('**/v1/agent-runs/*/narration**', async (route) => {
      narrationCallCount++
      if (narrationCallCount === 1) {
        // First poll: inject tool_call_yield event
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            message: 'ok',
            data: [
              {
                run_id: 1,
                tool_call_id: 'tc-ask-1',
                tool_name: 'ask_user_question',
                state: 'use',
                message: '请选择方向',
                timestamp: new Date().toISOString(),
                event_type: 'tool_call_yield',
                yield_payload: {
                  question: '你想分析哪个时间段的数据？',
                  options: [
                    { label: '最近 7 天' },
                    { label: '最近 30 天' },
                    { label: '最近 90 天' }
                  ],
                  multi_select: false,
                  run_id: 1
                }
              }
            ]
          })
        })
      } else {
        // Subsequent polls: empty (agent paused waiting for user)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, message: 'ok', data: [] })
        })
      }
    })

    // Intercept answer submission
    await page.route('**/v1/agent-runs/*/answer', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { run_id: 1, status: 'resumed' }
        })
      })
    })
  })

  test('QuestionPrompt renders after tool_call_yield and answer POST fires on option click', async ({
    page
  }) => {
    // Navigate to a new agent chat session (agent_id=1)
    await page.goto('/agent/chat/new?agent_id=1')

    // Wait for the page to load — FirstRun screen or input area visible
    await expect(page.locator('text=爆款分析师').first()).toBeVisible({ timeout: 10_000 })

    // Type a message and send (triggers createRun → narration polling begins)
    const inputArea = page.locator('textarea, input[type="text"]').first()
    if (await inputArea.isVisible()) {
      await inputArea.fill('帮我分析数据')
      // Try to find and click send button
      const sendBtn = page
        .locator('button')
        .filter({ hasText: /发送|Send/ })
        .first()
      if (await sendBtn.isVisible()) {
        await sendBtn.click()
      } else {
        await inputArea.press('Enter')
      }
    }

    // Wait for QuestionPrompt to appear in chat (narration poll fires tool_call_yield)
    await expect(page.locator('.question-prompt')).toBeVisible({ timeout: 20_000 })

    // Verify question text renders
    await expect(page.getByText('你想分析哪个时间段的数据？')).toBeVisible()

    // Verify all 3 option buttons render
    const optionBtns = page.locator('.question-prompt__option--btn')
    await expect(optionBtns).toHaveCount(3)
    await expect(optionBtns.nth(0)).toContainText('最近 7 天')
    await expect(optionBtns.nth(1)).toContainText('最近 30 天')
    await expect(optionBtns.nth(2)).toContainText('最近 90 天')

    // Screenshot 1: QuestionPrompt rendered
    await page.screenshot({ path: 'test-results/ask-question-prompt-1.png' })

    // Click first option — should POST to answer endpoint
    const answerResponsePromise = page.waitForResponse('**/v1/agent-runs/*/answer', {
      timeout: 5_000
    })
    await optionBtns.first().click()
    const answerResponse = await answerResponsePromise

    // Verify POST was made
    expect(answerResponse.status()).toBe(200)
    const responseBody = await answerResponse.json()
    expect(responseBody.data.status).toBe('resumed')

    // Screenshot 2: after answer submitted
    await page.screenshot({ path: 'test-results/ask-question-prompt-2.png' })
  })

  test('QuestionPrompt options are disabled after answer_status=answered', async ({ page }) => {
    await page.goto('/agent/chat/new?agent_id=1')
    await expect(page.locator('text=爆款分析师').first()).toBeVisible({ timeout: 10_000 })

    // Intercept answer to also inject run_resumed in next narration poll
    let answerSubmitted = false
    await page.route('**/v1/agent-runs/*/answer', async (route) => {
      answerSubmitted = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { run_id: 1, status: 'resumed' }
        })
      })
    })

    // Override narration: first → yield, second → run_resumed
    let narrationCount = 0
    await page.route('**/v1/agent-runs/*/narration**', async (route) => {
      narrationCount++
      if (narrationCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            message: 'ok',
            data: [
              {
                run_id: 1,
                tool_call_id: 'tc-ask-2',
                tool_name: 'ask_user_question',
                state: 'use',
                message: '请选择',
                timestamp: new Date().toISOString(),
                event_type: 'tool_call_yield',
                yield_payload: {
                  question: '你是哪个学员？',
                  options: [{ label: '学员甲' }, { label: '学员乙' }],
                  multi_select: false,
                  run_id: 1
                }
              }
            ]
          })
        })
      } else if (answerSubmitted && narrationCount >= 3) {
        // After answer submitted: send run_resumed
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 0,
            message: 'ok',
            data: [
              {
                run_id: 1,
                tool_call_id: 'tc-ask-2',
                tool_name: 'ask_user_question',
                state: 'result',
                message: '已收到答案',
                timestamp: new Date().toISOString(),
                event_type: 'run_resumed'
              }
            ]
          })
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, message: 'ok', data: [] })
        })
      }
    })

    // Navigate and send message
    const inputArea = page.locator('textarea, input[type="text"]').first()
    if (await inputArea.isVisible()) {
      await inputArea.fill('帮我看学员数据')
      const sendBtn = page
        .locator('button')
        .filter({ hasText: /发送|Send/ })
        .first()
      if (await sendBtn.isVisible()) {
        await sendBtn.click()
      } else {
        await inputArea.press('Enter')
      }
    }

    // Wait for QuestionPrompt
    await expect(page.locator('.question-prompt')).toBeVisible({ timeout: 20_000 })

    // Click option → answer submitted
    const optionBtns = page.locator('.question-prompt__option--btn')
    await optionBtns.first().click()

    // Wait for run_resumed to be processed → question-prompt--answered class
    await expect(page.locator('.question-prompt--answered')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.question-prompt__answered-note')).toBeVisible()
  })
})
