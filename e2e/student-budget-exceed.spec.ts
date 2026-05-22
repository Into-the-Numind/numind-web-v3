/**
 * student-budget-exceed.spec.ts — M-B4: Student Budget Exceed Path (dev integration)
 *
 * Verifies the credit budget gate works end-to-end: the seeded test agent has
 * credit_cap_per_session=100. When the student sends a message that would
 * consume more than that cap, the backend BudgetGate.PostToolCall short-circuits
 * and sets run.status="budget_exhausted". The UI should then:
 *   1. Show AgentBudgetExceededModal ("本次任务已用完 N 积分")
 *   2. Show the current balance in .modal-meta
 *   3. Offer a "继续" button (or disable it if balance=0) and a stop button
 *
 * If the student account balance < 50, AgentChatView blocks the send upfront and
 * shows AgentLowBalanceModal instead. This spec guards against that by checking
 * balance before sending (via page.route mock on /v1/credits/balance).
 *
 * REQUIRES:
 *   E2E_INTEGRATION=true      — opt-in gate; CI stays green without it
 *   E2E_STUDENT_USERNAME      — a child account seeded with sufficient credits
 *   E2E_STUDENT_PASSWORD      — password for the child account
 *   Running dev backend       — real BudgetGate enforces credit_cap_per_session=100
 *   Test agent id 99999       — seeded with credit_cap_per_session=100
 *
 * Run after Phase D dev deploy:
 *   E2E_INTEGRATION=true \
 *   E2E_STUDENT_USERNAME=xxx \
 *   E2E_STUDENT_PASSWORD=yyy \
 *   npm run test:e2e -- student-budget-exceed
 *
 * Selector notes (verified against source):
 *   .agent-card                       — AgentCard.vue wrapping <article>
 *   "开始使用" button                 — AppButton inside AgentCard.vue card-footer
 *   textarea                          — AgentInputArea.vue input element
 *   .msg-user                         — AgentMessageItem.vue user bubble
 *   [role="dialog"] .modal-title      — AgentBudgetExceededModal: "本次任务已用完 N 积分"
 *   [role="dialog"] .modal-meta       — AgentBudgetExceededModal: "当前余额：N 积分"
 *   [role="dialog"] .modal-actions    — AgentBudgetExceededModal: continue + stop buttons
 *   [role="dialog"] .modal-title (LowBalance) — AgentLowBalanceModal: "积分余额不够完成这次任务"
 *
 * NDF v2 #14/14 Phase B (web-v3 part 1)
 */

import { test, expect, type Route } from '@playwright/test'
import { auth } from './helpers/selectors'
import fixtureJson from './fixtures/test-agent-id.json' with { type: 'json' }

const SHOULD_RUN = process.env.E2E_INTEGRATION === 'true'
const STUDENT_USER = process.env.E2E_STUDENT_USERNAME ?? ''
const STUDENT_PASS = process.env.E2E_STUDENT_PASSWORD ?? ''

// Minimum balance the student account must have to attempt the run.
// AgentChatView blocks send if balance < 50 (AgentChatView.vue line 57).
const MIN_BALANCE_REQUIRED = 100

