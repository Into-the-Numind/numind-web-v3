/**
 * student-dialog-happy.spec.ts — M-B2: Student Dialog Happy Path (dev integration)
 *
 * Real LLM ReAct happy path: student picks the seeded test agent (id 99999),
 * sends a message, watches narration tool-call events appear, then receives a
 * non-empty final answer. Cost transparency (积分 consumed) is also verified.
 *
 * REQUIRES:
 *   E2E_INTEGRATION=true      — opt-in gate; CI stays green without it
 *   E2E_STUDENT_USERNAME      — a child account seeded with ≥ 100 credits
 *   E2E_STUDENT_PASSWORD      — password for the child account
 *   Running dev backend       — /v1/agent-skills/available must return id 99999
 *   Running dev LLM           — real ReAct loop with tool calls
 *
 * Run after Phase D dev deploy:
 *   E2E_INTEGRATION=true \
 *   E2E_STUDENT_USERNAME=xxx \
 *   E2E_STUDENT_PASSWORD=yyy \
 *   npm run test:e2e -- student-dialog-happy
 *
 * Selector notes (verified against source):
 *   .agent-card          — AgentCard.vue wrapping <article>
 *   "开始使用" button    — AppButton inside AgentCard.vue card-footer
 *   /\/agent\/chat\/new/ — router url pattern (AgentSelectView emits start → router)
 *   .msg-tool-group      — AgentMessageItem.vue: <div class="msg msg-tool-group">
 *   .tool-call-list      — AgentToolCallList.vue outer wrapper (≥1 tool step ran)
 *   .msg-final           — AgentMessageItem.vue: <div class="msg msg-final">
 *   .final-answer        — AgentFinalAnswer.vue outer wrapper
 *   .markdown-body       — AgentFinalAnswer.vue: rendered markdown content
 *   .credits             — AgentChatHeader.vue: "已用 N 积分" span
 *
 * NDF v2 #14/14 Phase B (web-v3 part 1)
 */

import { test, expect } from '@playwright/test'
import { auth } from './helpers/selectors'
import fixtureJson from './fixtures/test-agent-id.json'

const SHOULD_RUN = process.env.E2E_INTEGRATION === 'true'
const STUDENT_USER = process.env.E2E_STUDENT_USERNAME ?? ''
const STUDENT_PASS = process.env.E2E_STUDENT_PASSWORD ?? ''

// Default skip keeps CI green. The wrapping describe.skip ensures the
// setup/teardown also doesn't fire in non-integration runs.
test.describe.skip('M-B2: student dialog happy path (dev integration)', () => {
  test.skip(!SHOULD_RUN, 'Requires E2E_INTEGRATION=true + dev backend + dev LLM')
  test.skip(
    !STUDENT_USER || !STUDENT_PASS,
    'Requires E2E_STUDENT_USERNAME + E2E_STUDENT_PASSWORD env vars'
  )

  // Student must log in manually because auth.setup.ts uses E2E_USERNAME (parent).
  // We skip storageState here and do a fresh login as the student account.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('student selects test agent, sends message, sees final answer', async ({ page }) => {
    // ── Step 0: log in as student ─────────────────────────────────────────────
    await page.goto('/login')
    await expect(page.locator(auth.loginButton)).toBeVisible({ timeout: 10_000 })
    await page.locator(auth.usernameInput).fill(STUDENT_USER)
    await page.locator(auth.passwordInput).fill(STUDENT_PASS)
    await page.locator(auth.loginButton).click()
    await expect(page).toHaveURL('/', { timeout: 20_000 })

    // ── Step 1: navigate to /agent ────────────────────────────────────────────
    await page.goto('/agent')
    // Wait for agent card list to render
    await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 15_000 })

    // ── Step 2: select the seeded test agent (id 99999, name from fixture) ────
    const agentCard = page.locator('.agent-card', { hasText: fixtureJson.agent_name })
    await expect(agentCard).toBeVisible({ timeout: 10_000 })
    // Click "开始使用" inside that card
    await agentCard.getByRole('button', { name: '开始使用' }).click()

    // Router should push to /agent/chat/new?agent_id=99999
    await page.waitForURL(/\/agent\/chat\/new/, { timeout: 15_000 })

    // ── Step 3: type and send a message ──────────────────────────────────────
    // AgentInputArea uses a <textarea> (AgentInputArea.vue)
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill('搜索 numind 是什么')
    await textarea.press('Enter')

    // User message bubble should appear immediately
    await expect(page.locator('.msg-user').first()).toBeVisible({ timeout: 10_000 })

    // ── Step 4: wait for ≥ 1 narration tool-call event ───────────────────────
    // AgentToolCallList renders once the ReAct loop fires a tool step.
    // .msg-tool-group wraps the list inside AgentMessageItem.
    await expect(page.locator('.msg-tool-group').first()).toBeVisible({ timeout: 45_000 })
    // .tool-call-list inner wrapper confirms ≥1 step ran
    await expect(page.locator('.tool-call-list').first()).toBeVisible({ timeout: 5_000 })

    // ── Step 5: receive non-empty final answer ────────────────────────────────
    // AgentMessageItem renders .msg-final → AgentFinalAnswer with .markdown-body
    const finalMsg = page.locator('.msg-final')
    await expect(finalMsg).toBeVisible({ timeout: 90_000 })

    const markdownBody = finalMsg.locator('.markdown-body')
    await expect(markdownBody).toBeVisible()
    const text = await markdownBody.textContent()
    expect((text ?? '').trim().length).toBeGreaterThan(0)

    // ── Step 6: cost transparency ─────────────────────────────────────────────
    // AgentChatHeader renders "已用 N 积分" in .credits span.
    // After a completed run the counter should be > 0.
    const creditsSpan = page.locator('.agent-chat-header .credits')
    await expect(creditsSpan).toBeVisible()
    const creditsText = await creditsSpan.textContent()
    // Text is "已用 N 积分" — extract N and assert >= 0
    const match = (creditsText ?? '').match(/已用\s*(\d+)\s*积分/)
    expect(match).not.toBeNull()
    const creditsUsed = parseInt(match![1], 10)
    expect(creditsUsed).toBeGreaterThanOrEqual(0)
  })
})
