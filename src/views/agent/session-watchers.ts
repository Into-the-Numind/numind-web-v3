/**
 * session-watchers.ts — pure handler for AgentChatView's sessionId-route-param
 * change. Extracted from inline `watch(...)` so the new→uuid race-guard can be
 * unit-tested without mounting the component.
 *
 * Spec: see bug analysis 2026-05-28 (agent_run 45) — when a "new" session
 * receives its real UUID mid-stream (via reconcileFromDB → currentRun.value
 * → router.replace), the existing snapshot loader would clobber the still-
 * streaming UI with an empty backend snapshot. This handler explicitly skips
 * the snapshot load on a new→uuid transition; the streaming UI is the
 * source of truth in that window.
 */

export interface SessionTransitionDeps {
  /** 拉取已持久化消息的历史快照 (会覆盖 store.messages) */
  loadSnapshot: (sessionId: string, readOnly: boolean) => Promise<void>
  /** 清空本地所有聊天状态 — 仅在进入全新 "new" 路由时被调用 */
  resetLocal: () => void
  /** 传给 loadSnapshot */
  readOnly: boolean
  /** 当前是否处于 SSE 流式传输中 */
  isStreaming: boolean
  /** 当前是否有活跃的 Agent 任务在运行 */
  isRunning: boolean
}

/**
 * 处理 AgentChatView 路由参数 props.sessionId 改变时的状态流转。
 *
 * 状态机转换规则：
 *  - any → 'new'        : 重置本地状态 (开启新会话)
 *  - 'new' → 真实 UUID  : 仅在流式响应中自动替换 URL 时跳过 loadSnapshot。
 *                          (因为本地流式 UI 已承载了最新消息, 防止被后端未完全落库的空快照截断覆盖)。
 *                          如果是手动直接点击切换，则必须执行 loadSnapshot 加载历史。
 *  - uuidA → uuidB      : loadSnapshot 加载 uuidB 历史记录 (常规会话切换)
 *  - undefined → uuid   : loadSnapshot (首次加载挂载)
 */
export async function handleSessionIdTransition(
  newSessionId: string,
  oldSessionId: string | undefined,
  deps: SessionTransitionDeps
): Promise<void> {
  if (newSessionId === 'new') {
    deps.resetLocal()
    return
  }
  if (oldSessionId === 'new') {
    // 仅在当前正处于流式输出响应或后台运行任务时，才安全跳过快照加载
    if (deps.isStreaming || deps.isRunning) {
      return
    }
  }
  await deps.loadSnapshot(newSessionId, deps.readOnly)
}
