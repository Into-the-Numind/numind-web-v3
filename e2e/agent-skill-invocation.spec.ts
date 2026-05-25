/**
 * agent-skill-invocation.spec.ts — Agent Mode v2 #2 (use_skill) happy-path e2e.
 *
 * **Status: skipped pending dev fixture.**
 *
 * This spec is delivered as part of T09 (S5 验证策略) but cannot run today
 * because:
 *   (a) The dev environment does not yet have a parent account with Skills
 *       configured via the v2 #1 admin flow (agent_skill + agent_skill_binding
 *       rows seeded).
 *   (b) The agent_skill_binding biz path is freshly merged (v2 #1) and the
 *       seed scripts to provision a "demo parent account with 2 bound Skills"
 *       are part of v2 #1 follow-up work.
 *
 * **To unskip when fixture is ready:**
 *   1. Remove `test.describe.skip(` → `test.describe(` (one-character change).
 *   2. Verify `E2E_USERNAME` env points at a parent account with ≥2 bound Skills.
 *   3. Adjust `EXPECTED_TRIGGER_TEXT` if the seeded Skill names differ.
 *
 * **Validation contract being asserted (when running):**
 *   - User sends an input that should trigger a Skill (e.g. "帮我整理客户画像").
 *   - Frontend sees an SSE narration event with tool_name === 'use_skill'.
 *   - The .skill-use bubble (T08 styling) renders.
 *   - Final assistant reply contains content from the Skill's BodyMd
 *     (proves the body was injected via tool result wrapper, S4-D27 path b).
 *
 * Refs:
 *   - plan T09 #1
 *   - spec §3.3 (Skill body injection path b: tool result with system-reminder)
 */

import { test, expect } from '@playwright/test'

// CHANGE TO test.describe(...) WHEN FIXTURE IS READY (see file header).
test.describe.skip('Agent Skill Invocation (v2 #2 use_skill happy path)', () => {
  // The seeded demo parent account is expected to have an Agent loaded with
  // at least two Skills, including one named "客户画像" with a body containing
  // the marker phrase below — adjust both when wiring up the dev fixture.
  const EXPECTED_SKILL_NAME = '客户画像'
  const EXPECTED_TRIGGER_TEXT = '帮我整理客户画像'
  // Sentinel string lifted from the Skill's BodyMd. When the LLM consumes the
  // tool-result ack and follows the body's guidance, it should echo terminology
  // unique to that Skill into its final answer.
  const EXPECTED_SKILL_BODY_MARKER = '客户画像'

  test('use_skill 调用产生 narration event + 触发 .skill-use 气泡', async ({ page }) => {
    await page.goto('/agent')
    await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 10_000 })

    // Pick the first agent — fixture seeds Skills onto agent[0].
    await page.getByRole('button', { name: '开始使用' }).first().click()
    await page.waitForURL(/\/agent\/chat\//, { timeout: 10_000 })

    // Type the trigger and send.
    const input = page.locator('textarea, [contenteditable="true"]').first()
    await input.fill(EXPECTED_TRIGGER_TEXT)
    await page.keyboard.press('Enter')

    // Wait for SSE narration to surface — .skill-use class is added by T08
    // when ToolCallAggregate.tool_name === 'use_skill'.
    await expect(page.locator('.tool-call-item.skill-use').first()).toBeVisible({
      timeout: 30_000
    })

    // Tool bubble should mention the Skill name (rendered from event.message
    // which comes from backend tool-display.yaml use_skill use_template).
    await expect(
      page.locator('.tool-call-item.skill-use').filter({ hasText: EXPECTED_SKILL_NAME })
    ).toBeVisible()

    // Final answer should echo content from the Skill body (proves the
    // tool-result wrapper actually fed the body to the LLM — S4-D27 path b).
    const finalAnswer = page.locator('.msg-final')
    await expect(finalAnswer).toBeVisible({ timeout: 60_000 })
    await expect(finalAnswer).toContainText(EXPECTED_SKILL_BODY_MARKER)
  })

  test('error: 不存在的 Skill 名 → narration error state + 友好降级', async ({ page }) => {
    // This needs a deterministic trigger; for now the test stays skipped and
    // serves as a placeholder. When the fixture lands, modify the dev mock to
    // inject a tool-call with name="不存在的技能" and assert error rendering.
    await page.goto('/agent')
    await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 10_000 })
    // ... rest TBD with fixture.
  })
})
