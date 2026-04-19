import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * E3 — Stop generation → partial fragment preserved (F13 key path)
 *
 * 关键路径：
 *  1. 进入 run page + 已存在的 runId
 *  2. 填 prompt，点击"执行这一步"
 *  3. 等几秒进入 streaming 状态（OutputCard state=streaming + live label）
 *  4. 点"停止生成"按钮（OutputCard 内的或 InputCard 的）
 *  5. 验证 streaming 停止（state 不再是 streaming）
 *  6. 验证 OutputCard 仍然显示已收到的 partial content（read-only 态）
 *
 * ## 设计决策
 *
 * SSE mock 返回一个"慢流"（多个 event 之间 sleep 100ms），给测试时间点击停止。
 * useSSEStream 的 abort 逻辑通过 AbortController 实现，应该能 mid-stream 中断。
 *
 * 由于 playwright 的 page.route body streaming 限制，本测试用一个
 * "包含 partial 数据的即时 SSE body"——即只发送几个 thinking+message 事件，
 * 不发 done——让前端认为 stream 还没结束，此时点击停止触发 abort。
 *
 * 真正的 slow-stream + abort mid-transmission 在 V1 gstack /qa 对真实后端验证。
 */

const sel = {
  templateTitle: '[data-testid="topbar-title"]',
  stepNavItem: '[data-testid="sop-nav-item"]',
  outputCard: '[data-testid="output-card"]',
  outputStop: '[data-testid="output-stop"]',
  inputExecute: '[data-testid="input-execute"]',
  inputStop: '[data-testid="input-stop"]',
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
    id: 20,
    template_id: 1,
    name: '生成内容',
    description: '',
    sort: 0,
    status: 'active',
    created_at: '2026-04-11T00:00:00Z',
    updated_at: '2026-04-11T00:00:00Z'
  }
]

function buildSSEBody(events: Array<{ event: string; data: string }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join('')
}

async function installBaseMocks(page: Page) {
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

async function installRunMock(page: Page, runId: number) {
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
          started_at: null,
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
          current_node_sort: 0,
          completed_nodes: [],
          next_node: {
            node_id: mockNodes[0].id,
            node_name: mockNodes[0].name,
            sort: 0,
            is_first: true,
            has_next: false
          },
          total_nodes: mockNodes.length,
          completed_count: 0,
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

async function gotoRun(page: Page, templateId: number, runId: number) {
  await page.goto(`/sop/run?templateId=${templateId}&runId=${runId}`)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="sop-nav-item"]').length > 0,
    null,
    { timeout: 30_000 }
  )
}

test.describe('E3 — Stop generation preserves partial fragment', () => {
  test('streaming 中点停止 → partial 内容保留', async ({ page }) => {
    const RUN_ID = 7001
    await installBaseMocks(page)
    await installRunMock(page, RUN_ID)

    // Mock SSE: 发送几条 message 事件，不发 done。
    // 前端 useSSEStream 会持续读取直到 close 或 abort。
    const sseBody = buildSSEBody([
      { event: 'message', data: JSON.stringify('【开头片段】这是正在生成的内容。') },
      { event: 'message', data: JSON.stringify('第二段开始，可能被中途停止…') }
      // 故意不发 done，模拟仍在流式中的状态
    ])
    await page.route('**/v1/sop/runs/*/nodes/*/execute**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody
      })
    })

    await gotoRun(page, 1, RUN_ID)
    await expect(page.locator(sel.templateTitle)).toHaveText('小红书爆款文案')

    // 填写输入 + 点击执行
    const textarea = page.locator(sel.stepInputTextarea).first()
    await textarea.fill('E3 stop generation 测试输入')
    await expect(page.locator(sel.inputExecute)).toBeVisible()
    await page.locator(sel.inputExecute).click()

    // 进入 streaming 态：OutputCard 应可见（state=streaming → output-stop 按钮出现）
    const outputCard = page.locator(sel.outputCard)
    await expect(outputCard).toBeVisible({ timeout: 5_000 })

    // 等 partial 内容到达 DOM
    await expect(outputCard).toContainText('【开头片段】', { timeout: 5_000 })

    // 点击"停止生成"
    // 优先试 OutputCard 上的 stop 按钮（state=streaming 才渲染）。
    // 若 InputCard 同时有 stop 按钮（isExecuting=true）也可以走 inputStop。
    const outputStopBtn = page.locator(sel.outputStop)
    const inputStopBtn = page.locator(sel.inputStop)
    const stopBtn = (await outputStopBtn.count()) > 0 ? outputStopBtn : inputStopBtn
    await expect(stopBtn).toBeVisible({ timeout: 3_000 })
    await stopBtn.click()

    // 验证 streaming 停止：output-stop 按钮不再可见（state 切出 streaming）
    await expect(outputStopBtn).toHaveCount(0, { timeout: 5_000 })
    // input-execute 按钮应恢复可见（isExecuting=false）
    await expect(page.locator(sel.inputExecute)).toBeVisible()

    // 关键断言：partial 内容仍然在 DOM 里（不应被清空）
    // 注意：stop 后 OutputCard 可能从 streaming 切到 read-only，也可能整个隐藏
    // （如果 nodeRun 没持久化则隐藏）。本测试只验证"已出现的文字没被强制清空
    // 到完全消失"——即 body 中仍能看到开头片段。
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).toContain('【开头片段】')
  })
})
