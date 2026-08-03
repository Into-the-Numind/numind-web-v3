import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { buildAttachmentRequestFields, useAgentChatStore } from '../agentChat'
import type { NarrationEvent, AgentRun, ToolGroupMessage } from '@/types/agent'
import type { AgentStreamEvent } from '@/types/agent-stream'

// Mock the api module
vi.mock('@/api/agent', () => ({
  listAvailableAgents: vi.fn(async () => ({
    list: [{ id: 1, name: 'A', description: '', is_active: true, created_at: '', updated_at: '' }],
    total: 1
  })),
  listRecentSessions: vi.fn(async () => []),
  listAllHistorySessions: vi.fn(async () => []),
  generateAgentSessionTitle: vi.fn(async () => ({ title: '' })),
  estimateRun: vi.fn(async () => ({ min: 50, max: 150, is_large_task: false })),
  createRun: vi.fn(async () => ({
    run_id: 999,
    session_id: 999,
    estimated_credits_min: 50,
    estimated_credits_max: 150
  })),
  getRun: vi.fn(
    async (): Promise<AgentRun> => ({
      id: 999,
      session_id: 999,
      user_id: 1,
      agent_skill_id: 1,
      status: 'running',
      credits_used: 0,
      created_at: '',
      updated_at: ''
    })
  ),
  fetchNarrationEvents: vi.fn(async (): Promise<NarrationEvent[]> => []),
  cancelRun: vi.fn(async () => ({ run_id: 999, status: 'cancelled' as const })),
  uploadAttachment: vi.fn(),
  getAttachmentStatus: vi.fn(async () => ({ id: 1, fallback_ready: true })),
  getSessionSnapshot: vi.fn(async () => ({
    session_id: 1,
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

describe('agentChat store', () => {
  it('fetchAvailableAgents loads + clears error on success', async () => {
    const store = useAgentChatStore()
    await store.fetchAvailableAgents()
    expect(store.availableAgents.length).toBe(1)
    expect(store.agentsError).toBe(null)
    expect(store.loadingAgents).toBe(false)
  })

  it('fetchRecentSessions loads ALL history sessions, not capped at 5 (US4)', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      session_id: `s${i}`,
      agent_skill_id: 1,
      session_name: `会话${i}`,
      last_active_at: '',
      status: 'completed' as const
    })) as unknown as Awaited<ReturnType<typeof api.listAllHistorySessions>>
    vi.mocked(api.listAllHistorySessions).mockResolvedValueOnce(eight)

    const store = useAgentChatStore()
    await store.fetchRecentSessions()

    expect(api.listAllHistorySessions).toHaveBeenCalled()
    expect(api.listRecentSessions).not.toHaveBeenCalled()
    expect(store.recentSessions.length).toBe(8)
  })

  it('fetchRecentSessions resets to empty list on error', async () => {
    vi.mocked(api.listAllHistorySessions).mockRejectedValueOnce(new Error('boom'))
    const store = useAgentChatStore()
    await store.fetchRecentSessions()
    expect(store.recentSessions).toEqual([])
  })

  it('fetchAvailableAgents records error on failure', async () => {
    vi.mocked(api.listAvailableAgents).mockRejectedValueOnce(new Error('boom'))
    const store = useAgentChatStore()
    await store.fetchAvailableAgents()
    expect(store.agentsError).toBe('boom')
    expect(store.loadingAgents).toBe(false)
  })

  it('startNewRun pushes user message + sets currentRun + clears input', async () => {
    const store = useAgentChatStore()
    store.inputText = 'hello'
    await store.startNewRun(1, 'hello')
    expect(store.messages.length).toBe(1)
    expect(store.messages[0].type).toBe('user')
    expect(store.currentRun?.id).toBe(999)
    expect(store.inputText).toBe('')
    expect(sessionStorage.getItem('agentChat:currentRunId')).toBe('999')
  })

  it('startNewRun pushes failed system message when initial status is failed', async () => {
    vi.mocked(api.getRun).mockResolvedValueOnce({
      id: 999,
      session_id: 999,
      user_id: 1,
      agent_skill_id: 1,
      status: 'failed',
      credits_used: 0,
      created_at: '',
      updated_at: ''
    })
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hello')
    const last = store.messages[store.messages.length - 1]
    expect(last.type).toBe('system')
    expect(last.type === 'system' && last.system_subtype).toBe('failed')
  })

  it('pollNarration updates events + resets stuckSince on new events', async () => {
    const ev: NarrationEvent = {
      run_id: 999,
      tool_call_id: 'tc-1',
      tool_name: 'x',
      state: 'use',
      message: 'doing',
      timestamp: '2026-05-21T10:00:00Z'
    }
    vi.mocked(api.fetchNarrationEvents).mockResolvedValueOnce([ev])
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    store.stuckSince = 12345
    await store.pollNarration()
    expect(store.narrationEvents.length).toBe(1)
    expect(store.stuckSince).toBe(null)
  })

  it('pollNarration retracts a stale stuck message once narration resumes (agent-wait-ux 5a)', async () => {
    const ev: NarrationEvent = {
      run_id: 999,
      tool_call_id: 'tc-r',
      tool_name: 'x',
      state: 'use',
      message: 'resumed',
      timestamp: '2026-05-21T10:00:05Z'
    }
    vi.mocked(api.fetchNarrationEvents).mockResolvedValueOnce([ev])
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    // Simulate the false "still processing" hint having been shown earlier.
    store.messages.push({
      id: 'stuck-1',
      type: 'system',
      system_subtype: 'stuck',
      timestamp: '2026-05-21T10:00:00Z'
    })
    await store.pollNarration()
    expect(
      store.messages.find((m) => m.type === 'system' && m.system_subtype === 'stuck')
    ).toBeUndefined()
  })

  // Hotfix narration-tool-group-message-wire: regression for the
  // visibility bug. Before this fix narrationEvents accumulated in the
  // store but no `tool_group` message was ever injected into messages[],
  // so AgentMessageItem (which only renders AgentToolCallList when
  // msg.type === 'tool_group') silently dropped every tool call. This
  // test asserts a tool_group message exists in messages after polling
  // and that subsequent events update the same message in place rather
  // than creating duplicates.
  it('pollNarration injects + updates a single tool_group message in messages', async () => {
    const ev1: NarrationEvent = {
      run_id: 999,
      tool_call_id: 'tc-1',
      tool_name: 'web_search',
      state: 'use',
      message: '正在搜索 网络',
      timestamp: '2026-05-21T10:00:00Z'
    }
    const ev2: NarrationEvent = {
      run_id: 999,
      tool_call_id: 'tc-1',
      tool_name: 'web_search',
      state: 'result',
      message: '搜索完成',
      timestamp: '2026-05-21T10:00:05Z'
    }
    vi.mocked(api.fetchNarrationEvents).mockResolvedValueOnce([ev1]).mockResolvedValueOnce([ev2])
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')

    await store.pollNarration()
    const afterFirst = store.messages.filter((m) => m.type === 'tool_group')
    expect(afterFirst.length).toBe(1)
    expect(afterFirst[0].type === 'tool_group' && afterFirst[0].tool_calls.length).toBe(1)
    expect(afterFirst[0].type === 'tool_group' && afterFirst[0].tool_calls[0].current_state).toBe(
      'use'
    )

    await store.pollNarration()
    const afterSecond = store.messages.filter((m) => m.type === 'tool_group')
    // Still exactly one tool_group message — second event aggregates into the
    // SAME group (same tool_call_id), and the group is updated in place.
    expect(afterSecond.length).toBe(1)
    expect(afterSecond[0].type === 'tool_group' && afterSecond[0].tool_calls[0].current_state).toBe(
      'result'
    )
    expect(afterSecond[0].type === 'tool_group' && afterSecond[0].tool_calls[0].events.length).toBe(
      2
    )
  })

  // agent-exec-ux-followup: on an ask_user_question answer-resume the run
  // continues via POLLING (no reopened stream). The streaming path never
  // advanced lastNarrationTs, so the first resume poll used to re-fetch the
  // WHOLE run's narration from ts='' and re-aggregate every pre-answer step into
  // one giant duplicate card. The terminal event now seeds the narration cursor
  // to the stream-end ts; QuerySince is strict-after, so the resume poll then
  // returns only post-answer events. (An id-based dedup can't work — streamed
  // tool_call_ids are model ids, polled ones are "<runID>-<seq>".)
  it('terminal seeds lastNarrationTs to the stream-end ts', () => {
    const store = useAgentChatStore()
    const start: AgentStreamEvent = {
      type: 'stream_start',
      seq: 1,
      ts: '2026-05-21T10:00:00Z',
      run_id: 999,
      step: 0,
      data: { run_id: 999, session_id: 'sess-999' }
    }
    store.applyStreamEvent(start)
    const terminal: AgentStreamEvent = {
      type: 'terminal',
      seq: 9,
      ts: '2026-05-21T10:05:00Z',
      run_id: 999,
      step: 0,
      data: { reason: 'waiting_for_user_choice' }
    }
    store.applyStreamEvent(terminal)
    expect(store.lastNarrationTs).toBe('2026-05-21T10:05:00Z')
  })

  // Closes the loop on the seed test above: the seeded cursor is actually read
  // back as the `since` arg, so the resume poll fetches only post-cursor events.
  it('pollNarration forwards lastNarrationTs as the since cursor', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi') // currentRun running + not waiting → poll runs
    store.lastNarrationTs = '2026-05-21T10:05:00Z'
    vi.mocked(api.fetchNarrationEvents).mockResolvedValueOnce([])
    await store.pollNarration()
    expect(api.fetchNarrationEvents).toHaveBeenLastCalledWith(999, '2026-05-21T10:05:00Z')
  })

  // When the run completes, the polling poll stops the instant it's no longer
  // running, so the last tool's result narration may never arrive — leaving its
  // live timer ticking. refreshRunStatus must flip any lingering in-flight tool to
  // terminal so the timer stops (customer-reported "task done, card still counting").
  it('finalizes lingering in-flight tool calls when the run completes', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi') // currentRun running
    const ev = (state: NarrationEvent['state']): NarrationEvent => ({
      run_id: 999,
      tool_call_id: 'x',
      tool_name: 'web_search',
      state,
      message: 'm',
      timestamp: '2026-05-21T10:00:00Z'
    })
    store.messages.push({
      id: 'tg-1',
      type: 'tool_group',
      timestamp: '',
      tool_calls: [
        { tool_call_id: 'a', tool_name: 'web_search', current_state: 'use', events: [ev('use')] },
        {
          tool_call_id: 'b',
          tool_name: 'web_search',
          current_state: 'result',
          events: [ev('result')]
        }
      ]
    } as ToolGroupMessage)
    vi.mocked(api.getRun).mockResolvedValueOnce({ id: 999, status: 'completed' } as AgentRun)
    await store.refreshRunStatus()
    const tg = store.messages.find((m) => m.type === 'tool_group') as ToolGroupMessage
    expect(tg.tool_calls.find((t) => t.tool_call_id === 'a')?.current_state).toBe('result')
    expect(tg.tool_calls.find((t) => t.tool_call_id === 'b')?.current_state).toBe('result')
  })

  it('does not repaint an explicit tool error as success when the overall run completes', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    store.messages.push({
      id: 'tg-explicit-error',
      type: 'tool_group',
      timestamp: '',
      tool_calls: [
        {
          tool_call_id: 'failed-write',
          tool_name: 'lark_execute',
          current_state: 'error',
          error_message: 'unknown_result',
          events: [
            {
              run_id: 999,
              tool_call_id: 'failed-write',
              tool_name: 'lark_execute',
              state: 'error',
              message: '操作失败，稍后再试一下',
              timestamp: '2026-07-20T10:00:00Z'
            }
          ]
        }
      ]
    } as ToolGroupMessage)
    vi.mocked(api.getRun).mockResolvedValueOnce({ id: 999, status: 'completed' } as AgentRun)

    await store.refreshRunStatus()

    const group = store.messages.find((m) => m.id === 'tg-explicit-error') as ToolGroupMessage
    expect(group.tool_calls[0]).toMatchObject({
      current_state: 'error',
      error_message: 'unknown_result'
    })
    expect(group.tool_calls[0].events.at(-1)?.state).toBe('error')
  })

  // An interrupted run (cancelled/failed/...) must NOT paint its in-flight tool as
  // a green "已完成" — it gets 'error', not 'result'.
  it('finalizes in-flight tools to error when the run is cancelled (not completed)', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    store.messages.push({
      id: 'tg-1',
      type: 'tool_group',
      timestamp: '',
      tool_calls: [
        {
          tool_call_id: 'a',
          tool_name: 'web_search',
          current_state: 'use',
          events: [
            {
              run_id: 999,
              tool_call_id: 'a',
              tool_name: 'web_search',
              state: 'use',
              message: 'm',
              timestamp: '2026-05-21T10:00:00Z'
            }
          ]
        }
      ]
    } as ToolGroupMessage)
    vi.mocked(api.getRun).mockResolvedValueOnce({ id: 999, status: 'cancelled' } as AgentRun)
    await store.refreshRunStatus()
    const tg = store.messages.find((m) => m.type === 'tool_group') as ToolGroupMessage
    expect(tg.tool_calls.find((t) => t.tool_call_id === 'a')?.current_state).toBe('error')
  })

  it('startNewRun resets currentToolGroupId so a new turn creates a fresh group instead of appending to run-1 group', async () => {
    const ev1: NarrationEvent = {
      run_id: 999,
      tool_call_id: 'tc-1',
      tool_name: 'web_search',
      state: 'use',
      message: 'm',
      timestamp: '2026-05-21T10:00:00Z'
    }
    const ev2: NarrationEvent = {
      run_id: 1000,
      tool_call_id: 'tc-2',
      tool_name: 'kb_search',
      state: 'use',
      message: 'm2',
      timestamp: '2026-05-21T10:01:00Z'
    }
    vi.mocked(api.fetchNarrationEvents).mockResolvedValueOnce([ev1]).mockResolvedValueOnce([ev2])
    const store = useAgentChatStore()

    await store.startNewRun(1, 'hi')
    await store.pollNarration()
    const groupsAfterFirst = store.messages.filter((m) => m.type === 'tool_group')
    expect(groupsAfterFirst.length).toBe(1)
    const firstGroupId = groupsAfterFirst[0].id

    // Second turn: messages history is preserved (the run-1 tool_group stays
    // as historical record), but currentToolGroupId must be reset so the new
    // tool call creates a separate group rather than mutating the historical
    // one. Without the reset, ev2 (different tool_call_id) would still get
    // appended into the SAME group as run-1's tc-1 — wrong UX.
    await store.startNewRun(1, 'second turn')
    await store.pollNarration()
    const groupsAfterSecond = store.messages.filter((m) => m.type === 'tool_group')
    expect(groupsAfterSecond.length).toBe(2)
    expect(groupsAfterSecond[0].id).toBe(firstGroupId)
    expect(groupsAfterSecond[1].id).not.toBe(firstGroupId)
  })

  it('pollNarration sets stuckSince on first empty response', async () => {
    vi.mocked(api.fetchNarrationEvents).mockResolvedValueOnce([])
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    expect(store.stuckSince).toBe(null)
    await store.pollNarration()
    expect(typeof store.stuckSince).toBe('number')
  })

  it('cancelCurrent sets status and pushes system message', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    await store.cancelCurrent()
    expect(store.currentRun?.status).toBe('cancelled')
    const last = store.messages[store.messages.length - 1]
    expect(last.type === 'system' && last.system_subtype).toBe('cancelled')
  })

  it('cancelCurrent reconciles a run that already reached terminal state on the server', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    vi.mocked(api.cancelRun).mockRejectedValueOnce(
      new Error('Agent run is already in a terminal state and cannot be cancelled.')
    )
    vi.mocked(api.getRun).mockResolvedValueOnce({
      id: 999,
      session_id: 999,
      status: 'completed',
      state_reason: 'completed',
      final_output: '任务已经完成。',
      credits_used: 12,
      created_at: '',
      updated_at: ''
    } as never)

    await expect(store.cancelCurrent()).resolves.toBeUndefined()

    expect(store.currentRun).toMatchObject({ id: 999, status: 'completed' })
    expect(store.messages.some((m) => m.type === 'system' && m.system_subtype === 'cancelled')).toBe(
      false
    )
    expect(store.isRunning).toBe(false)
  })

  it('toolGroups aggregates events by tool_call_id', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    const ev1: NarrationEvent = {
      run_id: 999,
      tool_call_id: 'tc-1',
      tool_name: 't',
      state: 'use',
      message: 'a',
      timestamp: '2026-05-21T10:00:00Z'
    }
    const ev2: NarrationEvent = {
      run_id: 999,
      tool_call_id: 'tc-1',
      tool_name: 't',
      state: 'result',
      message: 'b',
      timestamp: '2026-05-21T10:00:01Z'
    }
    const ev3: NarrationEvent = {
      run_id: 999,
      tool_call_id: 'tc-2',
      tool_name: 'q',
      state: 'use',
      message: 'c',
      timestamp: '2026-05-21T10:00:02Z'
    }
    store.narrationEvents.push(ev1, ev2, ev3)
    expect(store.toolGroups.length).toBe(2)
    expect(store.toolGroups[0].current_state).toBe('result')
    expect(store.toolGroups[0].events.length).toBe(2)
    expect(store.toolGroups[1].tool_call_id).toBe('tc-2')
  })

  it('loadSessionSnapshot prepends restored system message when compact_summary exists', async () => {
    vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
      session_id: 1,
      agent_skill_id: 1,
      messages: [],
      compact_summary: '上次摘要',
      agent_run_ids: [],
      last_active_at: '',
      status: 'completed'
    })
    const store = useAgentChatStore()
    await store.loadSessionSnapshot(1, true)
    expect(store.messages.length).toBe(1)
    expect(store.messages[0].type).toBe('system')
    expect(store.isReadOnly).toBe(true)
  })

  it('loadSessionSnapshot finalizes a lingering in-flight tool on a completed run (no stuck spinner on replay)', async () => {
    // Legacy split data: a run persisted before the shared-tool_call_id backend fix
    // (2026-06-14) carries use & result under DIFFERENT tool_call_ids, so the 'use'
    // aggregate never reached a terminal state. A COMPLETED run can't still be
    // executing a tool, yet replay used to leave it 'use' → AgentToolCallItem spins
    // forever (customer-reported). loadSessionSnapshot must finalize it.
    vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
      session_id: 1,
      agent_skill_id: 1,
      messages: [
        {
          id: 'tg-old',
          type: 'tool_group',
          timestamp: '',
          tool_calls: [
            {
              tool_call_id: 'a',
              tool_name: 'load_skill',
              current_state: 'use',
              events: [
                {
                  run_id: 7,
                  tool_call_id: 'a',
                  tool_name: 'load_skill',
                  state: 'use',
                  message: '正在加载技能：docx-author',
                  timestamp: '2026-06-10T00:00:00Z'
                }
              ]
            },
            {
              tool_call_id: 'b',
              tool_name: 'load_skill',
              current_state: 'result',
              events: [
                {
                  run_id: 7,
                  tool_call_id: 'b',
                  tool_name: 'load_skill',
                  state: 'result',
                  message: '已加载技能：docx-author',
                  timestamp: '2026-06-10T00:00:01Z'
                }
              ]
            }
          ]
        } as never
      ],
      agent_run_ids: [],
      last_active_at: '',
      status: 'completed'
    })
    const store = useAgentChatStore()
    await store.loadSessionSnapshot(1, true)
    const tg = store.messages.find((m) => m.type === 'tool_group') as ToolGroupMessage
    expect(tg.tool_calls.find((t) => t.tool_call_id === 'a')?.current_state).toBe('result')
    expect(tg.tool_calls.find((t) => t.tool_call_id === 'b')?.current_state).toBe('result')
  })

  it('loadSessionSnapshot finalizes a stuck tool to ERROR on an interrupted (failed) run', async () => {
    // An interrupted run must NOT paint its lingering tool as a green "已完成".
    vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
      session_id: 1,
      agent_skill_id: 1,
      messages: [
        {
          id: 'tg-f',
          type: 'tool_group',
          timestamp: '',
          tool_calls: [
            {
              tool_call_id: 'a',
              tool_name: 'run_python',
              current_state: 'use',
              events: [
                {
                  run_id: 9,
                  tool_call_id: 'a',
                  tool_name: 'run_python',
                  state: 'use',
                  message: '正在运行代码',
                  timestamp: '2026-06-10T00:00:00Z'
                }
              ]
            }
          ]
        } as never
      ],
      agent_run_ids: [],
      last_active_at: '',
      status: 'failed'
    })
    const store = useAgentChatStore()
    await store.loadSessionSnapshot(1, true)
    const tg = store.messages.find((m) => m.type === 'tool_group') as ToolGroupMessage
    expect(tg.tool_calls.find((t) => t.tool_call_id === 'a')?.current_state).toBe('error')
  })

  it('loadSessionSnapshot restores currentRun when session is waiting for an answer', async () => {
    vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
      session_id: 1,
      agent_skill_id: 1,
      messages: [
        {
          id: 'q-50',
          type: 'question_prompt',
          run_id: 50,
          questions: [
            {
              question: '创办初心是什么？',
              options: [{ label: 'A' }, { label: 'B' }],
              multi_select: false
            }
          ],
          answer_status: 'pending',
          timestamp: ''
        } as never
      ],
      run: {
        id: 50,
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        updated_at: '2026-05-21T09:00:00Z'
      } as AgentRun,
      agent_run_ids: [50],
      last_active_at: '',
      status: 'running'
    })
    const store = useAgentChatStore()
    await store.loadSessionSnapshot(1, false)
    expect(store.currentRun?.id).toBe(50)
    expect(store.messages.some((m) => m.type === 'question_prompt')).toBe(true)
    // The narration cursor is seeded to the run's last update (the pause point)
    // so the post-answer resume poll skips the already-rebuilt pre-answer cards.
    expect(store.lastNarrationTs).toBe('2026-05-21T09:00:00Z')
  })

  it('loadSessionSnapshot restores an ordinary running run as currentRun', async () => {
    vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
      session_id: 'sess-running',
      agent_skill_id: 1,
      messages: [],
      run: {
        id: 51,
        session_id: 'sess-running',
        user_id: 1,
        agent_skill_id: 1,
        status: 'running',
        state_reason: 'running',
        created_at: '',
        updated_at: '2026-05-21T09:10:00Z'
      } as AgentRun,
      agent_run_ids: [51],
      last_active_at: '',
      status: 'running'
    })
    const store = useAgentChatStore()
    await store.loadSessionSnapshot('sess-running', false)
    expect(store.currentRun).toMatchObject({
      id: 51,
      session_id: 'sess-running',
      status: 'running'
    })
    expect(store.lastNarrationTs).toBe('2026-05-21T09:10:00Z')
  })

  it('loadSessionSnapshot does not carry local user messages across historical sessions', async () => {
    vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
      session_id: 'session-b',
      agent_skill_id: 1,
      messages: [],
      run: {
        id: 54,
        session_id: 'session-b',
        user_id: 1,
        agent_skill_id: 1,
        status: 'running',
        state_reason: 'running',
        created_at: '',
        updated_at: '2026-05-21T09:12:00Z'
      } as AgentRun,
      agent_run_ids: [54],
      last_active_at: '',
      status: 'running'
    })
    const store = useAgentChatStore()
    store.beginSession('session-a')
    store.messages = [
      {
        id: 'local-user-a',
        type: 'user',
        text: 'from session A',
        timestamp: '2026-05-21T09:11:00Z'
      } as never
    ]
    await store.loadSessionSnapshot('session-b', false)
    expect(store.messages).not.toContainEqual(expect.objectContaining({ text: 'from session A' }))
    expect(store.currentRun).toMatchObject({
      id: 54,
      session_id: 'session-b',
      status: 'running'
    })
  })

  it('loadSessionSnapshot restores an ordinary pending run as currentRun', async () => {
    vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
      session_id: 'sess-pending',
      agent_skill_id: 1,
      messages: [],
      run: {
        id: 52,
        session_id: 'sess-pending',
        user_id: 1,
        agent_skill_id: 1,
        status: 'pending',
        state_reason: 'pending',
        created_at: '',
        updated_at: '2026-05-21T09:20:00Z'
      } as AgentRun,
      agent_run_ids: [52],
      last_active_at: '',
      status: 'running'
    })
    const store = useAgentChatStore()
    await store.loadSessionSnapshot('sess-pending', false)
    expect(store.currentRun).toMatchObject({
      id: 52,
      session_id: 'sess-pending',
      status: 'pending'
    })
    expect(store.lastNarrationTs).toBe('2026-05-21T09:20:00Z')
  })

  it('loadSessionSnapshot keeps terminal runs inactive', async () => {
    const terminalStatuses: AgentRun['status'][] = [
      'completed',
      'failed',
      'cancelled',
      'timeout',
      'budget_exhausted'
    ]
    for (const status of terminalStatuses) {
      setActivePinia(createPinia())
      vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
        session_id: `sess-${status}`,
        agent_skill_id: 1,
        messages: [],
        run: {
          id: 53,
          session_id: `sess-${status}`,
          user_id: 1,
          agent_skill_id: 1,
          status,
          state_reason: status,
          created_at: '',
          updated_at: '2026-05-21T09:30:00Z'
        } as AgentRun,
        agent_run_ids: [53],
        last_active_at: ''
      })
      const store = useAgentChatStore()
      await store.loadSessionSnapshot(`sess-${status}`, false)
      expect(store.currentRun).toBeNull()
      expect(store.lastNarrationTs).toBe('')
    }
  })

  it('loadSessionSnapshot keeps a terminal run inactive even with stale waiting reason', async () => {
    vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
      session_id: 'sess-stale-waiting-terminal',
      agent_skill_id: 1,
      messages: [],
      run: {
        id: 55,
        session_id: 'sess-stale-waiting-terminal',
        user_id: 1,
        agent_skill_id: 1,
        status: 'completed',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: '2026-05-21T09:40:00Z'
      } as AgentRun,
      agent_run_ids: [55],
      last_active_at: ''
    })
    const store = useAgentChatStore()
    await store.loadSessionSnapshot('sess-stale-waiting-terminal', false)
    expect(store.currentRun).toBeNull()
    expect(store.lastNarrationTs).toBe('')
  })

  it.each(['external_resume_ready', 'ext_resume:lease-55'])(
    'loadSessionSnapshot keeps terminal queued external continuation locally running: %s',
    async (stateReason) => {
      vi.mocked(api.getSessionSnapshot).mockResolvedValueOnce({
        session_id: `sess-${stateReason}`,
        agent_skill_id: 1,
        messages: [],
        run: {
          id: 56,
          session_id: `sess-${stateReason}`,
          user_id: 1,
          agent_skill_id: 1,
          status: 'completed',
          state_reason: stateReason,
          created_at: '',
          updated_at: '2026-05-21T09:50:00Z'
        } as AgentRun,
        agent_run_ids: [56],
        last_active_at: ''
      })
      const store = useAgentChatStore()
      await store.loadSessionSnapshot(`sess-${stateReason}`, false)
      expect(store.currentRun).toMatchObject({
        id: 56,
        status: 'running',
        state_reason: stateReason
      })
      expect(store.lastNarrationTs).toBe('2026-05-21T09:50:00Z')
    }
  )

  it('ensureCurrentRun hydrates currentRun from getRun when unset', async () => {
    vi.mocked(api.getRun).mockResolvedValueOnce({ id: 77, status: 'running' } as AgentRun)
    const store = useAgentChatStore()
    expect(store.currentRun).toBeNull()
    await store.ensureCurrentRun(77)
    expect(store.currentRun?.id).toBe(77)
  })

  it('loadSessionSnapshot records sessionError on failure', async () => {
    vi.mocked(api.getSessionSnapshot).mockRejectedValueOnce(new Error('not found'))
    const store = useAgentChatStore()
    await store.loadSessionSnapshot(999, false)
    expect(store.sessionError).toBe('not found')
    expect(store.loadingSnapshot).toBe(false)
  })

  it('reset clears all 16 fields including sessionStorage', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    store.stuckSince = 9999
    store.agentsError = 'old err'
    expect(sessionStorage.getItem('agentChat:currentRunId')).not.toBe(null)

    store.reset()

    expect(store.currentRun).toBe(null)
    expect(store.messages.length).toBe(0)
    expect(store.narrationEvents.length).toBe(0)
    expect(store.lastNarrationTs).toBe('')
    expect(store.stuckSince).toBe(null)
    expect(store.inputText).toBe('')
    expect(store.attachments.length).toBe(0)
    expect(store.estimate).toBe(null)
    expect(store.isReadOnly).toBe(false)
    expect(store.loadingAgents).toBe(false)
    expect(store.loadingSnapshot).toBe(false)
    expect(store.sendingMessage).toBe(false)
    expect(store.cancelling).toBe(false)
    expect(store.agentsError).toBe(null)
    expect(store.sessionError).toBe(null)
    expect(sessionStorage.getItem('agentChat:currentRunId')).toBe(null)
  })

  it('uploadAttachment pushes to attachments array', async () => {
    vi.mocked(api.uploadAttachment).mockResolvedValueOnce({
      id: 1,
      url: 'https://cos.example/agent-attachments/1/x-a.xlsx',
      filename: 'a.xlsx',
      size: 100,
      mime_type: 'application/xlsx',
      created_at: '2026-05-22T10:00:00Z'
    })
    const store = useAgentChatStore()
    const file = new File(['x'], 'a.xlsx')
    await store.uploadAttachment(file)
    expect(store.attachments.length).toBe(1)
  })

  it('uploadAttachment shows a pending attachment immediately while upload is in flight', async () => {
    let resolveUpload!: (value: Awaited<ReturnType<typeof api.uploadAttachment>>) => void
    let resolveStatus!: (value: Awaited<ReturnType<typeof api.getAttachmentStatus>>) => void
    const uploadPromise = new Promise<Awaited<ReturnType<typeof api.uploadAttachment>>>((resolve) => {
      resolveUpload = resolve
    })
    const statusPromise = new Promise<Awaited<ReturnType<typeof api.getAttachmentStatus>>>((resolve) => {
      resolveStatus = resolve
    })
    vi.mocked(api.uploadAttachment).mockReturnValueOnce(uploadPromise)
    vi.mocked(api.getAttachmentStatus).mockReturnValueOnce(statusPromise)

    const store = useAgentChatStore()
    const pending = store.uploadAttachment(new File(['x'], 'a.pdf', { type: 'application/pdf' }))

    expect(store.attachments).toHaveLength(1)
    expect(store.attachments[0]).toMatchObject({
      filename: 'a.pdf',
      size: 1,
      mime_type: 'application/pdf',
      status: 'uploading'
    })

    resolveUpload({
      id: 1,
      url: 'https://cos.example/agent-attachments/1/x-a.pdf',
      filename: 'a.pdf',
      size: 1,
      mime_type: 'application/pdf',
      created_at: '2026-05-22T10:00:00Z'
    })
    await flushPromises()

    expect(store.attachments[0]).toMatchObject({
      id: 1,
      url: 'https://cos.example/agent-attachments/1/x-a.pdf',
      status: 'processing',
      client_id: expect.stringMatching(/^upload-/)
    })

    resolveStatus({ id: 1, fallback_ready: true })
    await pending

    expect(store.attachments[0]).toMatchObject({
      id: 1,
      url: 'https://cos.example/agent-attachments/1/x-a.pdf',
      status: 'success',
      client_id: expect.stringMatching(/^upload-/)
    })
  })

  it('uploadAttachment keeps a removable error attachment when upload fails', async () => {
    vi.mocked(api.uploadAttachment).mockRejectedValueOnce(new Error('network down'))

    const store = useAgentChatStore()
    await expect(
      store.uploadAttachment(new File(['x'], 'bad.pdf', { type: 'application/pdf' }))
    ).rejects.toThrow('network down')

    expect(store.attachments).toHaveLength(1)
    expect(store.attachments[0]).toMatchObject({
      filename: 'bad.pdf',
      status: 'error',
      error_message: 'network down',
      client_id: expect.stringMatching(/^upload-/)
    })

    store.removeAttachment(store.attachments[0].client_id!)
    expect(store.attachments).toHaveLength(0)
  })

  it('startNewRun sends persisted attachment_ids in createRun payload', async () => {
    const store = useAgentChatStore()

    // Seed two uploaded attachments
    vi.mocked(api.uploadAttachment)
      .mockResolvedValueOnce({
        id: 101,
        url: 'https://cos.example/agent-attachments/1/x-a.pdf',
        filename: 'a.pdf',
        size: 100,
        mime_type: 'application/pdf',
        created_at: '2026-05-22T10:00:00Z'
      })
      .mockResolvedValueOnce({
        id: 102,
        url: 'https://cos.example/agent-attachments/1/y-b.jpg',
        filename: 'b.jpg',
        size: 200,
        mime_type: 'image/jpeg',
        created_at: '2026-05-22T10:00:01Z'
      })
    await store.uploadAttachment(new File(['a'], 'a.pdf'))
    await store.uploadAttachment(new File(['b'], 'b.jpg'))
    expect(store.attachments.length).toBe(2)

    vi.mocked(api.createRun).mockResolvedValueOnce({
      run_id: 99,
      session_id: 'sess-99',
      estimated_credits_min: 5,
      estimated_credits_max: 7
    })
    vi.mocked(api.getRun).mockResolvedValueOnce({
      id: 99,
      session_id: 'sess-99',
      status: 'running',
      created_at: '',
      updated_at: ''
    } as never)

    await store.startNewRun(1, 'please read these')

    // The createRun payload carries stable DB identities so file_read can use
    // the upload-time parsed cache.
    expect(api.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_skill_id: 1,
        input_text: 'please read these',
        attachment_ids: [101, 102]
      })
    )
    const callArg = vi.mocked(api.createRun).mock.calls[0][0] as Record<string, unknown>
    expect(callArg.attachment_urls).toBeUndefined()
    // Local attachments cleared after send.
    expect(store.attachments.length).toBe(0)
  })

  it('removeAttachment filters by url', async () => {
    const store = useAgentChatStore()
    vi.mocked(api.uploadAttachment).mockResolvedValueOnce({
      id: 103,
      url: 'https://cos.example/agent-attachments/1/x-keep.pdf',
      filename: 'keep.pdf',
      size: 50,
      mime_type: 'application/pdf',
      created_at: '2026-05-22T10:00:00Z'
    })
    await store.uploadAttachment(new File(['k'], 'keep.pdf'))
    expect(store.attachments.length).toBe(1)
    store.removeAttachment('https://cos.example/agent-attachments/1/x-keep.pdf')
    expect(store.attachments.length).toBe(0)
  })

  it('attachment request falls back to URL only when upload id is zero', () => {
    expect(
      buildAttachmentRequestFields([
        {
          id: 7,
          url: 'https://cos.example/agent-attachments/1/managed.pdf',
          filename: 'managed.pdf',
          size: 10,
          mime_type: 'application/pdf',
          created_at: ''
        },
        {
          id: 0,
          url: 'https://cos.example/agent-attachments/1/idless.txt',
          filename: 'idless.txt',
          size: 5,
          mime_type: 'text/plain',
          created_at: ''
        },
        {
          id: 0,
          url: 'upload-pending',
          filename: 'pending.pdf',
          size: 1,
          mime_type: 'application/pdf',
          created_at: '',
          status: 'uploading',
          client_id: 'upload-pending'
        },
        {
          id: 8,
          url: 'https://cos.example/agent-attachments/1/processing.pdf',
          filename: 'processing.pdf',
          size: 1,
          mime_type: 'application/pdf',
          created_at: '',
          status: 'processing',
          client_id: 'upload-processing'
        },
        {
          id: 0,
          url: 'upload-error',
          filename: 'failed.pdf',
          size: 1,
          mime_type: 'application/pdf',
          created_at: '',
          status: 'error',
          client_id: 'upload-error'
        }
      ])
    ).toEqual({
      attachment_ids: [7],
      attachment_urls: ['https://cos.example/agent-attachments/1/idless.txt']
    })
  })
})

