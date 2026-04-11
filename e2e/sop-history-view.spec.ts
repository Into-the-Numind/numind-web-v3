import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * E2 — View history step → HistoryViewStrip 出现 → 返回 (F13 key path)
 *
 * 关键路径（spec §3.2 state B）：
 *  1. 进入 run page，执行 step 1（或 seed 一个已完成的 nodeRun）
 *  2. 推进到 step 2（currentStep === 2）
 *  3. 点左侧 nav 的 step 1 → viewingStep 变为 1，isDoneHistory 为真
 *  4. 验证 HistoryViewStrip 可见 + 文本含"正在查看历史步骤"
 *  5. 验证 textarea 不可见（只读态，InputCard 不渲染）
 *  6. 点"返回步骤 2"按钮
 *  7. 验证回到 step 2 active 态，HistoryViewStrip 消失
 *
 * ## 设计决策
 *
 * 为避免依赖真实 SSE，本测试用 mock 的 /runs/:id 返回带 completed_nodes 的 state，
 * 让 store 初始化时已经"处于 currentStep=2 + node1 已完成"的状态。
 * 这样无需真实点击"执行"即可验证 state B 的视觉切换。
 *
 * 真实完整路径（真实 LLM 执行 step 1 → 自动推进 → 用户回看）在 V1 阶段
 * 通过 gstack /qa 手工验证。
 */

const sel = {
  templateTitle: '[data-testid="topbar-title"]',
  stepNavItem: '[data-testid="sop-nav-item"]',
  stepView: '[data-testid="sop-step-view"]',
  historyViewStrip: '[data-testid="history-view-strip"]',
  historyViewStripReturn: '[data-testid="history-view-strip-return"]',
  outputCard: '[data-testid="output-card"]',
  inputCard: '[data-testid="input-card"]',
  stepInputTextarea: '.step-input textarea'
} as const

const mockTemplate = {
  id: 1,
  name: '小红书爆款文案',
  description: '',
  status: 'active',
  publish_status: 'published',
  trailing_chat_enabled: false,
  created_at: '2026-04-11T00:00:00Z',
  updated_at: '2026-04-11T00:00:00Z'
}

const mockNodes = [
  {
    id: 10,
    template_id: 1,
    name: '第一步',
    description: '',
    sort: 0,
    status: 'active',
    created_at: '2026-04-11T00:00:00Z',
    updated_at: '2026-04-11T00:00:00Z'
  },
  {
    id: 11,
    template_id: 1,
    name: '第二步',
    description: '',
    sort: 1,
    status: 'active',
    created_at: '2026-04-11T00:00:00Z',
    updated_at: '2026-04-11T00:00:00Z'
  }
]

async function installMocks(page: Page) {
  await page.route(/\/v1\/sop\/templates\/\d+\/nodes(?:\?.*)?$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { template: mockTemplate, nodes: mockNodes, total: mockNodes.length }
      })
    })
  })
  await page.route(/\/v1\/sop\/templates\/\d+\/bookmarks(?:\?.*)?$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { bookmarks: [] } })
    })
  })
}

async function installRunWithNode1Completed(page: Page, runId: number) {
  await page.route(`**/v1/sop/runs/${runId}`, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          ID: runId,
          template_id: 1,
          user_id: 1,
          status: 'running',
          conversation_id: `conv-mock-${runId}`,
          counted: true,
          started_at: '2026-04-11T00:00:00Z',
          finished_at: null,
          created_at: '2026-04-11T00:00:00Z',
          updated_at: '2026-04-11T00:00:00Z',
          error_message: ''
        }
      })
    })
  })
  await page.route(`**/v1/sop/runs/${runId}/status`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          status: 'running',
          current_node_sort: 1,
          completed_nodes: [
            {
              node_id: 10,
              node_name: '第一步',
              sort: 0,
              node_run_id: 5001,
              output: '【step 1 的历史输出】',
              thinking: '',
              latency_ms: 1234,
              model_name: 'glm-4-7',
              total_tokens: 500,
              completed_at: '2026-04-11T00:01:00Z'
            }
          ],
          next_node: {
            node_id: 11,
            node_name: '第二步',
            sort: 1,
            is_first: false,
            has_next: false
          },
          total_nodes: mockNodes.length,
          completed_count: 1,
          auto_applied_count: 0
        }
      })
    })
  })
  await page.route(`**/v1/sop/runs/${runId}/chat-messages`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { run_id: runId, conversation_id: `conv-mock-${runId}`, messages: [] }
      })
    })
  })
}

async function gotoRun(page: Page, templateId: number, runId?: number) {
  const url = runId
    ? `/sop/run?templateId=${templateId}&runId=${runId}`
    : `/sop/run?templateId=${templateId}`
  await page.goto(url)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="sop-nav-item"]').length > 0,
    null,
    { timeout: 30_000 }
  )
}

test.describe('E2 — History view strip', () => {
  test('点历史 step → HistoryViewStrip 可见 + 返回按钮恢复 active 态', async ({ page }) => {
    const RUN_ID = 6001
    await installMocks(page)
    await installRunWithNode1Completed(page, RUN_ID)

    await gotoRun(page, 1, RUN_ID)
    await expect(page.locator(sel.templateTitle)).toHaveText('小红书爆款文案')

    // 初始态：currentStep 应为 2，step 2 是 active
    const navItems = page.locator(sel.stepNavItem)
    await expect(navItems).toHaveCount(mockNodes.length)

    // step 1（索引 0）应该是 done 态（completed_nodes 含它）
    await expect(navItems.nth(0)).toHaveAttribute('data-step-state', 'done')

    // step 2（索引 1）应该是 active 态
    await expect(navItems.nth(1)).toHaveAttribute('data-step-state', 'active')

    // HistoryViewStrip 当前不应该显示（当前在 active 态）
    await expect(page.locator(sel.historyViewStrip)).toHaveCount(0)

    // 点 step 1 → 进入 viewing 态
    await navItems.nth(0).click()

    // step 1 变成 viewing 态
    await expect(navItems.nth(0)).toHaveAttribute('data-step-state', 'viewing')

    // HistoryViewStrip 出现
    const strip = page.locator(sel.historyViewStrip)
    await expect(strip).toBeVisible({ timeout: 5_000 })
    await expect(strip).toContainText('正在查看历史步骤')

    // textarea 不应可见（InputCard 只在 active 状态渲染，history 状态只显示 OutputCard）
    await expect(page.locator(sel.inputCard)).toHaveCount(0)
    await expect(page.locator(sel.stepInputTextarea)).toHaveCount(0)

    // OutputCard 应可见，且显示 step 1 的历史 output
    const outputCard = page.locator(sel.outputCard)
    await expect(outputCard).toBeVisible()
    await expect(outputCard).toContainText('step 1 的历史输出')

    // 点"返回步骤 2"按钮
    const returnBtn = page.locator(sel.historyViewStripReturn)
    await expect(returnBtn).toBeVisible()
    await expect(returnBtn).toContainText('返回步骤 2')
    await returnBtn.click()

    // HistoryViewStrip 消失，step 2 恢复 active
    await expect(strip).toHaveCount(0)
    await expect(navItems.nth(1)).toHaveAttribute('data-step-state', 'active')
  })
})
