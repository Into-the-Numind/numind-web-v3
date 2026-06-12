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

vi.mock('@/api/agent', () => ({
  listAvailableAgents: vi.fn(async () => ({ list: [], total: 0 })),
  listRecentSessions: vi.fn(async () => []),
  estimateRun: vi.fn(),
  createRun: vi.fn(),
  getRun: vi.fn(),
  fetchNarrationEvents: vi.fn(async () => []),
  cancelRun: vi.fn(),
  extendBudget: vi.fn(),
  submitFeedback: vi.fn(),
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

  it('reconcileFromDB also refuses the stale prose for a resuming run', async () => {
    const store = useAgentChatStore()
    vi.mocked(api.getRun).mockResolvedValueOnce(RESUMING_RUN)

    await store.reconcileFromDB(148)

    const finals = store.messages.filter((m) => m.type === 'final_answer')
    expect(finals).toHaveLength(0)
  })
})
