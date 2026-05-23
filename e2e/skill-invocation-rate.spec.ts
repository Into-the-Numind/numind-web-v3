/**
 * skill-invocation-rate.spec.ts — Agent Mode v2 #2 AC-11: Skill invocation rate.
 *
 * **Status: spec scaffolded, scenarios filled, but skipped pending fixture.**
 *
 * AC-11 ("调用率") demands: among 10 representative student prompts that
 * SHOULD trigger a use_skill call (per the seeded Skill's when_to_use field),
 * the LLM actually emits a `use_skill` tool-call at least 30% of the time.
 *
 * The current spec captures the 10 scenarios as test data. When the dev
 * fixture lands (parent account with bound Skills + dev-stable LLM):
 *   1. Unskip `test.describe(...)`.
 *   2. The test runs each scenario, counts narration events with
 *      tool_name === 'use_skill', and asserts the ratio ≥ 0.3.
 *   3. Records per-scenario emit/no-emit into a JSON report committed by the
 *      qa-report flow (qa-report-draft.md).
 *
 * **Why a separate file from agent-skill-invocation.spec.ts?**
 *   That file tests the *happy path* (single trigger). This one tests the
 *   *acceptance rate* over a representative sample, which has different
 *   sensitivity (LLM nondeterminism — needs N runs + tolerance). Keeping
 *   them separate lets us schedule this one less often (weekly nightly)
 *   while keeping happy-path in the standard PR gate.
 *
 * Refs:
 *   - plan T09 #8
 *   - spec AC-11
 */

import { test, expect } from '@playwright/test'

interface SkillRateScenario {
  scenario: string
  trigger: string
  /** The Skill we expect the LLM to invoke (informational; rate is per-call agnostic) */
  expectedSkill: string
  /** Sentinel from when_to_use that should make the LLM pick this Skill */
  whenToUseHint: string
}

// 10 scenarios — designed against the seeded Skill set. Adjust trigger/hint
// when fixture ships actual Skill data. Each scenario is a prompt a real
// student might send; the prompt is crafted to match the Skill's when_to_use.
const SCENARIOS: SkillRateScenario[] = [
  {
    scenario: '客户画像-1',
    trigger: '帮我整理一下这个客户的画像',
    expectedSkill: '客户画像',
    whenToUseHint: '收集客户信息时使用'
  },
  {
    scenario: '客户画像-2',
    trigger: '我准备见王总，给我一份他的资料概览',
    expectedSkill: '客户画像',
    whenToUseHint: '会面前准备客户资料'
  },
  {
    scenario: '客户画像-3',
    trigger: '查一下张三在 LinkedIn 上的公开信息',
    expectedSkill: '客户画像',
    whenToUseHint: '搜集客户公开资料'
  },
  {
    scenario: '销售话术-1',
    trigger: '客户犹豫不决，我该怎么说服他?',
    expectedSkill: '销售话术训练',
    whenToUseHint: '客户犹豫时'
  },
  {
    scenario: '销售话术-2',
    trigger: '帮我演练一下处理价格异议',
    expectedSkill: '销售话术训练',
    whenToUseHint: '应对客户异议'
  },
  {
    scenario: '销售话术-3',
    trigger: '客户说我们贵 20%，给我一段话术',
    expectedSkill: '销售话术训练',
    whenToUseHint: '应对价格质疑'
  },
  {
    scenario: '复盘-1',
    trigger: '昨天那个单子丢了,帮我分析原因',
    expectedSkill: '失败复盘',
    whenToUseHint: '丢单后复盘'
  },
  {
    scenario: '复盘-2',
    trigger: '为什么客户最后选了竞品?',
    expectedSkill: '失败复盘',
    whenToUseHint: '丢单后复盘'
  },
  {
    scenario: '一般问题-1',
    trigger: '今天天气怎么样',
    expectedSkill: '__none__',
    whenToUseHint: '不应该触发 Skill（陷阱场景）'
  },
  {
    scenario: '一般问题-2',
    trigger: '帮我列个待办清单',
    expectedSkill: '__none__',
    whenToUseHint: '不应该触发 Skill（陷阱场景）'
  }
]

// Threshold: AC-11 requires ≥ 30% trigger rate on the 8 positive scenarios.
// 2 trap scenarios should NOT trigger (their absence raises false-positive
// confidence — see metrics calc below).
const MIN_TRIGGER_RATE = 0.3

// CHANGE TO test.describe(...) WHEN FIXTURE IS READY.
test.describe.skip('Agent Skill invocation rate (AC-11)', () => {
  test('10 representative prompts → ≥30% emit use_skill', async ({ page }) => {
    const results: Array<{ scenario: string; triggered: boolean }> = []

    for (const sc of SCENARIOS) {
      const emitted = await runScenarioAndCheckEmit(page, sc.trigger)
      results.push({ scenario: sc.scenario, triggered: emitted })
    }

    const positiveResults = results.filter((r, i) => SCENARIOS[i].expectedSkill !== '__none__')
    const triggeredCount = positiveResults.filter((r) => r.triggered).length
    const rate = triggeredCount / positiveResults.length

    // Surface the table to test output for the qa-report.
    console.log('=== AC-11 Skill invocation rate ===')
    console.table(results)
    console.log(`Positive scenarios: ${positiveResults.length}`)
    console.log(`Triggered: ${triggeredCount}`)
    console.log(`Rate: ${(rate * 100).toFixed(1)}%  (min ${MIN_TRIGGER_RATE * 100}%)`)

    expect(rate).toBeGreaterThanOrEqual(MIN_TRIGGER_RATE)

    // Sanity: trap scenarios shouldn't all fire (LLM hasn't gone crazy)
    const trapResults = results.filter((_r, i) => SCENARIOS[i].expectedSkill === '__none__')
    const trapTriggers = trapResults.filter((r) => r.triggered).length
    expect(trapTriggers).toBeLessThanOrEqual(1) // tolerate at most 1 false positive
  })
})

/**
 * Runs one scenario end-to-end against the live UI and returns true if a
 * narration event with tool_name === 'use_skill' was observed.
 *
 * Implementation: opens a fresh chat, sends the trigger, listens to the
 * narration SSE stream for up to 30s, checks for use_skill bubble.
 */
async function runScenarioAndCheckEmit(
  page: import('@playwright/test').Page,
  trigger: string
): Promise<boolean> {
  await page.goto('/agent')
  await page.getByRole('button', { name: '开始使用' }).first().click()
  await page.waitForURL(/\/agent\/chat\//)

  const input = page.locator('textarea, [contenteditable="true"]').first()
  await input.fill(trigger)
  await page.keyboard.press('Enter')

  // Wait up to 30s for either: a .skill-use bubble (success), or the run to
  // reach a terminal state without emitting (failure → emit=false).
  try {
    await page.locator('.tool-call-item.skill-use').first().waitFor({ timeout: 30_000 })
    return true
  } catch {
    return false
  }
}
