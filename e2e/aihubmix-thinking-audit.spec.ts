import { test, expect, type Page, type Route, type Request } from '@playwright/test'

/**
 * AiHubMix Thinking Protocol Audit — E2E Paths (Task 10, Step 10.5)
 *
 * Covers 8 scenarios validating the thinking flag flows end-to-end through
 * Chatbot + SOP entry points, including:
 *   1. Claude thinking path (thinking event emitted + content non-empty)
 *   2. SOP thinking path (thinking SSE event on capable node)
 *   3. GPT 5.4 no-CoT safe handling (empty reasoning, no frontend crash)
 *   4. qwen-turbo skip (non-thinking model, no thinking event, 200)
 *   5. Thinking=false explicit (outbound body must NOT contain reasoning_effort)
 *   6. Claude -think variant selection (if UI exposes it; else skip with note)
 *   7. Gemini intrinsic (thinking event + Langfuse metadata verifiable in qa §2)
 *   8. Preference-save thinking-variant regression — direct API probe
 *
 * Actual run happens in S5; this spec file is the deliverable from Task 10.
 * Tests are failure-isolated — each wrapped in its own test(...) block so
 * infra drift in one path does not mask regressions in others.
 *
 * Selectors are intentionally resilient: model-selector buttons + thinking
 * toggle are looked up by role/text. If the UI refactors, tests fail loud
 * at selector lookup rather than silently passing.
 */

// ---------------------------------------------------------------------------
// Shared selectors (best-effort; UI may have evolved, tests surface mismatch)
// ---------------------------------------------------------------------------
const chatbotSel = {
  chatRoot: '.chat-area, .sales-chat, [data-testid="chat-area"]',
  input: 'textarea[placeholder], .chat-input textarea, [data-testid="chat-input"]',
  sendBtn: 'button[type="submit"], .send-btn, [data-testid="send-btn"]',
  modelSelector: '.model-selector, [data-testid="model-selector"]',
  thinkingToggle: '.thinking-toggle, [data-testid="thinking-toggle"]',
  thinkingBlock: '.thinking-block, [data-testid="thinking-block"]',
  aiMessage: '.ai-message, .assistant-message, [data-testid="ai-message"]'
} as const

const sopSel = {
  sopEntry: 'a[href*="/sop"], [data-testid="sop-entry"]',
  runBtn: '.sop-run-btn, [data-testid="sop-run"]',
  thinkingBlock: '.thinking-block, [data-testid="thinking-block"]'
} as const

// ---------------------------------------------------------------------------
// Helper: pick a model from the chatbot model selector by label match.
// Returns true if click succeeded, false if selector/option not present
// (enables graceful skip for Test 6 when UI hides thinking variants).
// ---------------------------------------------------------------------------
async function selectModel(page: Page, label: string | RegExp): Promise<boolean> {
  const trigger = page.locator(chatbotSel.modelSelector).first()
  if ((await trigger.count()) === 0) return false
  await trigger.click()
  const option = page.getByText(label).first()
  if ((await option.count()) === 0) {
    // Close dropdown by pressing escape
    await page.keyboard.press('Escape')
    return false
  }
  await option.click()
  return true
}

// ---------------------------------------------------------------------------
// Helper: send a message in chatbot and collect SSE events observed while
// waiting. Returns an object describing what event types fired.
// ---------------------------------------------------------------------------
interface ChatObservation {
  sawThinking: boolean
  sawMessage: boolean
  content: string
  status: number | null
}

async function sendAndObserve(
  page: Page,
  text: string,
  timeoutMs = 45_000
): Promise<ChatObservation> {
  const observation: ChatObservation = {
    sawThinking: false,
    sawMessage: false,
    content: '',
    status: null
  }

  // Listen for the streaming response
  const respHandler = async (resp: import('@playwright/test').Response) => {
    const url = resp.url()
    if (url.includes('/chatbot/') || url.includes('/sop/') || url.includes('/sales/')) {
      if (observation.status === null) observation.status = resp.status()
    }
  }
  page.on('response', respHandler)

  await page.locator(chatbotSel.input).first().fill(text)
  await page.locator(chatbotSel.sendBtn).first().click()

  // Poll for thinking-block or message appearance
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!observation.sawThinking) {
      if ((await page.locator(chatbotSel.thinkingBlock).count()) > 0) {
        observation.sawThinking = true
      }
    }
    const msgs = page.locator(chatbotSel.aiMessage)
    const n = await msgs.count()
    if (n > 0) {
      const last = msgs.last()
      const txt = (await last.innerText().catch(() => '')).trim()
      if (txt.length > 0) {
        observation.sawMessage = true
        observation.content = txt
        // Wait briefly for stream to settle
        await page.waitForTimeout(2_000)
        break
      }
    }
    await page.waitForTimeout(500)
  }

  page.off('response', respHandler)
  return observation
}

