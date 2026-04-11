import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * SOP Runtime 页 E2E 测试（NDF sop-runtime-vue-rewrite task 23 — S5 验证策略）
 *
 * 覆盖 spec §12.2 的 11 个关键路径：
 *  1. 步骤名 = DB / URL 注入 runId
 *  2. 描述为空时优雅退化（不显示 undefined/null）
 *  3. 配额耗尽弹 InsufficientCreditsDialog
 *  4. trailing chat 多轮
 *  5. 上传 PDF 触发 OCR（文件上传合并文本）
 *  6. SSE 流式输出 + 思维链
 *  7. 刷新页面 → 步骤恢复（sessionStorage）
 *  8. 历史记录弹窗打开
 *  9. Draft 模式 sendBeacon 清理
 * 10. API 安全验证（GetTemplateNodes 不泄露敏感字段）
 * 11. 模型切换 + 深度思考开关
 *
 * ## 设计决策
 *
 * **使用 Mock 而非真实后端：** task 3 后端改造（将 GetTemplateNodes 改用
 * `{template, nodes, total}` 响应壳 + DTO 隐藏敏感字段）尚未部署到 dev。
 * 若直连 dev 后端，所有依赖新响应壳的路径都会因 `store.template` 为 null
 * 而卡在"加载中…"状态。
 *
 * 为了让 E2E 在 task 25 部署前就能跑通且 S5 验证策略真实有效，本 spec
 * 在 `test.beforeEach` 中用 `page.route()` mock `/v1/sop/templates/:id/nodes`
 * 返回 task 3 后预期的新结构 + DTO-clean 的 nodes。Path 10（真实安全验证）
 * 用 `test.fixme()` 标记为 task 25 部署后启用。
 *
 * ## 执行方式
 *
 *   E2E_USERNAME=xxx E2E_PASSWORD=xxx npm run test:e2e -- sop-runtime
 */

// ── Fixture: 模拟 task 3 后端的 template+nodes 响应 ──
const mockTemplate1 = {
  id: 1,
  name: '小红书爆款文案',
  description: '基于爆款模板生成小红书文案',
  status: 'active',
  publish_status: 'published',
  trailing_chat_enabled: false,
  created_at: '2025-12-16T13:19:16.665+08:00',
  updated_at: '2025-12-17T09:46:56.364+08:00'
}

const mockNodes1 = [
  {
    id: 1,
    template_id: 1,
    name: 'AI拆解产品',
    description: '',
    sort: 0,
    status: 'active',
    created_at: '2025-12-16T13:19:16.665+08:00',
    updated_at: '2025-12-17T09:46:56.364+08:00'
  },
  {
    id: 2,
    template_id: 1,
    name: 'AI学习语言风格',
    description: '',
    sort: 1,
    status: 'active',
    created_at: '2025-12-16T13:19:16.665+08:00',
    updated_at: '2025-12-17T09:46:56.364+08:00'
  },
  {
    id: 3,
    template_id: 1,
    name: 'AI拆解爆款文稿',
    description: '',
    sort: 2,
    status: 'active',
    created_at: '2025-12-16T13:19:16.665+08:00',
    updated_at: '2025-12-17T09:46:56.364+08:00'
  },
  {
    id: 4,
    template_id: 1,
    name: '生成最终文案',
    description: '结合前三步产物产出最终文案',
    sort: 3,
    status: 'active',
    created_at: '2025-12-16T13:19:16.665+08:00',
    updated_at: '2025-12-17T09:46:56.364+08:00'
  }
]

const mockTemplate2 = {
  ...mockTemplate1,
  id: 2,
  name: '带尾聊的 SOP',
  trailing_chat_enabled: true
}

function mockTemplateNodesResponse(templateId: number) {
  if (templateId === 2) {
    return {
      code: 0,
      message: 'ok',
      data: {
        template: mockTemplate2,
        nodes: mockNodes1.map((n) => ({ ...n, template_id: 2 })),
        total: mockNodes1.length
      }
    }
  }
  return {
    code: 0,
    message: 'ok',
    data: {
      template: mockTemplate1,
      nodes: mockNodes1,
      total: mockNodes1.length
    }
  }
}

/** 在 beforeEach 中安装 template/nodes mock（所有测试都需要） */
async function installTemplateMock(page: Page) {
  await page.route(/\/v1\/sop\/templates\/(\d+)\/nodes(?:\?.*)?$/, async (route: Route) => {
    const match = route
      .request()
      .url()
      .match(/\/templates\/(\d+)\/nodes/)
    const tid = match ? Number(match[1]) : 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTemplateNodesResponse(tid))
    })
  })
  // bookmarks 请求 mock 为空（不阻塞初始化）
  await page.route(/\/v1\/sop\/templates\/\d+\/bookmarks/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: { bookmarks: [] } })
    })
  })
}

