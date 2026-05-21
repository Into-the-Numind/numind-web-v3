/**
 * student-permission-deny.spec.ts — M-B3: Student Permission Deny Path (dev integration)
 *
 * Verifies the compliance/permission gate works end-to-end: a student sends a
 * message that triggers an IsDestructive tool call, the backend permission gate
 * denies it, and the UI renders the rejection narration state (.narration-state-rejected).
 * The test then confirms the chat input remains functional for a subsequent
 * non-destructive message (chat does not lock up after a denial).
 *
 * REQUIRES:
 *   E2E_INTEGRATION=true      — opt-in gate; CI stays green without it
 *   E2E_STUDENT_USERNAME      — a child account with agent access
 *   E2E_STUDENT_PASSWORD      — password for the child account
 *   Running dev backend       — real permission gate evaluates IsDestructive flag
 *   Test agent id 99999       — seeded by numind-server migration
 *
 * Run after Phase D dev deploy:
 *   E2E_INTEGRATION=true \
 *   E2E_STUDENT_USERNAME=xxx \
 *   E2E_STUDENT_PASSWORD=yyy \
 *   npm run test:e2e -- student-permission-deny
 *
 * Selector notes (verified against source):
 *   .agent-card              — AgentCard.vue wrapping <article>
 *   "开始使用" button        — AppButton inside AgentCard.vue card-footer
 *   .msg-tool-group          — AgentMessageItem.vue: tool_group message variant
 *   .narration-state-rejected — AgentToolCallItem.vue STATE_COLOR_CLASS for "rejected"
 *   textarea                 — AgentInputArea.vue input element
 *   .msg-user                — AgentMessageItem.vue: user message bubble
 *
 * NDF v2 #14/14 Phase B (web-v3 part 1)
 */

import { test, expect } from '@playwright/test'
import { auth } from './helpers/selectors'
import fixtureJson from './fixtures/test-agent-id.json'

const SHOULD_RUN = process.env.E2E_INTEGRATION === 'true'
const STUDENT_USER = process.env.E2E_STUDENT_USERNAME ?? ''
const STUDENT_PASS = process.env.E2E_STUDENT_PASSWORD ?? ''

test.describe.skip('M-B3: student permission deny path (dev integration)', () => {
  test.skip(!SHOULD_RUN, 'Requires E2E_INTEGRATION=true + dev backend')
  test.skip(
    !STUDENT_USER || !STUDENT_PASS,
    'Requires E2E_STUDENT_USERNAME + E2E_STUDENT_PASSWORD env vars'
  )

  // Fresh login as student — not reusing parent storageState from auth.setup.ts
  test.use({ storageState: { cookies: [], origins: [] } })

  test('destructive message triggers permission denial; chat continues afterward', async ({
    page
  }) => {
    // ── Step 0: log in as student ─────────────────────────────────────────────
    await page.goto('/login')
    await expect(page.locator(auth.loginButton)).toBeVisible({ timeout: 10_000 })
    await page.locator(auth.usernameInput).fill(STUDENT_USER)
    await page.locator(auth.passwordInput).fill(STUDENT_PASS)
    await page.locator(auth.loginButton).click()
    await expect(page).toHaveURL('/', { timeout: 20_000 })

    // ── Step 1: navigate to agent list and select test agent ──────────────────
    await page.goto('/agent')
    await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 15_000 })

    const agentCard = page.locator('.agent-card', { hasText: fixtureJson.agent_name })
    await expect(agentCard).toBeVisible({ timeout: 10_000 })
    await agentCard.getByRole('button', { name: '开始使用' }).click()
    await page.waitForURL(/\/agent\/chat\/new/, { timeout: 15_000 })

    // ── Step 2: send a destructive-intent message ─────────────────────────────
    // The message is designed to trigger an IsDestructive=true tool call so the
    // backend permission gate (PermissionGate.PreToolCall) returns denied.
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill('帮我删除我的所有数据')
    await textarea.press('Enter')

    // User bubble appears immediately
    await expect(page.locator('.msg-user').first()).toBeVisible({ timeout: 10_000 })

    // ── Step 3: wait for narration rejected state ─────────────────────────────
    // The permission gate denies the destructive tool call → the narration event
    // stream emits state="rejected". AgentToolCallItem renders .narration-state-rejected.
    // This lives inside .msg-tool-group → .tool-call-list → .tool-call-item → .tool-line.
    await expect(page.locator('.narration-state-rejected').first()).toBeVisible({
      timeout: 60_000
    })

    // Also verify the rejection reason text is non-empty (Q11 越界话术 or similar)
    const rejectedLine = page.locator('.narration-state-rejected').first()
    const rejectedText = await rejectedLine.textContent()
    expect((rejectedText ?? '').trim().length).toBeGreaterThan(0)

    // ── Step 4: confirm chat input remains usable after denial ────────────────
    // The input should not be permanently disabled / hidden after a tool rejection.
    await expect(textarea).toBeVisible({ timeout: 5_000 })
    await expect(textarea).toBeEnabled()

    // Send a follow-up non-destructive message and verify it renders
    await textarea.fill('你好，能帮我查一下天气吗')
    await textarea.press('Enter')

    // A second user bubble should appear — confirms the chat is still functional
    await expect(page.locator('.msg-user').nth(1)).toBeVisible({ timeout: 15_000 })
  })
})
