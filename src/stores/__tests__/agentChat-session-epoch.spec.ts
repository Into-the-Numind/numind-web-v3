/**
 * Regression coverage for session replacement while an Agent run is still
 * observed.  A route switch must make every pending request and stream frame
 * from the prior session inert; otherwise a completed Feishu authorization in
 * session A can overwrite the history the user just opened in session B.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAgentChatStore } from '../agentChat'
import type { AgentRun, SessionSnapshot } from '@/types/agent'
import type { AgentStreamEvent } from '@/types/agent-stream'

vi.mock('@/api/agent', () => ({
  listAvailableAgents: vi.fn(async () => ({ list: [], total: 0 })),
  listAllHistorySessions: vi.fn(async () => []),
  getSessionSnapshot: vi.fn(),
  getRun: vi.fn(),
  fetchNarrationEvents: vi.fn(async () => []),
  createRun: vi.fn(),
  cancelRun: vi.fn(),
  estimateRun: vi.fn(),
  uploadAttachment: vi.fn(),
  deleteSession: vi.fn(),
  renameSession: vi.fn(),
  pinSession: vi.fn()
}))

vi.mock('@/api/feishu', () => ({
  resumeFeishuOperation: vi.fn()
}))

import * as api from '@/api/agent'
import * as feishuAPI from '@/api/feishu'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function snapshot(sessionID: string, run?: AgentRun): SessionSnapshot {
  return {
    session_id: sessionID,
    agent_skill_id: 1,
    messages: [
      {
        id: `history-${sessionID}`,
        type: 'system',
        system_subtype: 'restored',
        markdown: `history ${sessionID}`,
        timestamp: '2026-07-15T00:00:00Z'
      }
    ],
    agent_run_ids: run ? [run.id] : [],
    last_active_at: '',
    status: run?.status ?? 'completed',
    ...(run ? { run } : {})
  }
}

function activeRun(id: number, sessionID: string): AgentRun {
  return {
    id,
    session_id: sessionID,
    user_id: 1,
    agent_skill_id: 1,
    status: 'running',
    state_reason: 'external_resume_ready',
    created_at: '',
    updated_at: ''
  }
}

function streamEvent(
  type: AgentStreamEvent['type'],
  runID: number,
  data?: unknown
): AgentStreamEvent {
  return {
    type,
    run_id: runID,
    seq: 1,
    ts: '2026-07-15T00:00:00Z',
    data
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.useFakeTimers()
})

describe('agentChat session epoch', () => {
  it('keeps the newer snapshot when an older session request resolves last', async () => {
    const oldSnapshot = deferred<SessionSnapshot>()
    vi.mocked(api.getSessionSnapshot)
      .mockReturnValueOnce(oldSnapshot.promise)
      .mockResolvedValueOnce(snapshot('session-b'))
    const store = useAgentChatStore()

    const loadA = store.loadSessionSnapshot('session-a', false)
    const loadB = store.loadSessionSnapshot('session-b', false)
    await loadB
    oldSnapshot.resolve(snapshot('session-a'))
    await loadA

    expect(store.messages).toContainEqual(expect.objectContaining({ markdown: 'history session-b' }))
    expect(store.messages).not.toContainEqual(expect.objectContaining({ markdown: 'history session-a' }))
    expect(store.loadingSnapshot).toBe(false)
  })

  it('makes a queued observer from A inert after switching to B', async () => {
    const oldRun = activeRun(101, 'session-a')
    vi.mocked(api.getSessionSnapshot)
      .mockResolvedValueOnce(snapshot('session-a', oldRun))
      .mockResolvedValueOnce(snapshot('session-b'))
    const getOldRun = deferred<AgentRun>()
    vi.mocked(api.getRun).mockReturnValueOnce(getOldRun.promise)
    const store = useAgentChatStore()

    await store.loadSessionSnapshot('session-a', false)
    const epochA = store.currentSessionEpoch()
    store.applyStreamEvent(
      streamEvent('external_action', oldRun.id, {
        provider: 'feishu',
        operation_id: 'op-a',
        session_id: 'session-a',
        phase: 'user_auth',
        url: 'https://safe.example/a',
        expires_at: '2026-07-15T00:01:00Z'
      }),
      epochA
    )
    expect(store.isWaitingForExternalAction).toBe(true)

    const refreshingA = store.refreshRunStatus()
    await store.loadSessionSnapshot('session-b', false)
    getOldRun.resolve({
      ...oldRun,
      status: 'completed',
      state_reason: 'completed',
      final_output: 'old A must not appear'
    })
    await refreshingA

    expect(store.currentRun).toBeNull()
    expect(store.messages).toContainEqual(expect.objectContaining({ markdown: 'history session-b' }))
    expect(store.messages).not.toContainEqual(expect.objectContaining({ markdown: 'old A must not appear' }))
    expect(store.messages).not.toContainEqual(expect.objectContaining({ operation_id: 'op-a' }))
    expect(store.isWaitingForExternalAction).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects delayed A terminal and authorization frames after B owns the store', async () => {
    const store = useAgentChatStore()
    store.beginSession('session-a')
    const epochA = store.currentSessionEpoch()
    store.applyStreamEvent(streamEvent('stream_start', 101), epochA)

    store.beginSession('session-b')
    const epochB = store.currentSessionEpoch()
    store.applyStreamEvent(streamEvent('stream_start', 202), epochB)

    store.applyStreamEvent(streamEvent('terminal', 101, { reason: 'completed' }), epochA)
    store.applyStreamEvent(
      streamEvent('external_action', 101, {
        provider: 'feishu',
        operation_id: 'op-a',
        session_id: 'session-a',
        phase: 'user_auth',
        url: 'https://safe.example/a',
        expires_at: '2026-07-15T00:01:00Z'
      }),
      epochA
    )

    expect(store.currentRun).toMatchObject({ id: 202, status: 'running' })
    expect(store.messages).toHaveLength(0)
    expect(store.isWaitingForExternalAction).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not let a delayed A authorization response revive its URL in B', async () => {
    const oldRun = activeRun(101, 'session-a')
    vi.mocked(api.getSessionSnapshot)
      .mockResolvedValueOnce(snapshot('session-a', oldRun))
      .mockResolvedValueOnce(snapshot('session-b'))
    const delayedResume = deferred<Awaited<ReturnType<typeof feishuAPI.resumeFeishuOperation>>>()
    vi.mocked(feishuAPI.resumeFeishuOperation).mockReturnValueOnce(delayedResume.promise)
    const store = useAgentChatStore()

    await store.loadSessionSnapshot('session-a', false)
    const epochA = store.currentSessionEpoch()
    store.applyStreamEvent(
      streamEvent('external_action', oldRun.id, {
        provider: 'feishu',
        operation_id: 'op-a',
        session_id: 'session-a',
        phase: 'user_auth',
        url: 'https://safe.example/a',
        expires_at: '2026-07-15T00:01:00Z'
      }),
      epochA
    )

    const resumingA = store.resumeFeishuOperation('op-a')
    await store.loadSessionSnapshot('session-b', false)
    delayedResume.resolve({
      operation_id: 'op-a',
      state: 'waiting_user_auth',
      action: {
        operation_id: 'op-a',
        session_id: 'session-a',
        phase: 'user_auth',
        expires_at: '2026-07-15T00:02:00Z'
      }
    })
    await resumingA

    expect(store.messages).toContainEqual(expect.objectContaining({ markdown: 'history session-b' }))
    expect(store.messages).not.toContainEqual(expect.objectContaining({ operation_id: 'op-a' }))
    expect(store.isWaitingForExternalAction).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('invalidates an in-flight observer when the chat view unmounts/reset', async () => {
    const oldRun = activeRun(101, 'session-a')
    const delayedRun = deferred<AgentRun>()
    vi.mocked(api.getRun).mockReturnValueOnce(delayedRun.promise)
    const store = useAgentChatStore()
    store.beginSession('session-a')
    const epochA = store.currentSessionEpoch()
    store.applyStreamEvent(streamEvent('stream_start', oldRun.id), epochA)

    const refreshingA = store.refreshRunStatus()
    store.reset() // AgentChatView's unmount cleanup calls this same boundary.
    delayedRun.resolve({
      ...oldRun,
      status: 'completed',
      state_reason: 'completed',
      final_output: 'must not revive after unmount'
    })
    await refreshingA

    expect(store.currentRun).toBeNull()
    expect(store.messages).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
