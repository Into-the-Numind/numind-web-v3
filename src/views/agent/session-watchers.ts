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
  /** Pull persisted messages for an existing session UUID (clobbers store.messages). */
  loadSnapshot: (sessionId: string, readOnly: boolean) => Promise<void>
  /** Clear all local chat state — only called when entering a fresh "new" route. */
  resetLocal: () => void
  /** Forwarded to loadSnapshot. */
  readOnly: boolean
}

/**
 * Handle a `props.sessionId` change in AgentChatView.
 *
 * Transition rules:
 *  - any → 'new'        : reset local state (fresh chat starting)
 *  - 'new' → real UUID  : SKIP loadSnapshot (server just assigned an id during
 *                          streaming; local SUI is SoT until terminal completes
 *                          + DB has authoritative messages)
 *  - uuidA → uuidB      : loadSnapshot for uuidB (normal session switch)
 *  - undefined → uuid   : loadSnapshot (initial mount, no transition guard)
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
    // 'new' → real-uuid: SSE terminal → reconcileFromDB → store.currentRun set
    // → watcher fired router.replace, so we're here mid-stream. The streaming
    // UI is the SoT; calling loadSnapshot would clobber the still-rendering
    // messages with an empty backend snapshot (DB persistence races finalizeRun).
    // The next true session switch (uuid → uuid) will load the snapshot normally.
    return
  }
  await deps.loadSnapshot(newSessionId, deps.readOnly)
}
