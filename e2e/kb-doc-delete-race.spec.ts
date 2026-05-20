/**
 * Regression: KB 文档删除后被轮询 fetchKBDetail 的 stale 响应覆写回 UI
 *
 * Root cause: KnowledgeBaseDetail.vue 上传文件后启动每秒一次轮询，
 *   - 用户点删除 → DELETE + loadDetail 同步完成（detail 已更新为不含该文档）
 *   - 但删除之前已发出的轮询 fetchKBDetail 仍 in-flight，其响应包含被删文档
 *   - 该响应后到达，`if (res) detail.value = res` 会用旧快照覆写 detail
 *   → 已删除的文档"复活"出现在 UI 上
 *
 * Fix: 删除 action 开头 stopPolling()，loadDetail 后 schedulePoll()（自检 hasPendingDocs，
 *   若已无 pending 文档则不重启）。
 *
 * 本 spec 用 route interception 制造确定性的乱序：让第 2 次 GET 详情（来自轮询）的响应
 * 被 hold 到 DELETE 后才放行，复现 stale 覆写场景。若 fix 失效，文档会在删除后重新出现；
 * 若 fix 生效，stopPolling 取消了那次轮询的副作用，文档保持删除状态。
 *
 * 注：本 spec 由 Micro 节奏下编写，提交时未跑通 dev server 实测（用户选择跳过现场验证）。
 * 上线 / next dev cycle 跑 `npm run test:e2e -- kb-doc-delete-race` 时若失败，先检查
 * 选择器是否匹配当下的 UI（知识库列表/详情页结构），再判断逻辑回归。
 */

import { test, expect } from '@playwright/test'

test.describe
  .skip('kb-doc-delete-race (manual run only — selectors may need tweaking for current UI)', () => {
  test('stale poll response must not resurrect deleted document', async ({ page, context }) => {
    // 用 route interception 强制让第 2 次 GET 详情（轮询那次）的响应延后
    let getCount = 0
    let releaseStaleResponse: (() => void) | null = null

    await context.route('**/v1/config/knowledge-bases/*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      getCount += 1
      if (getCount === 2) {
        // 这次是上传后第一轮轮询的请求，hold 住直到 fix 注册过 stopPolling
        await new Promise<void>((resolve) => {
          releaseStaleResponse = resolve
          // 安全网：3 秒后兜底放行，避免测试卡死
          setTimeout(resolve, 3000)
        })
      }
      await route.continue()
    })

    await page.goto('/config/knowledge-bases')

    // 选第一张知识库卡片（前置：账户里至少有一个 KB；CI 准备期可加 setup fixture 建一个）
    await page.locator('[data-test="kb-card"]').first().click()

    // 上传一个最小 txt
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'race.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })

    // 等文档行出现
    const docRow = page.locator('tbody tr', { hasText: 'race.txt' })
    await expect(docRow).toHaveCount(1)

    // 点击移除
    await docRow.locator('button:has-text("移除")').click()
    // 确认弹窗里的 移除
    await page.locator('[role="dialog"], .modal').locator('button:has-text("移除")').click()

    // 等 DELETE + loadDetail 跑完
    await expect(docRow).toHaveCount(0, { timeout: 5000 })

    // 放行 stale 轮询响应（模拟"旧响应迟到"）
    releaseStaleResponse?.()

    // 关键断言：1.5s 后文档仍不应出现（若没 stopPolling fix，stale 响应会让它复活）
    await page.waitForTimeout(1500)
    await expect(docRow).toHaveCount(0)
  })
})
