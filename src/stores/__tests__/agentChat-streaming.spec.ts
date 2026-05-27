/**
 * agentChat-streaming.spec.ts — Tests for T10 streaming actions
 *
 * Covers all 14 AgentStreamEventType cases in applyStreamEvent, plus
 * applyError and reset() clearing streamingToolGroupIds.
 *
 * The mock setup mirrors agentChat.spec.ts to keep the store in a known state.
 */
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAgentChatStore } from '../agentChat'
import type { AgentRun } from '@/types/agent'
import type { AgentStreamEvent } from '@/types/agent-stream'

// ---------------------------------------------------------------------------
// Shared mock factory for AgentStreamEvent envelope
// ---------------------------------------------------------------------------
function makeEvent<T = unknown>(
  type: AgentStreamEvent['type'],
  data?: T,
  overrides?: Partial<AgentStreamEvent>
): AgentStreamEvent {
  return {
    type,
    seq: 1,
    ts: '2026-05-27T10:00:00Z',
    run_id: 999,
    step: 0,
    data,
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Mock agent API
// ---------------------------------------------------------------------------
vi.mock('@/api/agent', () => ({
  listAvailableAgents: vi.fn(async () => ({ list: [], total: 0 })),
  listRecentSessions: vi.fn(async () => []),
  estimateRun: vi.fn(async () => ({ min: 50, max: 150, is_large_task: false })),
  createRun: vi.fn(async () => ({
    run_id: 999,
    session_id: 'sess-999',
    estimated_credits_min: 50,
    estimated_credits_max: 150
  })),
  getRun: vi.fn(
    async (): Promise<AgentRun> => ({
      id: 999,
      session_id: 'sess-999',
      user_id: 1,
      agent_skill_id: 1,
      status: 'running',
      credits_used: 0,
      credits_budget: 200,
      credits_threshold_state: 'under_60',
      created_at: '',
      updated_at: ''
    })
  ),
  fetchNarrationEvents: vi.fn(async () => []),
  cancelRun: vi.fn(async () => ({ run_id: 999, status: 'cancelled' as const })),
  extendBudget: vi.fn(),
  submitFeedback: vi.fn(),
  uploadAttachment: vi.fn(),
  getSessionSnapshot: vi.fn(async () => ({
    session_id: 999,
    agent_skill_id: 1,
    messages: [],
    agent_run_ids: [],
    last_active_at: '',
    status: 'completed' as const
  })),
  deleteSession: vi.fn(),
  renameSession: vi.fn(),
  pinSession: vi.fn()
}))

import * as api from '@/api/agent'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  sessionStorage.clear()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a tool_call into messages via tool_call_start so subsequent events work */
async function seedToolCall(
  store: ReturnType<typeof useAgentChatStore>,
  toolCallId = 'tc-1',
  step = 0
) {
  store.applyStreamEvent(
    makeEvent(
      'tool_call_start',
      { tool_call_id: toolCallId, tool_name: 'web_search', input_digest: 'abc' },
      { step }
    )
  )
}

// ---------------------------------------------------------------------------
// applyStreamEvent — all 14 cases
// ---------------------------------------------------------------------------

describe('applyStreamEvent', () => {
  // 1. stream_start — no-op
  it('stream_start: no-op, messages unchanged', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('stream_start'))
    expect(store.messages.length).toBe(0)
  })

  // 2. ping — no-op
  it('ping: no-op, messages unchanged', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('ping'))
    expect(store.messages.length).toBe(0)
  })

  // 3. token_delta — creates assistant message bubble and accumulates text
  it('token_delta: creates assistant message on first event', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('token_delta', { message_id: 'msg-1', text: 'Hello ' }))
    expect(store.messages.length).toBe(1)
    const msg = store.messages[0]
    expect(msg.type).toBe('assistant')
    expect(msg.type === 'assistant' && msg.markdown).toBe('Hello ')
    expect(msg.type === 'assistant' && msg.isStreaming).toBe(true)
  })

  it('token_delta: accumulates text into existing message bubble', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('token_delta', { message_id: 'msg-1', text: 'Hello ' }))
    store.applyStreamEvent(makeEvent('token_delta', { message_id: 'msg-1', text: 'world' }))
    // Still only one assistant message (not two)
    const assistants = store.messages.filter((m) => m.type === 'assistant')
    expect(assistants.length).toBe(1)
    expect(assistants[0].type === 'assistant' && assistants[0].markdown).toBe('Hello world')
  })

  it('token_delta: no-op when payload has no message_id', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('token_delta', { text: 'oops' }))
    expect(store.messages.length).toBe(0)
  })

  // 4. reasoning_delta — accumulates reasoning text
  it('reasoning_delta: accumulates reasoning on assistant message', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('reasoning_delta', { message_id: 'msg-r', text: 'think1 ' }))
    store.applyStreamEvent(makeEvent('reasoning_delta', { message_id: 'msg-r', text: 'think2' }))
    const msg = store.messages.find((m) => m.type === 'assistant')
    expect(msg?.type === 'assistant' && msg.reasoning).toBe('think1 think2')
  })

  // 5. assistant_message — finalizes streaming bubble
  it('assistant_message: finalizes streaming bubble (isStreaming=false, authoritative content)', () => {
    const store = useAgentChatStore()
    // First stream some tokens
    store.applyStreamEvent(makeEvent('token_delta', { message_id: 'msg-2', text: 'draft...' }))
    // Then receive the authoritative assistant_message
    store.applyStreamEvent(
      makeEvent('assistant_message', {
        message_id: 'msg-2',
        content: 'Final answer text',
        has_tool_calls: false
      })
    )
    const assistants = store.messages.filter((m) => m.type === 'assistant')
    expect(assistants.length).toBe(1)
    const msg = assistants[0]
    expect(msg.type === 'assistant' && msg.markdown).toBe('Final answer text')
    expect(msg.type === 'assistant' && msg.isStreaming).toBe(false)
  })

  it('assistant_message: sets reasoning_content when present', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('token_delta', { message_id: 'msg-3', text: 'x' }))
    store.applyStreamEvent(
      makeEvent('assistant_message', {
        message_id: 'msg-3',
        content: 'done',
        reasoning_content: 'step-by-step',
        has_tool_calls: false
      })
    )
    const msg = store.messages.find((m) => m.type === 'assistant')
    expect(msg?.type === 'assistant' && msg.reasoning).toBe('step-by-step')
  })

  it('assistant_message: no-op when no streaming bubble exists for message_id', () => {
    const store = useAgentChatStore()
    // No prior token_delta for this id
    store.applyStreamEvent(
      makeEvent('assistant_message', {
        message_id: 'nonexistent',
        content: 'ghost',
        has_tool_calls: false
      })
    )
    expect(store.messages.length).toBe(0)
  })

  // 6. tool_call_start — creates tool_group message
  it('tool_call_start: creates tool_group message with queued tool_call', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-1', 0)
    const groups = store.messages.filter((m) => m.type === 'tool_group')
    expect(groups.length).toBe(1)
    expect(groups[0].type === 'tool_group' && groups[0].tool_calls.length).toBe(1)
    expect(groups[0].type === 'tool_group' && groups[0].tool_calls[0].current_state).toBe('queued')
    expect(groups[0].type === 'tool_group' && groups[0].tool_calls[0].tool_call_id).toBe('tc-1')
  })

  it('tool_call_start: idempotent — duplicate event does not push duplicate tool_call', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-1', 0)
    await seedToolCall(store, 'tc-1', 0) // duplicate
    const group = store.messages.find((m) => m.type === 'tool_group')
    expect(group?.type === 'tool_group' && group.tool_calls.length).toBe(1)
  })

  it('tool_call_start: different steps create separate tool_group messages', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-step0', 0)
    await seedToolCall(store, 'tc-step1', 1)
    const groups = store.messages.filter((m) => m.type === 'tool_group')
    expect(groups.length).toBe(2)
  })

  // 7. tool_call_progress — updates tool_call state + pushes event
  it('tool_call_progress: updates current_state to progress and appends event', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-1', 0)
    store.applyStreamEvent(
      makeEvent('tool_call_progress', {
        tool_call_id: 'tc-1',
        message: 'Searching the web',
        verb: 'Searching'
      })
    )
    const group = store.messages.find((m) => m.type === 'tool_group')
    const tc = group?.type === 'tool_group' ? group.tool_calls[0] : null
    expect(tc?.current_state).toBe('progress')
    expect(tc?.events.length).toBe(1)
    expect(tc?.events[0].message).toBe('Searching the web')
  })

  it('tool_call_progress: no-op when tool_call_id not found', () => {
    const store = useAgentChatStore()
    // No prior tool_call_start
    store.applyStreamEvent(makeEvent('tool_call_progress', { tool_call_id: 'ghost', message: 'x' }))
    expect(store.messages.length).toBe(0)
  })

  // 8. tool_call_result — sets state to result and sets preview
  it('tool_call_result: sets current_state=result + preview + appends event', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-1', 0)
    store.applyStreamEvent(
      makeEvent('tool_call_result', {
        tool_call_id: 'tc-1',
        preview: 'Result snippet...',
        duration_ms: 420
      })
    )
    const group = store.messages.find((m) => m.type === 'tool_group')
    const tc = group?.type === 'tool_group' ? group.tool_calls[0] : null
    expect(tc?.current_state).toBe('result')
    expect(tc?.preview).toBe('Result snippet...')
    expect(tc?.events.length).toBe(1)
    expect(tc?.events[0].state).toBe('result')
  })

  // 9. tool_call_error — sets state to error + error_message
  it('tool_call_error: sets current_state=error + error_message + appends event', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-1', 0)
    store.applyStreamEvent(
      makeEvent('tool_call_error', {
        tool_call_id: 'tc-1',
        error: 'tool timed out',
        duration_ms: 5000
      })
    )
    const group = store.messages.find((m) => m.type === 'tool_group')
    const tc = group?.type === 'tool_group' ? group.tool_calls[0] : null
    expect(tc?.current_state).toBe('error')
    expect(tc?.error_message).toBe('tool timed out')
    expect(tc?.events[0].state).toBe('error')
  })

  // 10. step_done — no visible messages
  it('step_done: no-op on messages (debug log only)', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('step_done', { step_index: 0 }, { step: 0 }))
    expect(store.messages.length).toBe(0)
  })

  // 11. state_change — no visible messages
  it('state_change: no-op on messages (debug log only)', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('state_change', { loop_event: 'tool_calls', previous_state: 'running' })
    )
    expect(store.messages.length).toBe(0)
  })

  // 12. question_prompt — pushes QuestionPromptMessage
  it('question_prompt: pushes question_prompt message', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('question_prompt', {
        question: 'Which option?',
        options: ['A', 'B'],
        multi_select: false
      })
    )
    const prompts = store.messages.filter((m) => m.type === 'question_prompt')
    expect(prompts.length).toBe(1)
    const p = prompts[0]
    expect(p.type === 'question_prompt' && p.question).toBe('Which option?')
    expect(p.type === 'question_prompt' && p.options.length).toBe(2)
    expect(p.type === 'question_prompt' && p.answer_status).toBe('pending')
    expect(p.type === 'question_prompt' && p.multi_select).toBe(false)
  })

  it('question_prompt: maps string options to {label} objects', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('question_prompt', {
        question: 'Pick one',
        options: ['option-x', 'option-y'],
        multi_select: false
      })
    )
    const p = store.messages.find((m) => m.type === 'question_prompt')
    expect(p?.type === 'question_prompt' && p.options[0]).toEqual({ label: 'option-x' })
  })

  // 13. terminal — updates currentRun.status + triggers reconcileFromDB
  it('terminal: sets currentRun.status to completed when reason=done', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')
    expect(store.currentRun?.status).toBe('running')

    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 2 })
    )
    expect(store.currentRun?.status).toBe('completed')
  })

  it('terminal: sets currentRun.status to failed when reason != done', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'error', duration_ms: 500, step_count: 1 })
    )
    expect(store.currentRun?.status).toBe('failed')
  })

  it('terminal: triggers reconcileFromDB and pushes final_answer when run has final_output', async () => {
    // startNewRun calls getRun once (running, no final_output)
    // reconcileFromDB calls getRun again (completed, with final_output)
    vi.mocked(api.getRun)
      .mockResolvedValueOnce({
        id: 999,
        session_id: 'sess-999',
        user_id: 1,
        agent_skill_id: 1,
        status: 'running',
        credits_used: 0,
        credits_budget: 200,
        credits_threshold_state: 'under_60',
        created_at: '',
        updated_at: ''
      })
      .mockResolvedValueOnce({
        id: 999,
        session_id: 'sess-999',
        user_id: 1,
        agent_skill_id: 1,
        status: 'completed',
        final_output: 'The final answer is 42',
        credits_used: 10,
        credits_budget: 200,
        credits_threshold_state: 'under_60',
        created_at: '',
        updated_at: ''
      })

    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 1 })
    )
    // Wait for reconcileFromDB (micro-task)
    await new Promise((r) => setTimeout(r, 10))
    const finalAnswers = store.messages.filter((m) => m.type === 'final_answer')
    expect(finalAnswers.length).toBe(1)
    expect(finalAnswers[0].type === 'final_answer' && finalAnswers[0].markdown).toBe(
      'The final answer is 42'
    )
  })

  it('terminal: reconcileFromDB is idempotent — does not push duplicate final_answer', async () => {
    vi.mocked(api.getRun).mockResolvedValue({
      id: 999,
      session_id: 'sess-999',
      user_id: 1,
      agent_skill_id: 1,
      status: 'completed',
      final_output: 'answer',
      credits_used: 10,
      credits_budget: 200,
      credits_threshold_state: 'under_60',
      created_at: '',
      updated_at: ''
    })

    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 1 })
    )
    await new Promise((r) => setTimeout(r, 10))
    // Fire terminal again (e.g. duplicate SSE frame)
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 1 })
    )
    await new Promise((r) => setTimeout(r, 10))
    const finalAnswers = store.messages.filter((m) => m.type === 'final_answer')
    expect(finalAnswers.length).toBe(1)
  })

  it('terminal: reconcileFromDB silently ignores network error', async () => {
    // First getRun succeeds (for startNewRun), second fails (for reconcileFromDB)
    vi.mocked(api.getRun)
      .mockResolvedValueOnce({
        id: 999,
        session_id: 'sess-999',
        user_id: 1,
        agent_skill_id: 1,
        status: 'running',
        credits_used: 0,
        credits_budget: 200,
        credits_threshold_state: 'under_60',
        created_at: '',
        updated_at: ''
      })
      .mockRejectedValueOnce(new Error('network down'))

    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')
    // Should not throw — reconcileFromDB catches silently
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 1 })
    )
    await new Promise((r) => setTimeout(r, 10))
    // currentRun status is still updated optimistically even if getRun fails
    expect(store.currentRun?.status).toBe('completed')
  })

  // 14. error — pushes failed system message
  it('error: pushes failed system message with error text', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('error', { code: 'model_error', message: 'rate limit exceeded' })
    )
    const sysMsgs = store.messages.filter((m) => m.type === 'system')
    expect(sysMsgs.length).toBe(1)
    expect(sysMsgs[0].type === 'system' && sysMsgs[0].system_subtype).toBe('failed')
    expect(sysMsgs[0].type === 'system' && sysMsgs[0].markdown).toBe('rate limit exceeded')
  })

  it('error: uses fallback message when payload.message is absent', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('error', { code: 'internal' }))
    const sysMsgs = store.messages.filter((m) => m.type === 'system')
    expect(sysMsgs[0].type === 'system' && sysMsgs[0].markdown).toBe('unknown stream error')
  })
})

