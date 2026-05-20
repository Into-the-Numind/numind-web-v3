/**
 * agent-student.spec.ts — Agent Student UX e2e (T15)
 *
 * Covers the 8 most critical student-side paths for the Agent feature (#11).
 * All tests use the storageState auth from auth.setup.ts (inherited from the
 * 'e2e' project in playwright.config.ts) so no manual login is needed.
 *
 * Bootstrap API calls (agent list, recent sessions, credits balance) are
 * intercepted by setupAgentMocks() so tests don't require a live backend.
 *
 * Run/narration API calls (/v1/agent-runs/**, /v1/sessions/**) are served by
 * src/api/agent.mock.ts when the dev server is started with VITE_AGENT_MOCK=true.
 * Set this in the VITE_AGENT_MOCK env var passed to the webServer command.
 *
 * Refs: docs/agent-mode/feature-11-plan.md T15
 *
 * Running:
 *   VITE_AGENT_MOCK=true npm run test:e2e -- agent-student
 */

import { test, expect } from '@playwright/test'
import { setupAgentMocks } from './helpers/agent-mock'

test.describe('Agent Student UX', () => {
  test.beforeEach(async ({ page }) => {
    await setupAgentMocks(page)
  })

  // ── 1. /agent 首屏展示 agent 卡片列表 ──────────────────────────────────────
  test('1. 进入 /agent 看到 agent 卡片列表', async ({ page }) => {
    await page.goto('/agent')
    // 等待 agent-card 出现（mock returns 3 agents）
    await expect(page.locator('.agent-card').first()).toBeVisible({ timeout: 10_000 })
    // 爆款分析师应该可见
    await expect(page.getByText('爆款分析师')).toBeVisible()
    // 卡片数应 >= 2
    const cardCount = await page.locator('.agent-card').count()
    expect(cardCount).toBeGreaterThanOrEqual(2)
  })

  // ── 2. 点"开始使用"进入对话窗并看到 First-run 屏 ──────────────────────────
  test('2. 点开始使用进入对话窗并看到 First-run 屏', async ({ page }) => {
    await page.goto('/agent')
    await expect(page.getByText('爆款分析师')).toBeVisible({ timeout: 10_000 })
    // 点第一个卡片的"开始使用"按钮
    await page.getByRole('button', { name: '开始使用' }).first().click()
    // 路由应跳转到 /agent/chat/new?agent_id=...
    await page.waitForURL(/\/agent\/chat\/new/, { timeout: 10_000 })
    // AgentFirstRun 渲染（包含 agent name 或 welcome message）
    await expect(page.getByText(/爆款分析师/)).toBeVisible({ timeout: 10_000 })
  })

  // ── 3. 点 starter 自动填入并发送用户消息 ──────────────────────────────────
  test('3. 点 starter 自动填入并发送', async ({ page }) => {
    await page.goto('/agent/chat/new?agent_id=1')
    // AgentFirstRun 的 starter 按钮出现
    await expect(page.locator('button.starter-btn').first()).toBeVisible({ timeout: 10_000 })
    // 点第一个 starter
    await page.locator('button.starter-btn').first().click()
    // 点击 starter 后直接触发 handleSend，用户消息气泡出现
    await expect(page.locator('.msg-user')).toBeVisible({ timeout: 8_000 })
  })

  // ── 4. 历史列表页显示（无数据时显示空态，有数据时显示条目）─────────────────
  test('4. 历史列表显示并不报错', async ({ page }) => {
    await page.goto('/agent/history')
    // 页面不应跳转回 / 或 /login
    await expect(page.url()).toContain('/agent/history')
    // 等待内容渲染（加载完成后显示标题文字或空态）
    await page.waitForFunction(
      () => {
        const body = document.body.textContent ?? ''
        return body.includes('历史') || body.includes('没有') || body.includes('暂无')
      },
      null,
      { timeout: 10_000 }
    )
    // 至少"历史"字样在页面中存在
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).toMatch(/历史|没有|暂无/)
  })

  // ── 5. 父账户访问 /agent 不被拦截（不跳转回 / 或 /login）──────────────────
  test('5. 访问 /agent 不被权限拦截', async ({ page }) => {
    await page.goto('/agent')
    // 停留在 /agent（不被 router guard 踢出）
    await page.waitForURL(/\/agent/, { timeout: 10_000 })
    expect(page.url()).toContain('/agent')
    // 不应跳转到 /login
    expect(page.url()).not.toContain('/login')
  })

  // ── 6. AppSidebar 含"AI 助手"菜单项 ───────────────────────────────────────
  test('6. AppSidebar 含 AI 助手菜单项', async ({ page }) => {
    await page.goto('/')
    // Sidebar 的 nav-item RouterLink 含 /agent，其 nav-label span 内容为"AI 助手"
    await expect(page.locator('.nav-item[href="/agent"]')).toBeVisible({ timeout: 10_000 })
    // 也可通过文本断言
    await expect(page.locator('.nav-item', { hasText: 'AI 助手' })).toBeVisible()
  })

  // ── 7. HomeView 有 AI 助手卡片入口 ────────────────────────────────────────
  test('7. HomeView 有 AI 助手卡片入口', async ({ page }) => {
    await page.goto('/')
    // HomeView 在 AI 助手 section 下渲染了 feature-card 或 section-label
    // 等待 home 页内容加载
    await page.waitForFunction(
      () =>
        document.querySelector('.feature-card') !== null ||
        document.body.textContent?.includes('AI 助手'),
      null,
      { timeout: 15_000 }
    )
    // 页面应包含"AI 助手"文字
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).toContain('AI 助手')
  })

  // ── 8. mock fixture-3 rejected → 显示 .narration-state-rejected icon ──────
  test('8. fixture-3 "权限" 输入 → 出现 narration-state-rejected', async ({ page }) => {
    await page.goto('/agent/chat/new?agent_id=1')
    // 等待输入框就绪（AgentFirstRun 渲染后 textarea 也在 DOM 中）
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 })
    // 输入触发 fixture-3 的关键词
    await page.locator('textarea').fill('帮我做一个权限操作')
    // 点"发送"按钮（AppButton 包含"发送"文字）
    await page.getByRole('button', { name: /发送/ }).click()
    // 等待 narration-state-rejected DOM 元素出现
    // fixture-3 在 src/api/agent.mock.ts 中固化返回 rejected 状态事件
    await expect(page.locator('.narration-state-rejected')).toBeVisible({ timeout: 15_000 })
  })
})
