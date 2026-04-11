/**
 * useDraftLifecycle — SOP Run Draft 生命周期管理
 *
 * ## 状态机（基于后端实测，task 1 research §5.1）
 *
 * ```
 * [未进入页面]
 *     │
 *     │ 用户点击 SOP 模板进入 /sop?templateId=X
 *     ↓
 * [前端本地 draft]
 *     │ - currentRunId = null
 *     │ - localStorage key pattern: sop_input_draft_<templateId>_<inputId>
 *     │
 *     │ enterDraftMode(templateId) 调用
 *     ↓
 * [等待首次执行]
 *     │
 *     │ 首次点击"执行"按钮 → lazyCreateRun(text)
 *     ↓
 * [后端创建 status='draft' 的 run]
 *     │ - POST /v1/sop/runs
 *     │ - 后端返回 run.id（draft 状态）
 *     │ - migrateLocalStorageKeys: draft_<tid> → <runId>
 *     │ - currentRunId 赋值
 *     │
 *     │ 节点执行成功 → biz 层 IncrementSopRunCount
 *     ↓
 * [running / succeeded]
 *     │ 组件卸载 / 路由切换
 *     ↓
 * [Beacon 清理]
 *     │ - navigator.sendBeacon(
 *     │     `POST /v1/sop/runs/<id>/draft?token=<jwt>`
 *     │   )
 *     │ - 后端 DeleteDraftRun **仅删 status='draft' 的 run**
 *     │ - 已转 running/succeeded 的 run 不动
 *     │
 *     └─→ 清理结束
 * ```
 *
 * ## 关键决策
 *
 * - **isDraftRun 判断**：由 sopRun store 的 `currentRun.status === 'draft'`
 *   决定（不是 pending+counted=false 组合）。useDraftLifecycle 只做生命周期
 *   管理，不判断状态。
 * - **Beacon token 通过 query 传递**：navigator.sendBeacon 无法设置 Authorization
 *   header，后端 task 4 已为 POST /sop/runs/:id/draft 独立路由 OptionalAuthMiddleware
 *   + controller 从 ?token= query 提取。
 * - **localStorage key 迁移**：Draft 期间用 `sop_input_draft_<templateId>_<inputId>`，
 *   升级为 run 后迁移到 `sop_input_<runId>_<inputId>`，保留用户已输入内容。
 * - **cleanupDraft 仅对 draft 状态生效**：非 draft 的 run 不会触发 beacon（本地
 *   防御 + 后端二次防御），避免误删活跃 run。
 *
 * ## 使用方式
 *
 * ```ts
 * const draft = useDraftLifecycle()
 * const store = useSopRunStore()
 *
 * onMounted(() => {
 *   if (runId) {
 *     // 现有 run 加载路径，不涉及 draft
 *   } else {
 *     draft.enterDraftMode(templateId)
 *   }
 * })
 *
 * async function handleFirstExecute(text: string) {
 *   const run = await draft.lazyCreateRun(templateId, text)
 *   store.currentRun = run
 *   // 然后继续执行节点...
 * }
 *
 * onBeforeUnmount(() => {
 *   if (store.isDraftRun && store.currentRun) {
 *     draft.cleanupDraft(store.currentRun.id)
 *   }
 * })
 * ```
 *
 * 详见 spec §5.1 + task 1 research §3
 */
import { ref } from 'vue'
import { createRun, type CreateRunResponse } from '@/api/sop'

/** localStorage key 前缀 */
const DRAFT_KEY_PREFIX = 'sop_input_draft_'
const RUN_KEY_PREFIX = 'sop_input_'

/** token 存储位置（与 src/api/request.ts 和 legacy 兼容） */
function getAuthToken(): string {
  return localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
}

/**
 * 构建 API base URL（用于 sendBeacon，因为它不走 axios）。
 *
 * 与 src/api/request.ts 的 normalizeBaseURL 行为一致：默认 /api。
 */
function getApiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (!raw) return '/api'
  if (/\/dev\/?$/i.test(raw) || /youshu\.asia\/dev\/?$/i.test(raw)) return '/api'
  return raw.replace(/\/$/, '')
}

export interface UseDraftLifecycleReturn {
  /** 当前纯前端 draft 模式的 templateId（尚未创建后端 run 时非 null） */
  draftTemplateId: ReturnType<typeof ref<number | null>>

  /** 进入纯前端 draft 模式（不调用后端 API） */
  enterDraftMode: (templateId: number) => void

  /** Lazy 创建后端 run，返回 CreateRunResponse */
  lazyCreateRun: (templateId: number, text?: string) => Promise<CreateRunResponse>

  /**
   * 把 localStorage 中 `sop_input_draft_<templateId>_*` 的所有 key 迁移到
   * `sop_input_<runId>_*`，保留用户已输入的内容。
   */
  migrateLocalStorageKeys: (templateId: number, runId: number) => void

  /**
   * 通过 navigator.sendBeacon 发送 POST /v1/sop/runs/:id/draft?token=xxx
   * 触发后端清理 draft run。
   *
   * 仅在 sendBeacon 可用时调用（SSR 或旧浏览器需要防御）。
   * 后端 DeleteDraftRun 会二次验证 status='draft'，非 draft 不会被删。
   */
  cleanupDraft: (runId: number) => boolean
}

export function useDraftLifecycle(): UseDraftLifecycleReturn {
  const draftTemplateId = ref<number | null>(null)

  function enterDraftMode(templateId: number): void {
    draftTemplateId.value = templateId
    // 纯前端状态，不调用任何 API
  }

  async function lazyCreateRun(templateId: number, text: string = ''): Promise<CreateRunResponse> {
    const run = await createRun({
      template_id: templateId,
      text,
      auto_apply_bookmarks: true
    })
    // 迁移 localStorage 中的 draft 输入到 run id 命名空间
    migrateLocalStorageKeys(templateId, run.id)
    // 退出纯前端 draft 模式（后端已有 run 记录）
    draftTemplateId.value = null
    return run
  }

  function migrateLocalStorageKeys(templateId: number, runId: number): void {
    const draftPrefix = `${DRAFT_KEY_PREFIX}${templateId}_`
    const runPrefix = `${RUN_KEY_PREFIX}${runId}_`
    // 遍历 localStorage 所有 key，找出 draft 前缀的
    const keysToMigrate: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(draftPrefix)) {
        keysToMigrate.push(key)
      }
    }
    // 迁移值 + 删除旧 key
    for (const oldKey of keysToMigrate) {
      const value = localStorage.getItem(oldKey)
      if (value === null) continue
      const inputId = oldKey.slice(draftPrefix.length)
      const newKey = `${runPrefix}${inputId}`
      localStorage.setItem(newKey, value)
      localStorage.removeItem(oldKey)
    }
  }

  function cleanupDraft(runId: number): boolean {
    // sendBeacon 在测试环境 / 旧浏览器 / SSR 下可能不存在
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return false
    }
    const token = getAuthToken()
    if (!token) return false

    const url = `${getApiBaseURL()}/v1/sop/runs/${runId}/draft?token=${encodeURIComponent(token)}`
    // sendBeacon 默认 POST，body 为 null 也可以
    return navigator.sendBeacon(url)
  }

  return {
    draftTemplateId,
    enterDraftMode,
    lazyCreateRun,
    migrateLocalStorageKeys,
    cleanupDraft
  }
}
