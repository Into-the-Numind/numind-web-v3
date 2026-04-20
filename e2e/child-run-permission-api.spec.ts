/**
 * child-run-permission-api.spec.ts — request-level API E2E for child run permission feature
 *
 * Spec: numind-server/docs/superpowers/specs/2026-04-20-child-run-permission-design.md
 * Plan: numind-server/docs/superpowers/plans/2026-04-20-child-run-permission-plan.md (Task 7 / S5)
 *
 * Status: SKIPPED — see rationale below.
 *
 * ── Why skipped ──
 * The two critical paths these tests cover (P0.5: sub-user direct API call with
 * unauthorized chatbot_id → 403; P0.6: ChatStream after revoke → 403) require:
 *   1. Creating a fresh test sub-user via API and obtaining its JWT token
 *   2. Creating chatbots and toggling permissions as the parent
 *   3. Persisting state to the dev database
 *
 * The existing e2e/ infrastructure (auth.setup.ts + helpers/credits-admin.ts)
 * only supports single-account login + page.route() mock fixtures. It has no
 * helper to:
 *   - Create a sub-user via /v1/customers + obtain that sub-user's token
 *   - Run multi-actor flows that mutate real backend state
 *
 * Building such helpers safely (cleanup, isolation, no dev DB pollution) is out
 * of scope for Task 7. Per the S3 Gate review's recommended fallback, the
 * P0.5 / P0.6 paths are verified manually via gstack /qa in S5/S6 against the
 * deployed dev environment. See:
 *   numind-server/docs/superpowers/qa/2026-04-20-child-run-permission-qa.md
 *
 * ── If you re-enable later ──
 * 1. Add a helper to e2e/helpers/ that creates and tears down a sub-user via
 *    parent-token API calls. Keep it idempotent and clean up on test teardown.
 * 2. Remove `.skip` and use `test.describe(...)` instead.
 * 3. Run with: DEV_API_URL=$DEV_API_URL E2E_USERNAME=$E2E_USERNAME E2E_PASSWORD=$E2E_PASSWORD npm run test:e2e -- child-run-permission-api
 */

import { test, expect, type APIRequestContext } from '@playwright/test'

const API_BASE = process.env.DEV_API_URL || 'http://49.233.219.254:9091'

// Helper: parent account login → returns JWT token
// Currently unused (suite is skipped); kept here as a starting point for when
// the helper infrastructure for sub-user creation is added.
async function loginParent(req: APIRequestContext): Promise<string> {
  const res = await req.post(`${API_BASE}/v1/web/login`, {
    data: {
      username: process.env.E2E_USERNAME,
      password: process.env.E2E_PASSWORD
    }
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return body.data.token as string
}

test.describe.skip('child-run-permission API E2E (deferred to gstack /qa, see header)', () => {
  test('P0.5 sub-user direct API call with unauthorized chatbot_id returns 403 ErrChatbotRunDenied', async ({
    request
  }) => {
    // Setup steps (require sub-user helper, not currently available):
    //   1. parentToken = await loginParent(request)
    //   2. Create chatbot A as parent → POST /v1/chatbot/configs
    //   3. Create test sub-user S → POST /v1/customers (parent token)
    //   4. Login as S → obtain subToken
    //   5. Do NOT grant chatbot A to S
    //   6. As subToken, POST /v1/chatbot/sessions { chatbot_id: A.id }
    //   7. Expect 403 with code matching ErrChatbotRunDenied
    //
    // Gate verification fallback: gstack /qa script in S5 manually walks this
    // path on a fresh dev sub-user.
    await loginParent(request) // referenced to silence unused-import lint
  })

  test('P0.6 ChatStream after revoke returns 403 ErrChatbotRunDenied', async ({ request }) => {
    // Setup steps (require sub-user helper, not currently available):
    //   1. parentToken = await loginParent(request)
    //   2. Create chatbot B as parent + grant to sub-user S
    //   3. As subToken, create session for B → POST /v1/chatbot/sessions
    //      (succeeds; receive session_id)
    //   4. As parentToken, revoke B from S → DELETE /v1/customers/:S/chatbots/:B
    //   5. As subToken, send next message in same session
    //      → POST /v1/chatbot/sessions/:id/chat (or EventSource ChatStream)
    //   6. Expect 403 with code matching ErrChatbotRunDenied (revoke takes
    //      effect immediately, no cached permission)
    //
    // Gate verification fallback: gstack /qa script in S5 manually walks this
    // path with two browser tabs (parent + sub-user).
    await loginParent(request) // referenced to silence unused-import lint
  })
})
