# QA Report Template — Agent Mode v2 #2 (use_skill)

> **Status: template only — fill in during S5 (本地验收).**
>
> Live at: `e2e/qa-report-draft.md` (numind-web-v3 worktree)
> Final report should be reproduced at `numind-server/.ndf/decisions/agent-mode-v2-skill-invocation/0007-s5-qa-report.md`
> with screenshots in `numind-server/.ndf/decisions/agent-mode-v2-skill-invocation/qa-screenshots/`.

---

## Section 1 — Automated tests (machine-verifiable)

| # | Test                                                                       | Type           | Cmd / Path                                                                                              | Result |
|---|----------------------------------------------------------------------------|----------------|---------------------------------------------------------------------------------------------------------|--------|
| 3 | `tool_use_skill_test.go` (T03 unit tests)                                  | Go unit        | `go test ./internal/numind/biz/agent/ -run TestUseSkill -count=1`                                       |        |
| 4 | `use_skill_turnscope_test.go` (T05 validator)                              | Go unit        | `go test ./internal/numind/biz/permission/validators/ -run TestUseSkillTurnScope -count=1`              |        |
| 5 | `runner_test.go` 6-segment invariant + dual-read (T06)                     | Go unit        | `go test ./internal/numind/biz/agent/ -run 'TestRunner_(SystemPrompt_6Segment\|DualRead)' -count=1`     |        |
| 6 | `eino_skill_integration_test.go` (T09)                                     | Go integration | `go test ./internal/numind/biz/permission/validators/ -run TestEinoSkillIntegration -count=1`           |        |
| 9 | `budget_skill_test.go` (T09 AC-6)                                          | Go unit        | `go test ./internal/numind/biz/agent/budgetgate/ -run TestBudget_UseSkill -count=1`                     |        |
| 8a | `AgentToolCallItem.spec.ts` (T08 frontend use_skill case)                 | Vitest         | `npx vitest run src/components/agent/__tests__/AgentToolCallItem.spec.ts`                               |        |

**Verification command (one-shot full backend):**
```bash
cd /private/tmp/wt-agent-mode-v2-skill-invocation-numind-server
go test ./internal/numind/biz/agent/... \
        ./internal/numind/biz/permission/validators/... -count=1
```

---

## Section 2 — Manual verification (项 7: Langfuse trace 截图)

**Goal:** Prove the use_skill end-to-end Langfuse trace shows the correct
span structure and that the Skill body actually flows into the next
generation's input.

**Setup:**
1. Spin up a dev Agent with ≥1 bound Skill (e.g. "客户画像").
2. Log in as `$E2E_USERNAME` (parent account with B2B membership).
3. Open Langfuse UI for the dev env (`http://49.233.219.254:3000` or equivalent).

**Steps to capture screenshots:**

| # | Action                                                                                                 | Screenshot file                          | Expected observation                                                                          |
|---|--------------------------------------------------------------------------------------------------------|------------------------------------------|------------------------------------------------------------------------------------------------|
| 1 | Start agent run with prompt "帮我整理客户画像"                                                          | `qa-screenshots/01-langfuse-trace-root.png` | Root trace name = `agent.run`; user-id = parent account; tags include `agent-mode-v2`         |
| 2 | Click the first `tool.use_skill` span                                                                  | `qa-screenshots/02-langfuse-span-use_skill.png` | Span input shows `skill_name` + `turn_invocation_pre` + `turn_cap`; output shows `status=loaded` + `skill_id` + `body_token_count` |
| 3 | Find the NEXT generation after `tool.use_skill` (the LLM ReAct continuation)                          | `qa-screenshots/03-langfuse-next-gen-input.png` | Input messages contain a tool-result entry whose body STARTS WITH `<system-reminder>` and contains the verbatim Skill BodyMd (S4-D27 contract) |
| 4 | Confirm the final assistant message references content from the Skill (e.g. "客户画像" terminology)    | `qa-screenshots/04-final-answer-uses-skill.png` | LLM's final answer demonstrably uses information from the Skill body (not just the catalog blurb) |

**Pass criteria:** all 4 screenshots present + the observation column matches.