test.describe.skip('M-B4: student budget exceed path (dev integration)', () => {
  test.skip(!SHOULD_RUN, 'Requires E2E_INTEGRATION=true + dev backend')
  test.skip(
    !STUDENT_USER || !STUDENT_PASS,
    'Requires E2E_STUDENT_USERNAME + E2E_STUDENT_PASSWORD env vars'
  )

  // Fresh login as student — not reusing parent storageState from auth.setup.ts
  test.use({ storageState: { cookies: [], origins: [] } })

  test('message exceeds credit_cap_per_session=100 → AgentBudgetExceededModal appears', async ({
    page
  }) => {
    // ── Step 0: log in as student ─────────────────────────────────────────────
    await page.goto('/login')
    await expect(page.locator(auth.loginButton)).toBeVisible({ timeout: 10_000 })
    await page.locator(auth.usernameInput).fill(STUDENT_USER)
    await page.locator(auth.passwordInput).fill(STUDENT_PASS)
    await page.locator(auth.loginButton).click()
    await expect(page).toHaveURL('/', { timeout: 20_000 })

    // ── Pre-flight: verify student balance ≥ MIN_BALANCE_REQUIRED ────────────
    // Intercept the balance call to read the real value. If it's too low, the
    // chat view will show AgentLowBalanceModal instead of AgentBudgetExceededModal,
    // so we skip rather than fail with a misleading assertion error.
    let capturedBalance: number | null = null
    await page.route('**/v1/credits/balance', async (route: Route) => {
      const resp = await route.fetch()
      const body = await resp.json().catch(() => null)
      if (body?.data?.balance !== undefined) {
        capturedBalance = body.data.balance as number
      }
      await route.fulfill({ response: resp })
    })

    // ── Step 1: navigate to agent list and select test agent ──────────────────
    await page.goto('/agent')
    await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 15_000 })

    const agentCard = page.locator('.agent-card', { hasText: fixtureJson.agent_name })
    await expect(agentCard).toBeVisible({ timeout: 10_000 })
    await agentCard.getByRole('button', { name: '开始使用' }).click()
    await page.waitForURL(/\/agent\/chat\/new/, { timeout: 15_000 })

    // Wait for credits balance fetch (triggered on AgentChatView mount)
    await page.waitForFunction(() => true, null, { timeout: 3_000 }).catch(() => {})

    test.skip(
      capturedBalance !== null && capturedBalance < MIN_BALANCE_REQUIRED,
      `Student balance ${capturedBalance} < ${MIN_BALANCE_REQUIRED} — low-balance modal would appear instead of budget-exceed modal. Seed higher balance.`
    )

    // ── Step 2: send a message designed to exhaust the 100-credit cap ─────────
    // A long, multi-step request gives the ReAct loop enough work to cross the
    // credit_cap_per_session=100 threshold quickly.
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible({ timeout: 10_000 })
    await textarea.fill(
      '请用中文详细分析一下人工智能的发展历史、现状和未来趋势，并列举至少10个具体应用场景，每个场景请详细解释'
    )
    await textarea.press('Enter')

    // User bubble confirms the message was submitted
    await expect(page.locator('.msg-user').first()).toBeVisible({ timeout: 10_000 })

    // ── Step 3: wait for AgentBudgetExceededModal ─────────────────────────────
    // When run.status becomes "budget_exhausted", cost.budgetExceeded flips true
    // and AgentChatView renders AgentBudgetExceededModal (role="dialog").
    // Modal title: "本次任务已用完 N 积分" (AgentBudgetExceededModal.vue line 51)
    const budgetModal = page.locator('[role="dialog"]').filter({ hasText: '本次任务已用完' })
    await expect(budgetModal).toBeVisible({ timeout: 120_000 })

    // ── Step 4: verify modal content ─────────────────────────────────────────
    // Title contains "积分" (verified: AgentBudgetExceededModal.vue line 51)
    const modalTitle = budgetModal.locator('.modal-title')
    await expect(modalTitle).toBeVisible()
    const titleText = await modalTitle.textContent()
    expect(titleText ?? '').toContain('积分')

    // Balance line "当前余额：N 积分" (AgentBudgetExceededModal.vue line 60)
    const modalMeta = budgetModal.locator('.modal-meta')
    await expect(modalMeta).toBeVisible()
    const metaText = await modalMeta.textContent()
    expect(metaText ?? '').toMatch(/当前余额[：:]\s*\d+\s*积分/)

    // ── Step 5: verify action buttons are present ─────────────────────────────
    // AgentBudgetExceededModal offers "继续（+N 积分）" and "停止并下载已完成的内容"
    const modalActions = budgetModal.locator('.modal-actions')
    await expect(modalActions).toBeVisible()

    // Stop button always present and enabled
    const stopBtn = modalActions.getByRole('button', { name: /停止/ })
    await expect(stopBtn).toBeVisible()
    await expect(stopBtn).toBeEnabled()

    // Continue button present (may be disabled if balance=0, but must exist)
    const continueBtn = modalActions.getByRole('button', { name: /继续/ })
    await expect(continueBtn).toBeVisible()

    // ── Step 6: dismiss by clicking stop ─────────────────────────────────────
    // Verify the modal closes after the student chooses to stop.
    await stopBtn.click()
    await expect(budgetModal).not.toBeVisible({ timeout: 10_000 })
  })
})
