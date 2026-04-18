/**
 * MSW handlers — Phase 1 Track E mocks for credits-system feature.
 *
 * Provides fixture responses for:
 *   - GET  /v1/credits/balance   → {@link QuotaBreakdown}（含 v3 新增字段 billing_mode 等）
 *   - POST /v1/credits/estimate  → {@link EstimateResp}
 *   - GET  /v1/credits/packages  → {@link ListPackagesResp}
 *
 * ## 为什么存在
 *
 * 本 track 与后端同步开发：后端 `/v1/credits/estimate` 尚未实装，前端组件
 * 无法等到 Phase 2 集成才调试。MSW 让前端组件可以用固定契约独立开发/测试，
 * Phase 2.4 接线时仅需切掉 mock（或由 worker 在生产构建里被 tree-shake）。
 *
 * ## Response 包装
 *
 * 现有 `src/api/request.ts` 的响应拦截器会检查 `{ code: 0 | 200, message, data }`
 * 包装。MSW 响应必须遵循同一 envelope，否则拦截器会报 "API响应格式异常"。
 *
 * ## 如何启用
 *
 * - **浏览器端** (S5 开发 / Playwright)：在 main.ts 入口动态 import 本文件并启动
 *   service worker（详见 MSW 官方 `setupWorker`）。生产环境不启用。
 * - **单元测试** (Vitest)：用 `setupServer` 在测试环境启动 Node 拦截器。测试
 *   文件自行构造 server + handlers，不直接 import 本文件——这样 handlers 的
 *   导出可被测试 override。
 *
 * ## 契约来源
 *
 * spec §2.11.1（QuotaBreakdown）+ §4.2.1（TS 类型）+ §4.3（estimate 聚合口径）
 */
import { http, HttpResponse } from 'msw'
import type { QuotaBreakdown, EstimateResp, ListPackagesResp } from '@/api/credits'

/** 统一的成功 envelope（对齐 `request.ts` 的 `{ code, message, data }` 解包）。 */
function ok<T>(data: T) {
  return HttpResponse.json({ code: 0, message: 'ok', data })
}

/** 默认 balance fixture — credits 模式正式会员。 */
export const defaultBalance: QuotaBreakdown = {
  balance: 1200,
  sub_total: 1000,
  sub_remain: 700,
  booster_total: 500,
  booster_remain: 500,
  billing_mode: 'credits',
  remaining_runs: null,
  monthly_limit: null,
  sub_expires_at: '2026-04-30T23:59:59Z',
  booster_earliest_expires_at: '2026-07-15T23:59:59Z'
}

/** 默认 estimate fixture — 单 node SOP。 */
export const defaultEstimate: EstimateResp = {
  total_estimated_credits: 25,
  first_node_estimate: 25,
  node_count: 1,
  sufficient: true,
  skip_deduction: false,
  balance: defaultBalance,
  coefficient_id: 1
}

/** 默认 packages fixture — 空列表（避免强耦合后端语义）。 */
export const defaultPackages: ListPackagesResp = {
  list: [],
  total: 0
}

export const handlers = [
  http.get('*/v1/credits/balance', () => ok(defaultBalance)),
  http.post('*/v1/credits/estimate', () => ok(defaultEstimate)),
  http.get('*/v1/credits/packages', () => ok(defaultPackages))
]
