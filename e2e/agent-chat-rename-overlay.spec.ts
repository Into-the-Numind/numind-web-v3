/**
 * agent-chat-rename-overlay.spec.ts — a11y / DOM-hygiene regression for the
 * AgentChatView "重命名对话" modal.
 *
 * Background: the rename overlay (AgentChatView.vue) was rendered unconditionally —
 * only its `.open` class was toggled. When closed it stayed in the DOM as a phantom
 * `role="dialog" aria-modal="true"` with a textbox + 取消/保存 buttons (opacity:0,
 * pointer-events:none). Sighted users were unaffected, but it polluted the
 * accessibility tree and tripped automated a11y/DOM snapshots into thinking a modal
 * was blocking the chat input. The sibling 删除 modal already used `v-if`; this test
 * locks the rename modal to the same behaviour.
 *
 * Strategy: mock-driven (matches agent-ask-user-question.spec.ts).
 *   - VITE_AGENT_MOCK=true handles /v1/agent-skills/available, /v1/agent-sessions/**
 *     and /v1/tenant-settings/support-contact via src/api/agent.mock.ts (gives us
 *     agent_id=1 "爆款分析师" + one recent session to open the rename menu).
 *   - setupAgentMocks() stubs the credits balance.
 *   - Auth is self-injected (hermetic) so this regression never depends on
 *     auth.setup.ts / live dev credentials.
 *
 * Run:
 *   VITE_AGENT_MOCK=true npm run test:e2e -- agent-chat-rename-overlay
 */

import { test, expect } from '@playwright/test'
import { setupAgentMocks } from './helpers/agent-mock'

// Hermetic auth: override the project storageState and inject a token before boot.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('AgentChatView rename modal — closed modal must leave the DOM (a11y)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'e2e-fake-token')
      localStorage.setItem('auth_token', 'e2e-fake-token')
      const u = JSON.stringify({ id: 1, username: 'e2e', parent_user_id: null, billing_mode: 'credits' })
      localStorage.setItem('userInfo', u)
      localStorage.setItem('user_info', u)
    })
    await setupAgentMocks(page)
  })

  test('rename dialog absent when closed, present when open, removed after cancel; chat input stays usable', async ({
    page
  }) => {
    await page.goto('/agent/chat/new?agent_id=1')

    const chatInput = page.locator('textarea.chat-input')
    await expect(chatInput).toBeVisible({ timeout: 15_000 })

    // The rename dialog is uniquely identified by its 对话名称 input.
    const renameDialog = page.locator('input[placeholder="对话名称"]')

    // CLOSED on mount: the rename dialog must NOT be in the DOM (v-if),
    // not merely opacity:0. This is the assertion that fails pre-fix.
    await expect(renameDialog).toHaveCount(0)

    // OPEN via the session "更多" menu → 重命名.
    const firstSession = page.locator('.session-item').first()
    await expect(firstSession).toBeVisible()
    await firstSession.hover()
    await firstSession.locator('.session-menu-btn').click()
    await page.getByRole('button', { name: '重命名' }).click()
    await expect(renameDialog).toBeVisible()

    // CANCEL → dialog must leave the DOM again, and the chat input must be
    // immediately clickable + typable (the original reported concern).
    await page.getByRole('button', { name: '取消' }).click()
    await expect(renameDialog).toHaveCount(0)
    await chatInput.click()
    await chatInput.fill('回归测试 regression-typed')
    await expect(chatInput).toHaveValue('回归测试 regression-typed')
  })
})
