/**
 * agentChat-resume.spec.ts — reproduces dev run 148 (2026-06-12): the
 * answer-resume false-终态 bug.
 *
 * After the user answers an ask_user_question, the backend row reads
 * status='terminated' + state_reason='running' (AnswerAndClear flips
 * state_reason but historically not status; the detached resume runner never
 * corrected it either). The store's terminal check looked at status alone, so
 * one poll after answering it pushed the PRE-QUESTION prose (final_output
 * synthesized from the last assistant turn) as a final_answer and stopped
 * following — while the backend kept working for 8.5 minutes and delivered the
 * real report to nobody.
 *
 * Contract under test: state_reason='running' is the resume signature — the
 * run is ACTIVE no matter what status says. No final_answer, keep polling.
 * Permanent regression protection (NDF Rule 11).
 */
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAgentChatStore } from '../agentChat'
import type { AgentRun } from '@/types/agent'
import type { TerminalEvent } from '@/types/agent-stream'

vi.mock('@/api/agent', () => ({
  listAvailableAgents: vi.fn(async () => ({ list: [], total: 0 })),
  listRecentSessions: vi.fn(async () => []),
  estimateRun: vi.fn(),
  createRun: vi.fn(),
  getRun: vi.fn(),
  fetchNarrationEvents: vi.fn(async () => []),
  cancelRun: vi.fn(),
  uploadAttachment: vi.fn(),
  getSessionSnapshot: vi.fn(async () => ({
    session_id: 'sess-resume',
    agent_skill_id: 1,
    messages: [],
    agent_run_ids: [],
    last_active_at: '',
    status: 'completed' as const
  }))
}))

import * as api from '@/api/agent'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  sessionStorage.clear()
})

const RESUMING_RUN = {
  id: 148,
  session_id: 'sess-resume',
  status: 'terminated',
  state_reason: 'running',
  final_output: '公开信息已经挖到不少。现在我需要向你确认一些网上查不到的细节。',
  created_at: '',
  updated_at: ''
} as unknown as AgentRun

describe('agentChat — answer-resume lifecycle (dev run 148)', () => {
  it('does NOT push the stale pre-question prose as a final_answer while resuming', async () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'running' } as AgentRun
    vi.mocked(api.getRun).mockResolvedValueOnce(RESUMING_RUN)

    await store.refreshRunStatus()

    const finals = store.messages.filter((m) => m.type === 'final_answer')
    expect(finals).toHaveLength(0)
  })

  it('keeps treating the run as active so polling continues', async () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'running' } as AgentRun
    vi.mocked(api.getRun).mockResolvedValueOnce(RESUMING_RUN)

    await store.refreshRunStatus()

    expect(store.currentRun?.status).toBe('running')
  })

  it('the terminal-event reconcile path also refuses the stale prose for a resuming run', async () => {
    const store = useAgentChatStore()
    vi.mocked(api.getRun).mockResolvedValue(RESUMING_RUN)

    // reconcileFromDB is internal; the SSE terminal event is its public trigger.
    store.applyStreamEvent({
      type: 'terminal',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: { reason: 'completed', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)
    await new Promise((r) => setTimeout(r, 0))

    const finals = store.messages.filter((m) => m.type === 'final_answer')
    expect(finals).toHaveLength(0)
  })

  it('a pending-status run is also kept active through a resume signature', async () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'pending' } as AgentRun
    vi.mocked(api.getRun).mockResolvedValueOnce(RESUMING_RUN)

    await store.refreshRunStatus()

    expect(store.messages.filter((m) => m.type === 'final_answer')).toHaveLength(0)
    expect(store.currentRun?.status).toBe('running')
  })

  it('injects the follow-up question card from the snapshot when a resumed run yields again (F4)', async () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'running' } as AgentRun
    const WAITING_RUN = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as unknown as AgentRun
    vi.mocked(api.getRun).mockResolvedValue(WAITING_RUN)
    vi.mocked(api.getSessionSnapshot).mockResolvedValue({
      session_id: 'sess-resume',
      agent_skill_id: 1,
      agent_run_ids: [148],
      last_active_at: '',
      status: 'running',
      messages: [
        {
          id: 'q-148',
          type: 'question_prompt',
          run_id: 148,
          questions: [{ question: '第二轮追问？', options: [], multi_select: false }],
          answer_status: 'pending',
          timestamp: ''
        }
      ]
    } as never)

    await store.refreshRunStatus()
    const cards = store.messages.filter((m) => m.type === 'question_prompt')
    expect(cards).toHaveLength(1)
    expect((cards[0] as { questions?: { question: string }[] }).questions?.[0]?.question).toBe(
      '第二轮追问？'
    )

    // Idempotent: a second poll with the pending card present must not duplicate.
    await store.refreshRunStatus()
    expect(store.messages.filter((m) => m.type === 'question_prompt')).toHaveLength(1)
  })

  // issue3 (stuck spinner after task done): once a run is terminal, NO live
  // indicator may keep spinning — isRunning false AND isWaitingForUser false,
  // even if the run carries a stale 'waiting_for_user_choice' state_reason (which
  // the poll-based resume path could leave behind when it never refreshed cleanly
  // to the final terminal). The streaming-resume terminal event (T5) drives the
  // clean clear at runtime; this guards the invariant defensively. EXPECTED TO
  // FAIL before the isWaitingForUser terminal-status guard.
  it('issue3: a terminal run is never waiting/running even with a stale waiting state_reason', () => {
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      status: 'terminated',
      state_reason: 'waiting_for_user_choice'
    } as unknown as AgentRun
    expect(store.isRunning).toBe(false)
    expect(store.isWaitingForUser).toBe(false)
  })

  // issue3: a real (non-pause) terminal event clears the stuck-silence marker so
  // the run-pulse word/timer doesn't keep "working" after the task is done.
  it('issue3: a completed terminal event clears the stuck-silence marker', () => {
    const store = useAgentChatStore()
    vi.mocked(api.getRun).mockResolvedValue({
      id: 148,
      status: 'completed',
      state_reason: 'completed'
    } as unknown as AgentRun)
    store.currentRun = {
      id: 148,
      status: 'running',
      state_reason: 'running'
    } as unknown as AgentRun
    store.stuckSince = 12345
    store.applyStreamEvent({
      type: 'terminal',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: { reason: 'completed', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)
    expect(store.stuckSince).toBeNull()
  })

  // ...but a waiting-pause terminal must NOT clear it (the run is paused, not
  // done — pollNarration owns stuckSince during the wait).
  it('issue3: a waiting-pause terminal does NOT clear the stuck marker', () => {
    const store = useAgentChatStore()
    vi.mocked(api.getRun).mockResolvedValue({
      id: 148,
      status: 'running',
      state_reason: 'waiting_for_user_choice'
    } as unknown as AgentRun)
    store.currentRun = {
      id: 148,
      status: 'running',
      state_reason: 'running'
    } as unknown as AgentRun
    store.stuckSince = 12345
    store.applyStreamEvent({
      type: 'terminal',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: { reason: 'waiting_for_user_choice', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)
    expect(store.stuckSince).toBe(12345)
  })
})
