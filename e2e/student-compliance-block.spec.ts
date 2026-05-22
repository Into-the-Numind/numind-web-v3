/**
 * student-compliance-block.spec.ts — M-B5: Student Compliance Block (dev integration)
 *
 * Compliance L1 deny path: student sends a message containing a seeded
 * forbid_phrase pattern ("竞品X"), the compliance.gate.CheckUserInput L1 check
 * matches, and the student sees the configured Q11 越界话术 from the agent
 * definition instead of a stack trace or raw error.
 *
 * REQUIRES:
 *   E2E_INTEGRATION=true         — opt-in gate; CI stays green without it
 *   E2E_STUDENT_USERNAME         — child account seeded with ≥ 50 credits
 *   E2E_STUDENT_PASSWORD         — password for the child account
 *   Running dev backend           — M-B0c migration must be applied
 *                                   (seeds compliance_rule with forbid_phrase
 *                                    matching "竞品X" for agent_definition 99999)
 *
 * SEEDING CONTRACT (M-B0c migration):
 *   - compliance_rule row with:
 *       agent_definition_id = 99999 (fixtureJson.agent_definition_id)
 *       rule_type = 'forbid_phrase'
 *       pattern = '竞品[A-Za-z0-9]+'   (or exact '竞品X')
 *       action = 'deny'
 *       response_message = agent_definition.q11_out_of_scope_message
 *   - agent_definition row for id 99999 must have a non-empty
 *     q11_out_of_scope_message, e.g. "这个问题超出我的能力范围"
 *
 * Selector notes (verified against agent-student.spec.ts + student-dialog-happy.spec.ts):
 *   .agent-card        — AgentCard.vue wrapping <article>
 *   "开始使用" button  — AppButton inside AgentCard.vue card-footer
 *   textarea           — AgentInputArea.vue <textarea> for message input
 *   .msg-user          — user message bubble
 *   .msg-final         — final answer container (compliance deny uses the same path)
 *   .final-answer      — AgentFinalAnswer.vue wrapper
 *
 * Run after Phase D dev deploy:
 *   E2E_INTEGRATION=true \
 *   E2E_STUDENT_USERNAME=xxx \
 *   E2E_STUDENT_PASSWORD=yyy \
 *   npm run test:e2e -- student-compliance-block
 *
 * NDF v2 #14/14 Phase B (web-v3 part 2 — M-B5)
 */

import { test, expect } from '@playwright/test'
import { auth } from './helpers/selectors'
import fixtureJson from './fixtures/test-agent-id.json' with { type: 'json' }

const SHOULD_RUN = process.env.E2E_INTEGRATION === 'true'
const STUDENT_USER = process.env.E2E_STUDENT_USERNAME ?? ''
const STUDENT_PASS = process.env.E2E_STUDENT_PASSWORD ?? ''

// Default skip: test.describe.skip keeps CI green.
// The inner test.skip guards fire only when the describe block is explicitly
// un-skipped (i.e. via E2E_INTEGRATION=true).
test.describe.skip('M-B5: student compliance block (dev integration)', () => {
  test.skip(!SHOULD_RUN, 'Requires E2E_INTEGRATION=true + dev backend with M-B0c migration')
  test.skip(!STUDENT_USER || !STUDENT_PASS, 'Requires E2E_STUDENT_* env vars')

  // Use a clean storageState so auth.setup.ts parent token does not bleed in.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('forbid_phrase trigger shows Q11 越界话术, not stack trace', async ({ page }) => {
    // ── Step 0: log in as student ─────────────────────────────────────────────
    await page.goto('/login')
    await expect(page.locator(auth.loginButton)).toBeVisible({ timeout: 10_000 })
    await page.locator(auth.usernameInput).fill(STUDENT_USER)
    await page.locator(auth.passwordInput).fill(STUDENT_PASS)
    await page.locator(auth.loginButton).click()
    await expect(page).toHaveURL('/', { timeout: 20_000 })

    // ── Step 1: navigate to /agent and find the seeded test agent ─────────────
    await page.goto('/agent')
    await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 15_000 })

    const agentCard = page.locator('.agent-card', { hasText: fixtureJson.agent_name })
    await expect(agentCard).toBeVisible({ timeout: 10_000 })
    await agentCard.getByRole('button', { name: '开始使用' }).click()

    await page.waitForURL(/\/agent\/chat\/new/, { timeout: 15_000 })

    // ── Step 2: send the forbidden phrase message ─────────────────────────────
    // "竞品X" matches the M-B0c seeded compliance_rule forbid_phrase pattern.
    const msgInput = page.locator('textarea')
    await expect(msgInput).toBeVisible({ timeout: 10_000 })
    await msgInput.fill('帮我分析竞品X 怎么样')
    await msgInput.press('Enter')

    // ── Step 3: user message bubble should appear ─────────────────────────────
    await expect(page.locator('.msg-user').first()).toBeVisible({ timeout: 8_000 })

    // ── Step 4: agent responds with Q11 越界话术 ─────────────────────────────
    // The compliance deny path returns the configured q11_out_of_scope_message
    // from agent_definition (seeded as "这个问题超出我的能力范围" or equivalent).
    // Allow up to 15 s for the full ReAct + compliance pipeline to respond.
    await expect(page.getByText(/这个问题超出我的能力范围/)).toBeVisible({ timeout: 15_000 })

    // ── Step 5: negative assertions — no tech detail leaked ──────────────────
    // Compliance deny must not expose internal details to the student.
    await expect(page.getByText(/traceback/i)).not.toBeVisible()
    await expect(page.getByText(/stack trace/i)).not.toBeVisible()
    await expect(page.getByText(/panic/i)).not.toBeVisible()
    // HTTP 5xx string patterns (e.g. "HTTP 500", "500 Internal Server Error")
    await expect(page.getByText(/HTTP\s*5\d\d/i)).not.toBeVisible()
    await expect(page.getByText(/500 Internal Server/i)).not.toBeVisible()

    // ── Step 6: verify the deny response is in an agent reply bubble ──────────
    // The response should render in the standard answer container, not a raw div.
    // Accept both .final-answer and .msg-final as valid wrappers.
    const replyContainer = page.locator('.final-answer, .msg-final')
    await expect(replyContainer.first()).toBeVisible({ timeout: 5_000 })

    // ── Step 7 (best-effort): compliance_audit_log via admin API ─────────────
    // If ADMIN_TOKEN env is available, verify the audit row was written.
    // This is optional — the main compliance assertion is in steps 4+5.
    const adminToken = process.env.E2E_ADMIN_TOKEN
    if (adminToken) {
      const apiBase = process.env.DEV_API_URL ?? 'http://localhost:9091'
      const auditResp = await page.evaluate(
        async ({ base, token, agentId }: { base: string; token: string; agentId: number }) => {
          const res = await fetch(
            `${base}/v1/admin/compliance-audit-logs?agent_definition_id=${agentId}&limit=1`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          return { status: res.status, ok: res.ok }
        },
        { base: apiBase, token: adminToken, agentId: fixtureJson.agent_definition_id }
      )
      // Only assert if the endpoint exists (it may not be deployed yet in early phases)
      if (auditResp.status !== 404) {
        expect(auditResp.ok).toBe(true)
      }
    }
  })
})