// ==================== instant-title-ux: prepareNewSession (agent) ====================

describe('instant-title-ux prepareNewSession (agent)', () => {
  it('预生成 session_id + 乐观入列 pulse + 秒生成标题更新', async () => {
    vi.mocked(api.generateAgentSessionTitle).mockResolvedValueOnce({ title: '竞品调研' })
    const store = useAgentChatStore()
    const agent = { id: 1, name: 'A', emoji: '🤖' } as never

    const sid = store.prepareNewSession(agent, '帮我做竞品调研')

    expect(typeof sid).toBe('string')
    expect(store.recentSessions[0].session_id).toBe(sid)
    expect(store.recentSessions[0].agent_skill_id).toBe(1)
    expect(store.titlePendingIds.has(sid)).toBe(true)

    await flushPromises()

    expect(api.generateAgentSessionTitle).toHaveBeenCalledWith(sid, '帮我做竞品调研')
    expect(store.recentSessions[0].session_name).toBe('竞品调研')
    expect(store.titlePendingIds.has(sid)).toBe(false)
  })

  it('标题端点失败重试后仍清 pending (best-effort)', async () => {
    vi.mocked(api.generateAgentSessionTitle).mockRejectedValue(new Error('run not found yet'))
    const store = useAgentChatStore()
    const sid = store.prepareNewSession({ id: 1, name: 'A' } as never, '你好')
    expect(store.titlePendingIds.has(sid)).toBe(true)
    // generateAgentTitle retries once after 1200ms then gives up; wait it out.
    await new Promise((r) => setTimeout(r, 1500))
    expect(store.titlePendingIds.has(sid)).toBe(false)
    expect(api.generateAgentSessionTitle).toHaveBeenCalledTimes(2) // initial + 1 retry
  })
})
