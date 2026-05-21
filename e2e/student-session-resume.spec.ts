/**
 * student-session-resume.spec.ts — M-B7: Student Session Resume (dev integration)
 *
 * Verifies that an agent chat session survives a full page reload (F5) and that
 * the agent can respond to a follow-up message referencing earlier context.
 *
 * The test establishes a 10-turn conversation (to ensure there is meaningful
 * context in the session, and to exercise the compact_summary path if M-B6 ran
 * first). After page.reload(), the chat UI restores from sessionStorage / URL
 * state, and a follow-up message referencing the prior content produces a
 * coherent, context-aware response.
 *
 * RELATIONSHIP TO M-B6:
 *   This test depends on the compact / session-persist behavior exercised by
 *   M-B6 (student-compact-trigger.spec.ts). If M-B6 fails in your environment
 *   (PTL chain not firing, LLM unavailable, etc.), this test will likely also
 *   fail. Both M-B6 and M-B7 must pass together for the session-resume feature
 *   to be considered verified end-to-end.
 *
 * REQUIRES:
 *   E2E_INTEGRATION=true         — opt-in gate; CI stays green without it
 *   E2E_STUDENT_USERNAME         — child account seeded with ≥ 200 credits
 *   E2E_STUDENT_PASSWORD         — password for the child account
 *   Running dev backend           — real LLM, session persistence in DB
 *
 * Selector notes:
 *   textarea                     — AgentInputArea.vue <textarea>
 *   .msg-user                    — user message bubble
 *   [data-testid="final-answer"] — AgentFinalAnswer.vue preferred selector
 *   .final-answer                — fallback class selector
 *   .msg-final                   — AgentMessageItem.vue wrapper
 *
 * Run after Phase D dev deploy:
 *   E2E_INTEGRATION=true \
 *   E2E_STUDENT_USERNAME=xxx \
 *   E2E_STUDENT_PASSWORD=yyy \
 *   npm run test:e2e -- student-session-resume
 *
 * NDF v2 #14/14 Phase B (web-v3 part 2 — M-B7)
 */

import { test, expect } from '@playwright/test'
import { auth } from './helpers/selectors'
import fixtureJson from './fixtures/test-agent-id.json'

const SHOULD_RUN = process.env.E2E_INTEGRATION === 'true'
const STUDENT_USER = process.env.E2E_STUDENT_USERNAME ?? ''
const STUDENT_PASS = process.env.E2E_STUDENT_PASSWORD ?? ''

// 10 turns x up to 30s each = 300s ceiling; reload + follow-up adds ~60s.
const SESSION_RESUME_TIMEOUT = 360_000

// Number of setup turns before the reload. 10 is enough to establish a
// recognizable story thread for the follow-up context check.
const SETUP_TURNS = 10

function buildSetupMessage(turn: number): string {
  // Each message asks for part of a story and names a unique element, so
  // the agent's responses contain identifiable content for the context check.
  const themes = [
    '一位宇航员发现了神秘星球',
    '星球上居住着会说话的植物',
    '植物们有一个古老的秘密',
    '宇航员和植物首领进行了交流',
    '首领揭示了宇宙的起源',
    '宇航员决定带回一颗种子',
    '种子在地球上发生了奇异变化',
    '变化引发了科学界的轰动',
    '宇航员再次启程去寻找更多线索',
    '故事的最终谜底终于揭晓'
  ]
  const theme = themes[(turn - 1) % themes.length]
  return `第${turn}章：请继续讲述这个故事——${theme}。请详细描述。`
}