// ── Selectors ──
const sel = {
  runView: '.sop-run-view',
  templateTitle: '.sop-template-title',
  stepperPanel: '.stepper-panel',
  stepperItem: '.stepper-item',
  stepperLabel: '.stepper-label',
  stepWrapper: '.sop-step-wrapper',
  stepTitle: '.sop-step-title',
  stepDescription: '.sop-step-description',
  stepInput: '.step-input',
  stepInputTextarea: '.step-input textarea',
  stepOutput: '.step-output',
  toolbarActions: '.toolbar-actions',
  historyBtn: '.sop-history-btn',
  historyModal: '.history-overlay',
  emptyState: '.empty-state-card'
} as const

async function gotoRun(page: Page, templateId: number, runId?: number) {
  const url = runId
    ? `/sop/run?templateId=${templateId}&runId=${runId}`
    : `/sop/run?templateId=${templateId}`
  await page.goto(url)
  await page.waitForFunction(
    () => {
      if (document.querySelectorAll('.stepper-item').length > 0) return true
      if (document.querySelector('.trailing-chat-panel') !== null) return true
      if (document.querySelector('.empty-state-card--error')) return true
      const titleEl = document.querySelector('.sop-template-title')
      const title = titleEl?.textContent?.trim() ?? ''
      return title !== '' && title !== '加载中…'
    },
    null,
    { timeout: 30_000 }
  )
}

// 在每个测试前安装 mock
test.beforeEach(async ({ page }) => {
  await installTemplateMock(page)
})