// ---------------------------------------------------------------------------
// applyError
// ---------------------------------------------------------------------------

describe('applyError', () => {
  it('pushes failed system message from Error instance', () => {
    const store = useAgentChatStore()
    store.applyError(new Error('connection refused'))
    const last = store.messages[store.messages.length - 1]
    expect(last.type).toBe('system')
    expect(last.type === 'system' && last.system_subtype).toBe('failed')
    expect(last.type === 'system' && last.markdown).toBe('connection refused')
  })

  it('pushes failed system message from non-Error value (string)', () => {
    const store = useAgentChatStore()
    store.applyError('plain string error')
    const last = store.messages[store.messages.length - 1]
    expect(last.type === 'system' && last.markdown).toBe('plain string error')
  })
})

// ---------------------------------------------------------------------------
// reset() — clears streamingToolGroupIds
// ---------------------------------------------------------------------------

describe('reset() clears streamingToolGroupIds', () => {
  it('streamingToolGroupIds is cleared by reset()', async () => {
    const store = useAgentChatStore()
    // Seed some streaming state
    await seedToolCall(store, 'tc-x', 0)
    await seedToolCall(store, 'tc-y', 1)
    expect(store.messages.filter((m) => m.type === 'tool_group').length).toBe(2)

    store.reset()

    // Messages cleared (covered by existing test) + new groups won't interfere
    expect(store.messages.length).toBe(0)
    // After reset, a new tool_call_start for step 0 should create a fresh group
    await seedToolCall(store, 'tc-new', 0)
    expect(store.messages.filter((m) => m.type === 'tool_group').length).toBe(1)
  })
})
