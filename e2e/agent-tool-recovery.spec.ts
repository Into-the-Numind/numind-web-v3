import { test, expect } from '@playwright/test'
import { setupAgentMocks } from './helpers/agent-mock'
import { createDiagnostics } from './helpers/diagnose'

const frame = (data: Record<string, unknown>): string => `data: ${JSON.stringify(data)}\n\n`

function recoveredToolStream(runId: number): string {
  const ts = new Date().toISOString()
  return [
    frame({ type: 'stream_start', seq: 1, ts, run_id: runId, data: { run_id: runId, session_id: 'recovery-session' } }),
    frame({
      type: 'tool_call_start', seq: 2, ts, run_id: runId, step: 0,
      data: { tool_call_id: 'lark-attempt-1', tool_name: 'lark_execute', input_digest: 'safe-1', input_preview: { argv: ['drive', '+search'] } }
    }),
    frame({
      type: 'tool_call_error', seq: 3, ts, run_id: runId, step: 0,
      data: { tool_call_id: 'lark-attempt-1', error: 'ERROR: command rejected', duration_ms: 1, recoverable: true }
    }),
    frame({
      type: 'tool_call_start', seq: 4, ts, run_id: runId, step: 1,
      data: { tool_call_id: 'lark-attempt-2', tool_name: 'lark_execute', input_digest: 'safe-2', input_preview: { argv: ['drive', '+search', '--only-title'] } }
    }),
    frame({
      type: 'tool_call_result', seq: 5, ts, run_id: runId, step: 1,
      data: { tool_call_id: 'lark-attempt-2', preview: '{"ok":true}', duration_ms: 50 }
    }),
    frame({
      type: 'terminal', seq: 6, ts, run_id: runId,
      data: { reason: 'completed', duration_ms: 100, step_count: 2, final_output: '已成功读取飞书文档。' }
    })
  ].join('')
}

test('recoverable Feishu correction stays professional and never renders as a red failure', async ({ page }) => {
  const runId = 226
  const diag = createDiagnostics(page)
  await page.addInitScript(() => localStorage.setItem('token', 'e2e-agent-recovery-token'))
  await setupAgentMocks(page)

  await page.route('**/v1/credits/balance', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          cycle_remaining: 1500,
          booster_usable: 0,
          trial_remaining: 0,
          membership_state: 'pro'
        }
      })
    })
  })
  await page.route('**/v1/agent-sessions/history**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: [] }) })
  })
  await page.route('**/v1/tenant-settings/support-contact', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: {} }) })
  })
  await page.route('**/v1/sessions/recovery-session/snapshot', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { session_id: 'recovery-session', agent_skill_id: 1, messages: [], status: 'completed' }
      })
    })
  })
  await page.route(`**/v1/agent-runs/${runId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { id: runId, session_id: 'recovery-session', agent_skill_id: 1, user_id: 1, status: 'completed', final_output: '已成功读取飞书文档。', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      })
    })
  })

  await page.route('**/v1/agent-runs/stream', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      headers: { 'Cache-Control': 'no-cache' },
      body: recoveredToolStream(runId)
    })
  })
  await page.route('**/v1/agent-runs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { run_id: runId, session_id: 'recovery-session' } })
    })
  })

  await page.goto('/agent/chat/recovery-session?agent_id=1')
  await expect(page.locator('textarea').first()).toBeVisible()
  await page.locator('textarea').first().fill('读取飞书文档')
  await page.locator('textarea').first().press('Enter')
  await expect(page.locator('.msg-final')).toContainText('已成功读取飞书文档。')

  diag.dump()
  await diag.domText('.tool-timeline')
  await diag.screenshot('recoverable-lark-tool-error')

  await expect(page.locator('.tool-timeline').first()).toContainText('调整执行方式')
  await expect(page.locator('.tl-line.error')).toHaveCount(0)
  await expect(page.getByText('执行出错')).toHaveCount(0)
})