**Failure mode:** if screenshot 3 shows the tool result without
`<system-reminder>` wrapper or without the BodyMd, **STOP** — that means S4-D27
regressed and the LLM is not actually receiving the Skill content.

---

## Section 3 — Manual verification (项 8: AC-11 调用率)

**Goal:** Confirm the AC-11 invocation rate (≥30% on positive scenarios)
holds on dev with the production LLM (deepseek-v3-2 or whatever Volc routes
to in dev).

**Setup:** as Section 2.

**Procedure:** run each of the 10 scenarios from
`e2e/skill-invocation-rate.spec.ts:SCENARIOS` manually. For each:
1. Open a fresh chat (no prior context).
2. Send the trigger text exactly.
3. Observe whether a `.tool-call-item.skill-use` bubble appears within 30s.
4. Record below.

| # | Scenario           | Trigger                                | Expected Skill | use_skill emitted? | Notes |
|---|--------------------|----------------------------------------|----------------|--------------------|-------|
| 1 | 客户画像-1         | 帮我整理一下这个客户的画像             | 客户画像       |                    |       |
| 2 | 客户画像-2         | 我准备见王总，给我一份他的资料概览     | 客户画像       |                    |       |
| 3 | 客户画像-3         | 查一下张三在 LinkedIn 上的公开信息     | 客户画像       |                    |       |
| 4 | 销售话术-1         | 客户犹豫不决，我该怎么说服他?          | 销售话术训练   |                    |       |
| 5 | 销售话术-2         | 帮我演练一下处理价格异议               | 销售话术训练   |                    |       |
| 6 | 销售话术-3         | 客户说我们贵 20%，给我一段话术          | 销售话术训练   |                    |       |
| 7 | 复盘-1             | 昨天那个单子丢了,帮我分析原因          | 失败复盘       |                    |       |
| 8 | 复盘-2             | 为什么客户最后选了竞品?                | 失败复盘       |                    |       |
| 9 | 一般问题-1 (陷阱)  | 今天天气怎么样                         | __none__       | (expected: NO)     |       |
| 10| 一般问题-2 (陷阱)  | 帮我列个待办清单                       | __none__       | (expected: NO)     |       |

**Compute:**
- Positive triggered count = (count of rows 1-8 with emitted=YES) =
- Positive rate = (positive triggered) / 8 =
- Trap false-positive count = (count of rows 9-10 with emitted=YES) =

**Pass criteria:**
- Positive rate ≥ 30% (AC-11 floor)
- Trap false-positive ≤ 1 (LLM hasn't over-fitted to invoking on everything)

**If fail:** record in retro, investigate Skill `when_to_use` text (likely
too narrow or too vague). This is a tuning issue, NOT a code bug — feedback
to the Skill author rather than blocking the feature.

---

## Section 4 — Playwright E2E (项 1 + 项 8)

Currently **SKIPPED** in source — see file headers of:
- `e2e/agent-skill-invocation.spec.ts` (项 1, happy path)
- `e2e/skill-invocation-rate.spec.ts` (项 8, rate measurement)

**Reason skipped:** dev fixture for "parent account with bound Skills" not yet
seeded. Spec text is committed and ready to `test.describe.skip(` →
`test.describe(` flip once seeds land (estimated v2 #1 follow-up sprint).

**When unskipped, run:**
```bash
cd /private/tmp/wt-agent-mode-v2-skill-invocation-numind-web-v3
E2E_USERNAME=$E2E_USERNAME E2E_PASSWORD=$E2E_PASSWORD \
  npx playwright test e2e/agent-skill-invocation.spec.ts e2e/skill-invocation-rate.spec.ts
```

---

## Section 5 — Final S5 Sign-off Checklist

- [ ] All Section 1 automated tests PASS
- [ ] Section 2 (Langfuse trace) — 4 screenshots present and observation rows OK
- [ ] Section 3 (AC-11 rate) — positive rate ≥ 30%, trap ≤ 1
- [ ] Section 4 (Playwright) — spec files committed (skipped OK for v2 #2; unskip is v2 #1 follow-up)
- [ ] No P0/P1 issues found
- [ ] `progress.completed_tasks == progress.reviewed_tasks` in manifest

If all checked → S5 PASS → proceed to S6 (`ndf-done` + dev deploy).
