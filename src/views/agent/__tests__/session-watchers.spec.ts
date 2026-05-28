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
  // Contract: a 'new' → real-uuid transition MUST NOT call loadSnapshot.
  it('reproduce: new → real-uuid transition does not call loadSnapshot', async () => {
    await handleSessionIdTransition('42e277c7-6471-4d39-8866-e65bbbd7e016', 'new', {
      loadSnapshot,
      resetLocal,
      readOnly: false
    })
    expect(loadSnapshot).not.toHaveBeenCalled()
    expect(resetLocal).not.toHaveBeenCalled()
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