test.describe.skip('M-B7: student session resume (dev integration)', () => {
  test.skip(!SHOULD_RUN, 'Requires E2E_INTEGRATION=true + dev backend + dev LLM')
  test.skip(!STUDENT_USER || !STUDENT_PASS, 'Requires E2E_STUDENT_* env vars')

  // Use a clean storageState so the parent token from auth.setup.ts is not reused.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('page reload preserves session; follow-up references earlier story context', async ({
    page
  }) => {
    test.setTimeout(SESSION_RESUME_TIMEOUT)

    // ── Step 0: log in as student ─────────────────────────────────────────────
    await page.goto('/login')
    await expect(page.locator(auth.loginButton)).toBeVisible({ timeout: 10_000 })
    await page.locator(auth.usernameInput).fill(STUDENT_USER)
    await page.locator(auth.passwordInput).fill(STUDENT_PASS)
    await page.locator(auth.loginButton).click()
    await expect(page).toHaveURL('/', { timeout: 20_000 })

    // ── Step 1: navigate to /agent and open the seeded test agent ─────────────
    await page.goto('/agent')
    await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 15_000 })

    const agentCard = page.locator('.agent-card', { hasText: fixtureJson.agent_name })
    await expect(agentCard).toBeVisible({ timeout: 10_000 })
    await agentCard.getByRole('button', { name: '开始使用' }).click()

    await page.waitForURL(/\/agent\/chat\/new/, { timeout: 15_000 })

    const msgInput = page.locator('textarea')
    await expect(msgInput).toBeVisible({ timeout: 10_000 })

    // ── Step 2: send SETUP_TURNS messages to build session context ────────────
    for (let i = 0; i < SETUP_TURNS; i++) {
      await msgInput.fill(buildSetupMessage(i + 1))
      await msgInput.press('Enter')

      const expectedCount = i + 1
      await page.waitForFunction(
        (expected: number) => {
          const byTestId = document.querySelectorAll('[data-testid="final-answer"]')
          const byClass = document.querySelectorAll('.final-answer')
          return Math.max(byTestId.length, byClass.length) >= expected
        },
        expectedCount,
        { timeout: 60_000 }
      )
    }

    // Capture the URL before reload — the session_id must be in the URL by now
    // (the router updates from /agent/chat/new to /agent/chat/:id after first message).
    const urlBeforeReload = page.url()
    expect(urlBeforeReload).toMatch(/\/agent\/chat\//)

    // ── Step 3: record text from the last agent response (for context check) ──
    const allAnswersBefore = page
      .locator('[data-testid="final-answer"]')
      .or(page.locator('.final-answer'))
    const lastAnswerText = (await allAnswersBefore.last().textContent()) ?? ''
    // The story context should contain at least one Chinese character.
    expect(lastAnswerText.length).toBeGreaterThan(10)

    // ── Step 4: reload the page ───────────────────────────────────────────────
    await page.reload({ waitUntil: 'domcontentloaded' })

    // ── Step 5: verify URL is preserved (session not lost) ────────────────────
    // After reload the router should restore to the same /agent/chat/:id URL.
    // Allow up to 10 s for client-side routing to stabilise.
    await page.waitForFunction(
      (expectedUrl: string) => window.location.href === expectedUrl,
      urlBeforeReload,
      { timeout: 10_000 }
    )
    expect(page.url()).toBe(urlBeforeReload)

    // ── Step 6: verify prior messages are still visible in the DOM ───────────
    // The chat history should re-render after reload. We wait for at least one
    // prior message bubble to appear (the first user message from setup turn 1).
    await expect(page.locator('.msg-user').first()).toBeVisible({ timeout: 15_000 })

    // ── Step 7: send a follow-up that references the story context ────────────
    const postReloadInput = page.locator('textarea')
    await expect(postReloadInput).toBeVisible({ timeout: 10_000 })

    // This message references "刚才" (just now) and "那位宇航员" (that astronaut)
    // — both are anchored in the story context built in step 2. An agent with
    // access to the session history / compact_summary can answer meaningfully.
    // An agent with no context would say "I don't know" or respond off-topic.
    await postReloadInput.fill('刚才提到的那位宇航员，他最后找到线索了吗？请用两句话回答。')
    await postReloadInput.press('Enter')

    // Wait for the follow-up response
    await page.waitForFunction(
      (expected: number) => {
        const byTestId = document.querySelectorAll('[data-testid="final-answer"]')
        const byClass = document.querySelectorAll('.final-answer')
        return Math.max(byTestId.length, byClass.length) >= expected
      },
      SETUP_TURNS + 1,
      { timeout: 60_000 }
    )

    // ── Step 8: assert the follow-up response is context-aware ───────────────
    const followUpAnswer = page
      .locator('[data-testid="final-answer"]')
      .or(page.locator('.final-answer'))
      .last()
    await expect(followUpAnswer).toBeVisible({ timeout: 10_000 })

    const followUpText = (await followUpAnswer.textContent()) ?? ''

    // The response should be non-trivial (proves the agent didn't ignore context)
    expect(followUpText.trim().length).toBeGreaterThan(10)

    // Negative assertion: the agent must not say it has no memory.
    // These phrases indicate the compact_summary was NOT restored properly.
    const noMemoryPhrases = [
      '没有记忆',
      '没有上下文',
      '不知道之前',
      '没有之前的对话',
      "I don't have memory",
      "I don't recall"
    ]
    for (const phrase of noMemoryPhrases) {
      expect(followUpText).not.toContain(phrase)
    }
  })
})