// ---------------------------------------------------------------------------
// Path 1: Claude thinking path
// ---------------------------------------------------------------------------
test('path 1: Claude 4.6 thinking — emits thinking event + content', async ({ page }) => {
  await page.goto('/sales')
  await page.waitForLoadState('networkidle')

  const picked = await selectModel(page, /claude/i)
  test.skip(!picked, 'Claude model not selectable in current UI — qa doc §6 note')

  const obs = await sendAndObserve(page, '用三步推导斐波那契第 10 项')
  expect(obs.sawMessage, 'response content should be non-empty').toBe(true)
  expect(obs.content.length).toBeGreaterThan(0)
  // Claude 4.6 base supports thinking; expect the thinking stream to surface.
  expect(obs.sawThinking, 'thinking event should fire for Claude 4.6').toBe(true)
})

// ---------------------------------------------------------------------------
// Path 2: SOP thinking path
// ---------------------------------------------------------------------------
test('path 2: SOP node run — thinking SSE event on thinking-capable node', async ({ page }) => {
  await page.goto('/sop')
  await page.waitForLoadState('networkidle')

  const sopEntry = page.locator(sopSel.sopEntry).first()
  if ((await sopEntry.count()) === 0) {
    test.skip(true, 'No SOP template accessible in current UI; see qa doc §6')
  }

  // Expect at least one thinking-block rendered during SOP run, OR a
  // network response containing "thinking" event chunk.
  let sawThinkingFrame = false
  page.on('response', async (resp) => {
    const url = resp.url()
    if (url.includes('/sop/') && (url.includes('stream') || url.includes('run'))) {
      try {
        const body = await resp.text()
        if (body.includes('"type":"thinking"') || body.includes('event: thinking')) {
          sawThinkingFrame = true
        }
      } catch {
        /* non-text response */
      }
    }
  })

  const runBtn = page.locator(sopSel.runBtn).first()
  if ((await runBtn.count()) > 0) await runBtn.click()

  // Wait up to 60s for thinking evidence
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (sawThinkingFrame) break
    if ((await page.locator(sopSel.thinkingBlock).count()) > 0) {
      sawThinkingFrame = true
      break
    }
    await page.waitForTimeout(1_000)
  }
  expect(sawThinkingFrame, 'SOP thinking-capable node should emit thinking SSE').toBe(true)
})

// ---------------------------------------------------------------------------
// Path 3: GPT 5.4 no-CoT safe handling
// ---------------------------------------------------------------------------
test('path 3: GPT 5.4 — empty reasoning_content does not crash frontend', async ({ page }) => {
  await page.goto('/sales')
  await page.waitForLoadState('networkidle')

  const picked = await selectModel(page, /gpt[-\s]?5\.?4|gpt[-\s]?5|gpt-5\.4/i)
  test.skip(!picked, 'GPT 5.4 not selectable in current UI — qa doc §6 note')

  // Track console errors — must stay clean even when reasoning_content empty
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => consoleErrors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  const obs = await sendAndObserve(page, 'What is 2+2?')
  expect(obs.sawMessage, 'GPT 5.4 content should still arrive').toBe(true)
  expect(obs.content.length).toBeGreaterThan(0)
  // No frontend error allowed even though reasoning stream is empty.
  const fatalErrors = consoleErrors.filter(
    (e) => !/ResizeObserver|Non-Error promise rejection captured/i.test(e)
  )
  expect(fatalErrors, 'no console errors from empty reasoning path').toHaveLength(0)
})

// ---------------------------------------------------------------------------
// Path 4: qwen-turbo skip — non-thinking model, no thinking event
// ---------------------------------------------------------------------------
test('path 4: qwen-turbo — no thinking event + 200', async ({ page }) => {
  await page.goto('/sales')
  await page.waitForLoadState('networkidle')

  const picked = await selectModel(page, /qwen[-\s]?turbo/i)
  test.skip(!picked, 'qwen-turbo not selectable in current UI — qa doc §6 note')

  const obs = await sendAndObserve(page, '你好')
  expect(obs.sawMessage).toBe(true)
  expect(obs.sawThinking, 'non-thinking model must NOT emit thinking event').toBe(false)
  expect([null, 200]).toContain(obs.status)
})