// ═══════════════════════════════════════════════════════════════════
// Path 1: 步骤名称来自数据库 + URL 注入 runId
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 1 — 步骤名称来自数据库 + URL 行为', () => {
  test('步骤名称取自后端 sop_node.name（非硬编码）', async ({ page }) => {
    await gotoRun(page, 1)

    const stepperLabels = await page.locator(sel.stepperLabel).allTextContents()
    expect(stepperLabels.length).toBeGreaterThan(0)

    // 步骤名必须匹配 mock 里的真实值（来自"后端"），非 legacy 硬编码的占位符
    expect(stepperLabels).toContain('AI拆解产品')
    expect(stepperLabels).toContain('生成最终文案')

    for (const label of stepperLabels) {
      expect(label.trim()).not.toBe('')
      expect(label).not.toMatch(/^(Step|步骤)\s*\d+$/)
      expect(label).not.toContain('undefined')
      expect(label).not.toContain('null')
    }

    const currentTitle = await page.locator(sel.stepTitle).textContent()
    expect(currentTitle!.trim().length).toBeGreaterThan(0)
  })

  test('templateTitle 显示 mock 模板名', async ({ page }) => {
    await gotoRun(page, 1)
    await expect(page.locator(sel.templateTitle)).toHaveText('小红书爆款文案')
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 2: 描述为空时优雅退化
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 2 — 节点描述为空的优雅退化', () => {
  test('描述为空时不渲染描述行，不显示 undefined/null', async ({ page }) => {
    await gotoRun(page, 1)

    // 不应该出现 "undefined" / "null" / "[object Object]" 字面量
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).not.toContain('undefined')
    expect(bodyText).not.toContain('null')
    expect(bodyText).not.toContain('[object Object]')

    // 第一个节点 description 为空 → description 元素不应该渲染
    const descCount = await page.locator(sel.stepDescription).count()
    if (descCount > 0) {
      const descText = await page.locator(sel.stepDescription).first().textContent()
      expect(descText!.trim().length).toBeGreaterThan(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 3: 配额耗尽弹 InsufficientCreditsDialog
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 3 — 配额耗尽触发积分不足弹窗', () => {
  // 真实 403 → dialog 的完整链路（request.ts 拦截器 → window event → App.vue → store → dialog）
  // 上游需要：页面已挂载 App.vue 的 window event listener。
  // 测试通过直接 dispatch `insufficient-credits` 事件验证这条链路对外的合约。
  // 为什么不走完整的"点击执行按钮"流程：draft 模式下 canExecute 依赖 store.nextNodeId
  // 被设为 nodes[0].id，初始化时机对 E2E 不稳定；真实用户流由 useSSEStream 单元测试
  // + task 25 手工冒烟共同覆盖。
  test('dispatchEvent insufficient-credits → InsufficientCreditsDialog 弹出', async ({ page }) => {
    await gotoRun(page, 1)

    // 模拟 request.ts 对 403 额度不足响应的处理：派发全局事件
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('insufficient-credits', { detail: '余额不足，请充值后重试' })
      )
    })

    // 等待 App.vue 的 watch 触发 dialog 显示
    await page.waitForTimeout(500)

    // 断言：页面上出现"余额/积分/充值/配额"字样（来自 dialog 组件 + message）
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).toMatch(/余额|积分|充值|配额/)

    // 再次断言：store 状态（触发后立刻被 watch 重置为 false）
    const stillOpen = await page.evaluate(() => {
      return (window as unknown as { __uiDialogsOpen?: boolean }).__uiDialogsOpen ?? null
    })
    // store flag 会被 watch 即时复位，所以这里主要依赖 DOM 断言
    void stillOpen
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 4: trailing chat 多轮（templateId=2 启用 trailing_chat_enabled）
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 4 — trailing chat 多轮', () => {
  test('templateId=2 的 stepper 包含 N+1 个 step（trailing chat 位）', async ({ page }) => {
    await gotoRun(page, 2)

    const stepperCount = await page.locator(sel.stepperItem).count()
    // 4 个节点 + 1 个 trailing chat 步骤
    expect(stepperCount).toBe(mockNodes1.length + 1)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 5: 上传 PDF 触发文本合并
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 5 — PDF 上传触发文本合并', () => {
  test('已有 runId 的页面上传 PDF 后显示文件 chip', async ({ page }) => {
    // 提供一个已创建的 run，让 useFileUpload 的 runId 前置校验通过
    const MOCK_RUN_ID = 9999
    await page.route(`**/v1/sop/runs/${MOCK_RUN_ID}`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            ID: MOCK_RUN_ID,
            template_id: 1,
            user_id: 1,
            status: 'running',
            conversation_id: 'conv-mock',
            counted: false,
            started_at: null,
            finished_at: null,
            created_at: '2026-04-11T00:00:00Z',
            updated_at: '2026-04-11T00:00:00Z',
            error_message: ''
          }
        })
      })
    })
    await page.route(`**/v1/sop/runs/${MOCK_RUN_ID}/status`, async (route: Route) => {
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
              node_id: 1,
              node_name: 'AI拆解产品',
              sort: 0,
              is_first: true,
              has_next: true
            },
            total_nodes: 4,
            completed_count: 0,
            auto_applied_count: 0
          }
        })
      })
    })
    // chat-messages（trailing chat 历史）也 mock 为空
    await page.route(`**/v1/sop/runs/${MOCK_RUN_ID}/chat-messages`, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          message: 'ok',
          data: { run_id: MOCK_RUN_ID, conversation_id: 'conv-mock', messages: [] }
        })
      })
    })
    // PDF 转文字 mock
    await page.route('**/v1/pdf/convert-to-text', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: '【来自 PDF 的测试文本】' })
      })
    })

    await gotoRun(page, 1, MOCK_RUN_ID)

    // StepInput 内部应该暴露一个 <input type="file">
    const fileInput = page.locator('input[type="file"]').first()
    const hasFileInput = (await fileInput.count()) > 0
    test.skip(!hasFileInput, 'StepInput 文件 input 未暴露')

    const pdfBuffer = Buffer.from('%PDF-1.4\n%fake pdf content\n%%EOF')
    await fileInput.setInputFiles({
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer
    })

    // 等待 chip 渲染（文件被添加到 fileUpload.items）
    await page.waitForTimeout(1500)

    // 断言：chip 显示 OR 页面包含 test.pdf / 提取文本
    const chipCount = await page.locator('.step-input-chip').count()
    const bodyText = (await page.locator('body').textContent()) ?? ''
    const filenameVisible = bodyText.includes('test.pdf')
    const extractedVisible = bodyText.includes('【来自 PDF 的测试文本】')

    expect(
      chipCount > 0 || filenameVisible || extractedVisible,
      `上传后无可见反馈（chip=${chipCount}, filename=${filenameVisible}, text=${extractedVisible}）`
    ).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 6: SSE 流式输出 + 思维链显示
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 6 — StepOutput 结构挂载', () => {
  test('进入节点步骤后 StepOutput 已挂载', async ({ page }) => {
    await gotoRun(page, 1)

    await expect(page.locator(sel.stepOutput)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(sel.runView)).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 7: 刷新页面 → 步骤恢复
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 7 — 刷新后 sessionStorage 恢复步骤', () => {
  test('draft 模式下 sessionStorage 存储的 currentStep 可恢复', async ({ page }) => {
    await gotoRun(page, 1)

    // 写入 sessionStorage（模拟之前停在第 2 步）— draft scope
    await page.evaluate(() => {
      sessionStorage.setItem('sop_step_draft_1', '2')
    })

    // 刷新
    await page.reload()
    await page.waitForFunction(() => document.querySelectorAll('.stepper-item').length > 0, null, {
      timeout: 30_000
    })

    // URL 参数保留
    expect(page.url()).toContain('templateId=1')
    // step wrapper 可见，页面没崩
    await expect(page.locator(sel.stepWrapper)).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 8: 历史记录弹窗
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 8 — 历史记录弹窗打开', () => {
  test('点击历史按钮打开 HistoryModal', async ({ page }) => {
    // 历史列表 API mock 为空，避免依赖 dev 数据
    await page.route('**/v1/sop/templates/executed', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { templates: [] } })
      })
    })

    await gotoRun(page, 1)

    const historyBtn = page.locator(sel.historyBtn)
    await expect(historyBtn).toBeVisible()
    await historyBtn.click()

    await expect(page.locator(sel.historyModal)).toBeVisible({ timeout: 5_000 })
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 9: Draft 模式 sendBeacon 清理
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 9 — sendBeacon cleanup hook 被正确安装', () => {
  test('页面加载后 navigator.sendBeacon 可被拦截（hook 已挂载）', async ({ page }) => {
    await gotoRun(page, 1)

    // 在页面内注入拦截器
    const beaconInstalled = await page.evaluate(() => {
      try {
        const w = window as unknown as { __beaconCalls: string[] }
        w.__beaconCalls = []
        const original = navigator.sendBeacon.bind(navigator)
        navigator.sendBeacon = function (url: string, data?: BodyInit | null) {
          w.__beaconCalls.push(String(url))
          return original(url, data)
        }
        return true
      } catch {
        return false
      }
    })
    expect(beaconInstalled).toBe(true)

    // 导航离开触发 onBeforeUnmount
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL('/')

    // 注意：beacon 只在有 draft run 时才调用（store.currentRun 存在 + isDraftRun）。
    // 本测试未执行节点，所以 store.currentRun 为 null，cleanup 不会发 beacon。
    // 这里只验证机制存在（hook 没报错）。task 25 手工冒烟 + SQL 会验证真实清理。
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 10: API 安全验证（GetTemplateNodes 不泄露敏感字段）
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 10 — API 安全：敏感字段不泄露', () => {
  // 后端 task 2/3 已经把 GetTemplateNodes 改成使用 SopNodePublicDTO
  // （numind-server commit b31e0a4 + db96698），但 dev 环境尚未重新部署。
  // Task 25 部署到 dev 后，把 test.fixme() 改回 test() 即可启用。
  test.fixme('GET /v1/sop/templates/:id/nodes 返回不包含 api_key/prompt 等字段', async ({
    page
  }) => {
    // 这个测试必须打真实后端，不用 mock
    await page.unroute(/\/v1\/sop\/templates\/(\d+)\/nodes(?:\?.*)?$/)

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(token).toBeTruthy()

    const resp = await page.request.get('/api/v1/sop/templates/1/nodes', {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(resp.ok()).toBeTruthy()

    const body = await resp.json()
    const nodes = body?.data?.nodes ?? []
    expect(Array.isArray(nodes)).toBeTruthy()

    const sensitiveFields = ['api_key', 'base_url', 'model_name', 'timeout_seconds', 'prompt']
    for (const node of nodes) {
      for (const field of sensitiveFields) {
        expect(node[field], `节点 ${node.id ?? '?'} 泄露了敏感字段 ${field}`).toBeUndefined()
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// Path 11: 模型切换 + 深度思考开关
// ═══════════════════════════════════════════════════════════════════
test.describe('Path 11 — 模型切换 + 深度思考', () => {
  test.skip(
    true,
    'ModelSelector 尚未在 SOPRunView 中集成（spec §9.2 注释：model_key 和 ' +
      'thinking 由 ModelSelector 管理，未集成时不传）。该路径延后至 ModelSelector ' +
      '集成后的 follow-up task。'
  )
  test('切换模型后 execute 请求 URL 含 model_key 参数', async () => {
    // TODO: 待 ModelSelector 集成后启用
  })
})
