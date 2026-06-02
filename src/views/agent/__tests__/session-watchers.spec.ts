/**
 * session-watchers.spec.ts — unit tests for the AgentChatView session-id
 * transition handler. Includes a reproducing test for the 2026-05-28 bug
 * (agent_run 45 / "all bubbles disappear during streaming").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSessionIdTransition } from '../session-watchers'

describe('handleSessionIdTransition', () => {
  let loadSnapshot: ReturnType<typeof vi.fn>
  let resetLocal: ReturnType<typeof vi.fn>

  beforeEach(() => {
    loadSnapshot = vi.fn(async () => {})
    resetLocal = vi.fn()
  })

  // REPRODUCES BUG (2026-05-28): user sees AI thinking, then "page reloads" and
  // all bubbles vanish. Root cause: SSE terminal → reconcileFromDB sets
  // currentRun → watcher router.replace(`/chat/<uuid>`) → sessionId 'new' →
  // <uuid> → previous code called loadSnapshot which clobbered the streaming
  // store.messages with an empty backend snapshot (DB hadn't persisted
  // messages yet because of the controller's pre-finalize ctx cancel).
  //
  // Contract (post-621ab4a): the new→uuid skip is CONDITIONAL on an active
  // stream/run — a manual new→uuid click with no active run SHOULD load the
  // snapshot, but the mid-stream auto URL-replace MUST NOT. The original test
  // passed no isStreaming/isRunning flags (→ undefined → load branch), so it
  // went stale red on develop once 621ab4a added the gating; both branches are
  // asserted below. (agent-stream-interactivity T1 also makes isRunning true
  // during streaming, reinforcing this guard.)
  it('reproduce: new → real-uuid MID-STREAM does not call loadSnapshot', async () => {
    await handleSessionIdTransition('42e277c7-6471-4d39-8866-e65bbbd7e016', 'new', {
      loadSnapshot,
      resetLocal,
      readOnly: false,
      isStreaming: true,
      isRunning: false
    })
    expect(loadSnapshot).not.toHaveBeenCalled()
    expect(resetLocal).not.toHaveBeenCalled()
  })

  it('new → real-uuid while a run is active (not streaming) also skips loadSnapshot', async () => {
    await handleSessionIdTransition('42e277c7-6471-4d39-8866-e65bbbd7e016', 'new', {
      loadSnapshot,
      resetLocal,
      readOnly: false,
      isStreaming: false,
      isRunning: true
    })
    expect(loadSnapshot).not.toHaveBeenCalled()
  })

  it('new → real-uuid with NO active stream/run (manual switch) loads the snapshot', async () => {
    await handleSessionIdTransition('42e277c7-6471-4d39-8866-e65bbbd7e016', 'new', {
      loadSnapshot,
      resetLocal,
      readOnly: false,
      isStreaming: false,
      isRunning: false
    })
    expect(loadSnapshot).toHaveBeenCalledWith('42e277c7-6471-4d39-8866-e65bbbd7e016', false)
  })

  it('normal session switch (uuid → uuid) calls loadSnapshot with new id', async () => {
    await handleSessionIdTransition('bbb-new', 'aaa-old', {
      loadSnapshot,
      resetLocal,
      readOnly: false
    })
    expect(loadSnapshot).toHaveBeenCalledOnce()
    expect(loadSnapshot).toHaveBeenCalledWith('bbb-new', false)
    expect(resetLocal).not.toHaveBeenCalled()
  })

  it('initial mount (undefined → uuid) calls loadSnapshot', async () => {
    await handleSessionIdTransition('aaa', undefined, {
      loadSnapshot,
      resetLocal,
      readOnly: false
    })
    expect(loadSnapshot).toHaveBeenCalledOnce()
    expect(loadSnapshot).toHaveBeenCalledWith('aaa', false)
  })

  it('any → "new" transition calls resetLocal (and NOT loadSnapshot)', async () => {
    await handleSessionIdTransition('new', 'aaa', {
      loadSnapshot,
      resetLocal,
      readOnly: false
    })
    expect(resetLocal).toHaveBeenCalledOnce()
    expect(loadSnapshot).not.toHaveBeenCalled()
  })

  it('readOnly flag forwards through to loadSnapshot', async () => {
    await handleSessionIdTransition('aaa', 'bbb', {
      loadSnapshot,
      resetLocal,
      readOnly: true
    })
    expect(loadSnapshot).toHaveBeenCalledWith('aaa', true)
  })
})
