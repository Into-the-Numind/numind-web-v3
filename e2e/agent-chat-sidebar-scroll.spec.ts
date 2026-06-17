/**
 * agent-chat-sidebar-scroll.spec.ts — regression for the AgentChatView left
 * session-list sidebar losing its scroll position on session switch.
 *
 * Background (runtime-confirmed, NDF frontend rule §6): on a real dev account with
 * 118 sessions, scrolling the sidebar down and clicking a lower history session
 * snapped the list back to the top (scrollTop 5643 → 0). A standalone Playwright
 * probe showed WHY: the `.sessions-list` container was a *new DOM node* after the
 * click (remounted). Root cause: the sidebar lived inside
 *   <div v-else class="app-container">   (the v-if="isLoadingSnapshot" sibling)
 * so loadSessionSnapshot() flipping `loadingSnapshot=true` across its await tore
 * down the whole .app-container — sidebar included — and rebuilt it fresh, resetting
 * the browser's native scroll offset.
 *
 * The fix keeps .app-container (and the sidebar) always mounted and only swaps the
 * loading / error / chat content in the MAIN column. Scroll preservation is then a
 * native consequence of the `.sessions-list` DOM node surviving the switch — which
 * is exactly what this test locks: the node tagged before the click still carries
 * its marker after the snapshot load settles. Pre-fix the marker is gone (remount);
 * post-fix it survives.
 *
 * Strategy: mock-driven + hermetic auth (matches agent-chat-rename-overlay.spec.ts),
 * so this never depends on live dev data or auth.setup.ts.
 *
 * Run:
 *   VITE_AGENT_MOCK=true npm run test:e2e -- agent-chat-sidebar-scroll
 */

import { test, expect } from '@playwright/test'
import { setupAgentMocks } from './helpers/agent-mock'

// Hermetic auth: override the project storageState and inject a token before boot.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('AgentChatView sidebar — must NOT remount on session switch (scroll preservation)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'e2e-fake-token')
      localStorage.setItem('auth_token', 'e2e-fake-token')
      const u = JSON.stringify({
        id: 1,
        username: 'e2e',
        parent_user_id: null,
        billing_mode: 'credits'
      })
      localStorage.setItem('userInfo', u)
      localStorage.setItem('user_info', u)
    })
    await setupAgentMocks(page)
  })

  test('clicking a history session keeps the same .sessions-list DOM node (no remount → scroll kept)', async ({
    page
  }) => {
    // No ?agent_id → the sidebar shows ALL recent sessions (mock gives 2).
    await page.goto('/agent/chat/new')

    const list = page.locator('.sessions-list')
    await expect(list).toBeVisible({ timeout: 15_000 })
    // At least one history session to click.
    await expect(page.locator('.session-item').first()).toBeVisible({ timeout: 15_000 })

    // Tag the live scroll container. If the container is torn down and rebuilt
    // during the switch, the new node will NOT carry this marker.
    await list.evaluate((el) => el.setAttribute('data-scroll-marker', 'KEEP'))

    // Switch to a concrete history session (triggers loadSessionSnapshot →
    // loadingSnapshot=true across an await — the exact path that used to remount).
    const target = page.locator('.session-item').first()
    await target.click()

    // Wait for the switch to settle: URL carries a real session id and the clicked
    // item is marked active (props.sessionId now matches it).
    await expect(page).toHaveURL(/\/agent\/chat\/(?!new)[^/]+/, { timeout: 15_000 })
    await expect(page.locator('.session-item--active').first()).toBeVisible({ timeout: 15_000 })

    // THE ASSERTION: the sidebar container is the SAME node we tagged — it was never
    // unmounted, so the browser kept its scroll offset. Fails pre-fix (marker lost).
    await expect(page.locator('.sessions-list')).toHaveAttribute('data-scroll-marker', 'KEEP')
  })
})