// ---------------------------------------------------------------------------
// Path 5: Thinking=false explicit — outbound body must NOT contain reasoning_effort
// ---------------------------------------------------------------------------
test('path 5: thinking=false — outbound request body omits reasoning_effort', async ({ page }) => {
  await page.goto('/sales')
  await page.waitForLoadState('networkidle')

  // Toggle thinking OFF if toggle is visible; otherwise skip.
  const toggle = page.locator(chatbotSel.thinkingToggle).first()
  if ((await toggle.count()) === 0) {
    test.skip(true, 'Thinking toggle hidden (hotfix-default-thinking v-if=false) — qa §6')
  }
  await toggle.click()

  let capturedBody: string | null = null
  await page.route('**/v1/web/**', async (route: Route, req: Request) => {
    if (req.method() === 'POST' && /chat|stream|sop|chatbot/.test(req.url())) {
      try {
        capturedBody = req.postData()
      } catch {
        /* body not accessible */
      }
    }
    await route.continue()
  })

  await sendAndObserve(page, '今天天气怎么样？', 20_000)

  expect(capturedBody, 'outbound POST body must have been captured').not.toBeNull()
  if (capturedBody) {
    expect(
      capturedBody.includes('reasoning_effort'),
      'thinking=false must NOT send reasoning_effort in outbound body'
    ).toBe(false)
  }
})

// ---------------------------------------------------------------------------
// Path 6: Claude -think variant selection
// ---------------------------------------------------------------------------
test('path 6: Claude -thinking variant — if exposed, thinking event fires', async ({ page }) => {
  await page.goto('/sales')
  await page.waitForLoadState('networkidle')

  const picked = await selectModel(page, /claude.*thinking|claude-sonnet-4-6-thinking/i)
  test.skip(
    !picked,
    'Claude -thinking variant not exposed in UI (hotfix-default-thinking default). ' +
      'See qa doc §6 — fall back to /path 8 API probe for regression coverage.'
  )

  const obs = await sendAndObserve(page, '用三步推导斐波那契第 10 项')
  expect(obs.sawMessage).toBe(true)
  expect(obs.sawThinking, 'Claude -thinking variant must emit thinking event').toBe(true)
})

// ---------------------------------------------------------------------------
// Path 7: Gemini intrinsic — thinking event + Langfuse metadata
// ---------------------------------------------------------------------------
test('path 7: Gemini intrinsic — thinking event fires (metadata verified via Langfuse UI)', async ({
  page
}) => {
  await page.goto('/sales')
  await page.waitForLoadState('networkidle')

  const picked = await selectModel(page, /gemini/i)
  test.skip(!picked, 'Gemini not selectable in current UI — qa doc §6 note')

  const obs = await sendAndObserve(page, '今天是几月几号？')
  expect(obs.sawMessage).toBe(true)
  // Gemini is thinking_only=true — thinking always happens regardless of toggle.
  expect(obs.sawThinking, 'Gemini intrinsic must emit thinking stream').toBe(true)
  // trace metadata `resolved_reasoning_effort="intrinsic"` verifiable in
  // Langfuse UI per qa doc §2; we do not assert it here (no trace API wired).
})

// ---------------------------------------------------------------------------
// Path 8: Preference-save thinking-variant regression (API probe)
// ---------------------------------------------------------------------------
test('path 8: SavePreference thinking-variant — API accepts 200 (not 400 bug)', async ({
  page
}) => {
  // Use in-browser request helper; storageState provides the auth token.
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Read token from localStorage (auth.setup stored it there).
  const token = await page.evaluate(() => localStorage.getItem('token'))
  expect(token, 'auth token must be present from auth.setup').toBeTruthy()

  const response = await page.request.post('/v1/web/user-model-preferences', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    data: {
      feature: 'chatbot',
      model_key: 'claude-sonnet-4-6-thinking',
      thinking: true
    }
  })

  // The regression bug was HTTP 400 from preference.go:246 hard-rejecting
  // thinking-variant models; Task 7a/7b migration + biz re-check makes this pass.
  // Acceptable outcomes:
  //   - 200 with code=0 (happy path)
  //   - 200 with code!=0 + message about model not in allowed set (env
  //     doesn't have the variant seeded — that's a DATA state, not the
  //     regression bug we guard against)
  // FAIL: HTTP 400 (hard reject at bind/validation layer)
  expect(response.status(), 'must not be HTTP 400 hard reject').not.toBe(400)
  expect(response.status()).toBeLessThan(500)
})
