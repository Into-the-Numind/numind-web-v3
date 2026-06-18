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
import { useAgentChatStore, type StreamingAssistantMessage } from '../agentChat'
import type { AgentRun, AssistantMessage } from '@/types/agent'
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
      created_at: '',
      updated_at: ''
    })
  ),
  fetchNarrationEvents: vi.fn(async () => []),
  cancelRun: vi.fn(async () => ({ run_id: 999, status: 'cancelled' as const })),
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
  // 1. stream_start — establishes optimistic currentRun (T1: BLK-5)
  it('stream_start: sets optimistic running currentRun without adding messages', () => {
    const store = useAgentChatStore()
    // stream_start reads only e.run_id from the envelope (data is ignored).
    store.applyStreamEvent(makeEvent('stream_start', undefined, { run_id: 999 }))
    // No chat bubble is added by stream_start...
    expect(store.messages.length).toBe(0)
    // ...but currentRun is now live so header status / cancel / budget work
    // during streaming (previously stayed null until terminal — BLK-5).
    expect(store.currentRun).not.toBeNull()
    expect(store.currentRun?.id).toBe(999)
    expect(store.currentRun?.status).toBe('running')
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
  // The handler seeds the tool_call with current_state='use' AND an initial
  // 'use' NarrationEvent so the UI shows immediate progress feedback (some
  // tools — e.g. file generation — run for tens of seconds with no further
  // progress events; an empty event list made the UI look frozen). See
  // agentChat.ts tool_call_start handler + commit cf5a77e.
  it('tool_call_start: creates tool_group with tool_call seeded in use state', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-1', 0)
    const groups = store.messages.filter((m) => m.type === 'tool_group')
    expect(groups.length).toBe(1)
    expect(groups[0].type === 'tool_group' && groups[0].tool_calls.length).toBe(1)
    expect(groups[0].type === 'tool_group' && groups[0].tool_calls[0].current_state).toBe('use')
    expect(groups[0].type === 'tool_group' && groups[0].tool_calls[0].tool_call_id).toBe('tc-1')
    // The seeded initial event is the first entry, in 'use' state.
    expect(groups[0].type === 'tool_group' && groups[0].tool_calls[0].events.length).toBe(1)
    expect(groups[0].type === 'tool_group' && groups[0].tool_calls[0].events[0].state).toBe('use')
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

  // agent-exec-ux-followup: the streaming label must surface the concrete query
  // (from input_preview) so a run of searches no longer reads as N identical
  // "正在搜索网络..." — matching the backend tool-display.yaml use_template.
  it('tool_call_start: web_search surfaces the query from input_preview', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('tool_call_start', {
        tool_call_id: 'tc-q',
        tool_name: 'web_search',
        input_preview: { query: '四川莫小派 小红书陪跑', max_results: 5 }
      })
    )
    const group = store.messages.find((m) => m.type === 'tool_group')
    const ev = group?.type === 'tool_group' ? group.tool_calls[0].events[0] : null
    expect(ev?.message).toContain('四川莫小派')
    expect(ev?.message).not.toBe('正在搜索网络...')
  })

  it('tool_call_start: web_search without a query falls back to the generic label', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('tool_call_start', {
        tool_call_id: 'tc-noq',
        tool_name: 'web_search',
        input_preview: {}
      })
    )
    const group = store.messages.find((m) => m.type === 'tool_group')
    const ev = group?.type === 'tool_group' ? group.tool_calls[0].events[0] : null
    expect(ev?.message).toBe('正在搜索网络...')
  })

  // 问题一: load_skill must surface the skill name in BOTH the use-state label
  // ("加载技能：<name>") and the result-state label ("已加载技能：<name>") — the latter
  // reuses skill_name captured at start since tool_call_result carries no input.
  it('tool_call_start + result: load_skill surfaces the skill name', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('tool_call_start', {
        tool_call_id: 'tc-skill',
        tool_name: 'load_skill',
        input_preview: { name: 'docx-author' }
      })
    )
    let group = store.messages.find((m) => m.type === 'tool_group')
    let tc = group?.type === 'tool_group' ? group.tool_calls[0] : null
    expect(tc?.events[0].message).toBe('加载技能：docx-author')
    expect(tc?.skill_name).toBe('docx-author')

    store.applyStreamEvent(
      makeEvent('tool_call_result', { tool_call_id: 'tc-skill', preview: '{"ok":true}' })
    )
    group = store.messages.find((m) => m.type === 'tool_group')
    tc = group?.type === 'tool_group' ? group.tool_calls[0] : null
    const last = tc ? tc.events[tc.events.length - 1] : null
    expect(last?.message).toBe('已加载技能：docx-author')
  })

  it('tool_call_start: kb_search surfaces the query from input_preview', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('tool_call_start', {
        tool_call_id: 'tc-kb',
        tool_name: 'kb_search',
        input_preview: { query: '客群画像' }
      })
    )
    const group = store.messages.find((m) => m.type === 'tool_group')
    const ev = group?.type === 'tool_group' ? group.tool_calls[0].events[0] : null
    expect(ev?.message).toContain('客群画像')
    expect(ev?.message).toContain('知识库')
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
    // events[0] is the seeded 'use' event from tool_call_start; the progress
    // handler pushes a second event.
    expect(tc?.events.length).toBe(2)
    expect(tc?.events[1].state).toBe('progress')
    expect(tc?.events[1].message).toBe('Searching the web')
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
    // events[0] is the seeded 'use' event; the result handler pushes a second.
    expect(tc?.events.length).toBe(2)
    expect(tc?.events[1].state).toBe('result')
  })

  // issue #4 (durable render): a generated image must NOT be pushed as a
  // transient artifact bubble — that bubble was lost on reload. The image is now
  // embedded as markdown in the persisted final answer by the backend, which
  // survives loadSessionSnapshot. So tool_call_result must create NO artifact msg.
  it('tool_call_result: image result does NOT push a transient artifact bubble', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-img', 0)
    store.applyStreamEvent(
      makeEvent('tool_call_result', {
        tool_call_id: 'tc-img',
        preview: '图片已生成',
        artifact_url: 'https://cos.example/agent-outputs/1/x.png?sign=abc',
        artifact_filename: 'x.png',
        artifact_mime: 'image/png',
        duration_ms: 100
      })
    )
    expect(store.messages.some((m) => m.type === 'artifact')).toBe(false)
    // The tool call itself still records the result preview.
    const group = store.messages.find((m) => m.type === 'tool_group')
    const tc = group?.type === 'tool_group' ? group.tool_calls[0] : null
    expect(tc?.current_state).toBe('result')
  })

  // REPRO (customer bug, screenshots 2026-06-09): the tool-call card dumped the
  // raw tool output JSON ({"results":[...]}) as the visible result line. Learners
  // must see a friendly summary, not code. Raw output stays on `preview` for an
  // optional detail view, but the rendered event message must be friendly.
  it('tool_call_result: shows a friendly summary, NOT the raw output JSON', async () => {
    const store = useAgentChatStore()
    await seedToolCall(store, 'tc-raw', 0) // seeded tool_name = web_search
    const rawJson = '{"results":[{"title":"x","url":"https://e.com","snippet":"..."}]}'
    store.applyStreamEvent(
      makeEvent('tool_call_result', {
        tool_call_id: 'tc-raw',
        preview: rawJson,
        duration_ms: 100
      })
    )
    const group = store.messages.find((m) => m.type === 'tool_group')
    const tc = group?.type === 'tool_group' ? group.tool_calls[0] : null
    const resultEvent = tc?.events[tc.events.length - 1]
    // raw output is retained on preview (for a future detail view)…
    expect(tc?.preview).toBe(rawJson)
    // …but the VISIBLE message must be a friendly label, never the raw JSON.
    expect(resultEvent?.message).not.toContain('{')
    expect(resultEvent?.message).not.toContain('results')
    expect(resultEvent?.message).toBe('已获取搜索结果')
  })

  // Unmapped tool → friendly fallback '已完成' (never the raw output).
  it('tool_call_result: unknown tool falls back to a friendly 已完成', async () => {
    const store = useAgentChatStore()
    // seed a tool_call with a tool_name not in TOOL_RESULT_LABELS
    store.applyStreamEvent(
      makeEvent(
        'tool_call_start',
        { tool_call_id: 'tc-x', tool_name: 'some_future_tool', input_digest: 'd' },
        { step: 0 }
      )
    )
    store.applyStreamEvent(
      makeEvent('tool_call_result', {
        tool_call_id: 'tc-x',
        preview: '{"raw":"output"}',
        duration_ms: 1
      })
    )
    const group = store.messages.find((m) => m.type === 'tool_group')
    const tc = group?.type === 'tool_group' ? group.tool_calls[0] : null
    const ev = tc?.events[tc.events.length - 1]
    expect(ev?.message).toBe('已完成')
    expect(ev?.message).not.toContain('{')
  })

  // issue #2: error-only terminals (no preceding 'error' event) surface user_message.
  it('terminal: shows user_message as a failed bubble for error-only terminals', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent(
        'terminal',
        {
          reason: 'max_turns',
          duration_ms: 1,
          step_count: 30,
          user_message: '任务步骤过多，已自动停止。'
        },
        { run_id: 700 }
      )
    )
    const sys = store.messages.find((m) => m.type === 'system')
    expect(sys?.type === 'system' ? sys.markdown : '').toContain('任务步骤过多')
  })

  // issue #2: when an 'error' event already fired, terminal must NOT add a 2nd bubble.
  it('terminal: does not duplicate the failure bubble after an error event', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent(
        'error',
        { code: 'model_error', message: 'AI 服务响应超时，请稍后再试。' },
        { run_id: 701 }
      )
    )
    store.applyStreamEvent(
      makeEvent(
        'terminal',
        {
          reason: 'model_error',
          duration_ms: 1,
          step_count: 1,
          user_message: 'AI 一时没能完成这次任务。'
        },
        { run_id: 701 }
      )
    )
    const failures = store.messages.filter(
      (m) => m.type === 'system' && m.system_subtype === 'failed'
    )
    expect(failures.length).toBe(1)
    expect(failures[0].type === 'system' ? failures[0].markdown : '').toContain('超时')
  })

  // issue #2: a successful terminal (no user_message) must NOT add a failed bubble.
  it('terminal: success terminal does not push a failed bubble', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'completed', duration_ms: 1, step_count: 1 }, { run_id: 702 })
    )
    const failures = store.messages.filter(
      (m) => m.type === 'system' && m.system_subtype === 'failed'
    )
    expect(failures.length).toBe(0)
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
    // events[0] is the seeded 'use' event; the error handler pushes a second.
    expect(tc?.events.length).toBe(2)
    expect(tc?.events[1].state).toBe('error')
    // VISIBLE message must be a neutral friendly line, never the raw error, and
    // must NOT claim the run was skipped/continued (a tool error terminates it).
    expect(tc?.events[1].message).toBe('执行出错')
    expect(tc?.events[1].message).not.toContain('timed out')
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

  // 12. question_prompt — pushes QuestionPromptMessage (questions array)
  it('question_prompt: pushes question_prompt message', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('question_prompt', {
        questions: [
          {
            question: 'Which option?',
            options: [{ label: 'A' }, { label: 'B' }],
            multi_select: false
          }
        ]
      })
    )
    const prompts = store.messages.filter((m) => m.type === 'question_prompt')
    expect(prompts.length).toBe(1)
    const p = prompts[0]
    expect(p.type === 'question_prompt' && p.questions.length).toBe(1)
    expect(p.type === 'question_prompt' && p.questions[0].question).toBe('Which option?')
    expect(p.type === 'question_prompt' && p.questions[0].options.length).toBe(2)
    expect(p.type === 'question_prompt' && p.answer_status).toBe('pending')
    expect(p.type === 'question_prompt' && p.questions[0].multi_select).toBe(false)
  })

  it('question_prompt: pushes ALL questions for a multi-question yield', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('question_prompt', {
        questions: [
          {
            question: '周期？',
            options: [{ label: '90天' }, { label: '180天' }],
            multi_select: false
          },
          {
            question: '客群？',
            options: [{ label: '宝妈' }, { label: '职场人' }],
            multi_select: true
          }
        ]
      })
    )
    const p = store.messages.find((m) => m.type === 'question_prompt')
    expect(p?.type === 'question_prompt' && p.questions.length).toBe(2)
    expect(p?.type === 'question_prompt' && p.questions[1].question).toBe('客群？')
    expect(p?.type === 'question_prompt' && p.questions[1].multi_select).toBe(true)
  })

  it('question_prompt: passes through structured {label, description} options', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent('question_prompt', {
        questions: [
          {
            question: 'Pick one',
            options: [{ label: 'option-x', description: 'desc-x' }, { label: 'option-y' }],
            multi_select: false
          }
        ]
      })
    )
    const p = store.messages.find((m) => m.type === 'question_prompt')
    expect(p?.type === 'question_prompt' && p.questions[0].options[0]).toEqual({
      label: 'option-x',
      description: 'desc-x'
    })
  })

  // T5: answering resumes the run via polling; markQuestionAnswered gives the
  // optimistic "answered" flip for the matching run only.
  it('markQuestionAnswered: flips the matching run pending prompt to answered', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(
      makeEvent(
        'question_prompt',
        {
          questions: [
            { question: 'Q1', options: [{ label: 'A' }, { label: 'B' }], multi_select: false }
          ]
        },
        { run_id: 555 }
      )
    )
    store.applyStreamEvent(
      makeEvent(
        'question_prompt',
        {
          questions: [
            { question: 'Q2', options: [{ label: 'X' }, { label: 'Y' }], multi_select: false }
          ]
        },
        { run_id: 777 }
      )
    )

    store.markQuestionAnswered(555)

    const prompts = store.messages.filter(
      (m): m is import('@/types/agent').QuestionPromptMessage => m.type === 'question_prompt'
    )
    const q555 = prompts.find((p) => p.run_id === 555)
    const q777 = prompts.find((p) => p.run_id === 777)
    expect(q555?.answer_status).toBe('answered')
    // Other run's prompt is untouched.
    expect(q777?.answer_status).toBe('pending')
  })

  // Regression (review P1): waiting_for_user_choice maps to a 'running' status,
  // so narration polling no longer bails on the isRunning guard. It must bail on
  // isWaitingForUser instead, or it fires a false "任务卡住" alarm during the
  // (legitimate) pause while the user reads/answers the question.
  it('pollNarration: no false stuck accumulation while waiting for the user answer', async () => {
    const store = useAgentChatStore()
    store.currentRun = {
      id: 999,
      session_id: 'sess-999',
      user_id: 1,
      agent_skill_id: 1,
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    }
    await store.pollNarration()
    expect(store.stuckSince).toBeNull()
    expect(vi.mocked(api.fetchNarrationEvents)).not.toHaveBeenCalled()
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

  it('terminal: sets currentRun.status to failed for unknown reasons (e.g. "error")', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'error', duration_ms: 500, step_count: 1 })
    )
    expect(store.currentRun?.status).toBe('failed')
  })

  // T1: a run paused for ask_user_question must stay active ("running"), not
  // flash "failed". The question card carries the interaction; isWaitingForUser
  // (state_reason) drives input-disable. Backend frontendStatus (T2) maps the
  // same reason → "running" so reconcileFromDB agrees.
  it('terminal: reason=waiting_for_user_choice keeps run active (running)', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')
    store.applyStreamEvent(
      makeEvent('terminal', {
        reason: 'waiting_for_user_choice',
        duration_ms: 100,
        step_count: 1
      })
    )
    expect(store.currentRun?.status).toBe('running')
    expect(store.currentRun?.state_reason).toBe('waiting_for_user_choice')
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

  // REPRODUCES customer bug: when a run YIELDS for ask_user_question, the backend
  // GetRun still synthesises final_output from the last assistant turn — which is
  // the agent's pre-question prose ("已挖到大量信息。让我先问你："), NOT a final
  // answer. reconcileFromDB then pushed it as a final_answer bubble, so a run that
  // is merely PAUSED for the user's answer looked "回答完毕" (done). A
  // waiting_for_user_choice run must never get a final_answer bubble — the
  // question card is its UI.
  it('reproduce: waiting_for_user_choice must NOT push a final_answer (run is paused)', async () => {
    vi.mocked(api.getRun)
      .mockResolvedValueOnce({
        id: 999,
        session_id: 'sess-999',
        user_id: 1,
        agent_skill_id: 1,
        status: 'running',
        credits_used: 0,
        created_at: '',
        updated_at: ''
      })
      .mockResolvedValueOnce({
        id: 999,
        session_id: 'sess-999',
        user_id: 1,
        agent_skill_id: 1,
        status: 'running', // backend frontendStatus maps waiting_for_user_choice → running
        state_reason: 'waiting_for_user_choice',
        final_output: '已挖到大量信息。但在进入竞品分析前，有几个关键信息需要确认。让我先问你：',
        credits_used: 5,
        created_at: '',
        updated_at: ''
      })

    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')
    store.applyStreamEvent(
      makeEvent('terminal', {
        reason: 'waiting_for_user_choice',
        duration_ms: 100,
        step_count: 1
      })
    )
    await new Promise((r) => setTimeout(r, 10))
    const finalAnswers = store.messages.filter((m) => m.type === 'final_answer')
    expect(finalAnswers.length).toBe(0)
  })

  // REPRODUCES BUG (2026-05-28, agent_run 46/47): when token_delta has
  // already accumulated a streaming AssistantMessage for this run, the
  // terminal handler used to push a SEPARATE final_answer message with the
  // same content (because reconcileFromDB reads run.final_output, which the
  // backend GetRun synthesises from agent_run.messages last assistant turn).
  // Result: user sees TWO identical bubbles, one still showing the streaming
  // cursor (never finalized) and one with the action footer.
  //
  // Contract: reconcileFromDB must prefer to finalize the existing streaming
  // bubble in-place (markdown = authoritative final_output, isStreaming=false).
  // It should fall back to pushing a final_answer ONLY when no streaming
  // bubble exists for the run (e.g. backend never emitted token_delta).
  it('reproduce: terminal must not duplicate a streaming bubble as final_answer', async () => {
    vi.mocked(api.getRun)
      .mockResolvedValueOnce({
        id: 999,
        session_id: 'sess-999',
        user_id: 1,
        agent_skill_id: 1,
        status: 'running',
        credits_used: 0,
        created_at: '',
        updated_at: ''
      })
      .mockResolvedValueOnce({
        id: 999,
        session_id: 'sess-999',
        user_id: 1,
        agent_skill_id: 1,
        status: 'completed',
        // Same content as what token_delta accumulated below.
        final_output: 'Hello world from streaming',
        credits_used: 10,
        created_at: '',
        updated_at: ''
      })

    const store = useAgentChatStore()
    await store.startNewRun(1, 'test')

    // Simulate the streaming path: token_delta accumulates into an AssistantMessage.
    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-stream-1', text: 'Hello world from streaming' })
    )
    const streamingBefore = store.messages.filter((m) => m.type === 'assistant')
    expect(streamingBefore.length).toBe(1)
    expect(streamingBefore[0].type === 'assistant' && streamingBefore[0].isStreaming).toBe(true)

    // Terminal event triggers reconcileFromDB which sees run.final_output.
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 1 })
    )
    await new Promise((r) => setTimeout(r, 10))

    // EXACTLY ONE bubble for this assistant turn — no duplicate.
    const assistantLike = store.messages.filter(
      (m) => m.type === 'assistant' || m.type === 'final_answer'
    )
    expect(assistantLike.length).toBe(1)

    // The bubble carries the authoritative content + is no longer streaming.
    const bubble = assistantLike[0]
    expect(bubble.type).toBe('assistant')
    if (bubble.type === 'assistant') {
      expect(bubble.markdown).toBe('Hello world from streaming')
      expect(bubble.isStreaming).toBe(false)
    }
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

  it('error: uses a friendly Chinese fallback when payload.message is absent', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('error', { code: 'internal' }))
    const sysMsgs = store.messages.filter((m) => m.type === 'system')
    expect(sysMsgs[0].type === 'system' && sysMsgs[0].markdown).toBe('服务暂时不可用，请稍后再试。')
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

// ---------------------------------------------------------------------------
// reconcileFromDB multi-run / multi-step isolation (P1#1 + P1#2)
//
// Reviewer-flagged latent issues in agent-stream-reconcile-deduplicate hotfix:
//
//   P1#1: streamingBubble search ignores run_id. When multiple runs leave
//         streaming bubbles in messages[] (multi-run concurrency or session
//         restore), reconcileFromDB(runA) silently finalizes runB's bubble
//         because `[...messages].reverse().find()` grabs the most-recently-
//         pushed bubble regardless of which run it belongs to.
//
//   P1#2: Multi-step ReAct produces multiple streaming bubbles for the same
//         run (one per step). Earlier-step bubbles SHOULD be finalized by
//         their own assistant_message events, but if one is dropped (network
//         jitter, partial SSE), the final terminal handler must catch them
//         all — not just the last one. Current find()-then-mutate finalizes
//         only the last bubble; earlier bubbles stay isStreaming=true.
// ---------------------------------------------------------------------------

/** Build a completed AgentRun fixture for getRun mock returns. */
function completedRun(id: number, finalOutput: string): AgentRun {
  return {
    id,
    session_id: `sess-${id}`,
    user_id: 1,
    agent_skill_id: 1,
    status: 'completed',
    final_output: finalOutput,
    credits_used: 10,
    created_at: '',
    updated_at: ''
  }
}

/** Build a running AgentRun fixture used by startNewRun bootstrap. */
function runningRun(id: number): AgentRun {
  return {
    id,
    session_id: `sess-${id}`,
    user_id: 1,
    agent_skill_id: 1,
    status: 'running',
    credits_used: 0,
    created_at: '',
    updated_at: ''
  }
}

describe('reconcileFromDB multi-run isolation (P1#1)', () => {
  it('reproduce: reconcileFromDB(runA) must not finalize runB streaming bubble', async () => {
    // Sequencing:
    //   getRun call #1: startNewRun bootstrap for run 100 (running)
    //   getRun call #2: reconcileFromDB(100) — returns final_output for run A
    vi.mocked(api.getRun)
      .mockResolvedValueOnce(runningRun(100))
      .mockResolvedValueOnce(completedRun(100, 'Run A FINAL'))

    const store = useAgentChatStore()
    await store.startNewRun(1, 'kickoff for run A')

    // Token deltas for run 100 (A)
    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-A', text: 'Run A response' }, { run_id: 100 })
    )
    // Token deltas for run 200 (B) — simulates concurrent run / session restore;
    // pushes a second streaming bubble that is LAST in messages[].
    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-B', text: 'Run B response' }, { run_id: 200 })
    )

    expect(store.messages.filter((m) => m.type === 'assistant').length).toBe(2)

    // Terminal for run A → reconcileFromDB(100)
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 1 }, { run_id: 100 })
    )
    await new Promise((r) => setTimeout(r, 10))

    const bubbles = store.messages.filter(
      (m): m is import('@/types/agent').AssistantMessage => m.type === 'assistant'
    )
    const runABubble = bubbles.find(
      (m) => (m as StreamingAssistantMessage)._stream_id === 'msg-A'
    ) as StreamingAssistantMessage | undefined
    const runBBubble = bubbles.find(
      (m) => (m as StreamingAssistantMessage)._stream_id === 'msg-B'
    ) as StreamingAssistantMessage | undefined

    // Run A's bubble is the one that should be finalized.
    expect(runABubble?.markdown).toBe('Run A FINAL')
    expect(runABubble?.isStreaming).toBe(false)

    // Run B's bubble must be untouched — still streaming, original content.
    expect(runBBubble?.markdown).toBe('Run B response')
    expect(runBBubble?.isStreaming).toBe(true)
  })

  it('finalize tags streaming bubble with _run_id matching the event run_id', async () => {
    // Only startNewRun calls getRun in this test — DO NOT queue a second
    // once-value, or it will bleed into the next test (vi.clearAllMocks does
    // NOT drain the mockResolvedValueOnce queue).
    vi.mocked(api.getRun).mockResolvedValueOnce(runningRun(100))

    const store = useAgentChatStore()
    await store.startNewRun(1, 'kickoff')

    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-A', text: 'A...' }, { run_id: 100 })
    )

    const bubble = store.messages.find((m) => m.type === 'assistant')
    // After fix: streaming bubble must carry _run_id=100.
    expect((bubble as StreamingAssistantMessage | undefined)?._run_id).toBe(100)
  })
})

describe('reconcileFromDB multi-step finalize (P1#2)', () => {
  it('reproduce: multi-step bubbles for same run — terminal finalizes ALL, not only last', async () => {
    vi.mocked(api.getRun)
      .mockResolvedValueOnce(runningRun(999))
      .mockResolvedValueOnce(completedRun(999, 'Final step output'))

    const store = useAgentChatStore()
    await store.startNewRun(1, 'multi-step')

    // Two streaming bubbles for SAME run, different steps.
    // Simulates assistant_message being dropped for step 0 (network jitter / partial SSE).
    store.applyStreamEvent(
      makeEvent(
        'token_delta',
        { message_id: 'msg-step0', text: 'step 0 thinking' },
        { run_id: 999, step: 0 }
      )
    )
    store.applyStreamEvent(
      makeEvent(
        'token_delta',
        { message_id: 'msg-step1', text: 'step 1 thinking' },
        { run_id: 999, step: 1 }
      )
    )

    const before = store.messages.filter((m) => m.type === 'assistant')
    expect(before.length).toBe(2)
    expect(
      before.every((m) => m.type === 'assistant' && (m as { isStreaming?: boolean }).isStreaming)
    ).toBe(true)

    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 2 }, { run_id: 999 })
    )
    await new Promise((r) => setTimeout(r, 10))

    const after = store.messages.filter((m): m is AssistantMessage => m.type === 'assistant')
    expect(after.length).toBe(2)

    // ALL bubbles for run 999 are no longer streaming.
    expect(after.every((m) => m.isStreaming === false)).toBe(true)

    // Address bubbles by their _stream_id (semantic identity) rather than
    // by array index — guards against future ordering changes if a
    // tool_group is interleaved between steps.
    const findByStreamId = (sid: string) =>
      after.find((m) => (m as StreamingAssistantMessage)._stream_id === sid)
    const step0 = findByStreamId('msg-step0')
    const step1 = findByStreamId('msg-step1')

    // The LAST step's bubble carries the DB-authoritative final_output.
    expect(step1?.markdown).toBe('Final step output')

    // Earlier step's markdown is preserved (not overwritten with final_output).
    expect(step0?.markdown).toBe('step 0 thinking')
  })

  it('terminal does not finalize bubbles belonging to a different run (cross-run guard)', async () => {
    // Start run 999, mock reconcile to return final for run 999
    vi.mocked(api.getRun)
      .mockResolvedValueOnce(runningRun(999))
      .mockResolvedValueOnce(completedRun(999, 'For 999 only'))

    const store = useAgentChatStore()
    await store.startNewRun(1, 'cross-run guard')

    // Bubble for run 999
    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-999', text: 'belongs to 999' }, { run_id: 999 })
    )
    // Bubble for run 888 (stale from earlier session)
    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-888', text: 'stale 888' }, { run_id: 888 })
    )

    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 500, step_count: 1 }, { run_id: 999 })
    )
    await new Promise((r) => setTimeout(r, 10))

    const stale = store.messages.find(
      (m) => m.type === 'assistant' && (m as StreamingAssistantMessage)._stream_id === 'msg-888'
    ) as StreamingAssistantMessage | undefined
    expect(stale?.markdown).toBe('stale 888')
    expect(stale?.isStreaming).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// reconcileFromDB edge cases (P2 — regression protection)
// ---------------------------------------------------------------------------

describe('reconcileFromDB edge cases (P2)', () => {
  it('idempotent on early-return path: double terminal with streaming bubble', async () => {
    // Different content on each reconcile call — proves the second call
    // doesn't re-overwrite a finalized bubble (would write 'GHOST-overwrite'
    // if the isStreaming guard were missing) AND doesn't fall through to
    // push a duplicate final_answer (the fallback now dedups by any
    // existing UI for the run, not just final_answer).
    vi.mocked(api.getRun)
      .mockResolvedValueOnce(runningRun(999))
      .mockResolvedValueOnce(completedRun(999, 'Answer'))
      .mockResolvedValueOnce(completedRun(999, 'GHOST-overwrite'))

    const store = useAgentChatStore()
    await store.startNewRun(1, 'idem-early')

    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-1', text: 'draft' }, { run_id: 999 })
    )

    // First terminal — finalizes bubble in place with 'Answer'.
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 1 }, { run_id: 999 })
    )
    await new Promise((r) => setTimeout(r, 10))

    // Second terminal — must be a no-op on UI surface.
    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 1000, step_count: 1 }, { run_id: 999 })
    )
    await new Promise((r) => setTimeout(r, 10))

    const assistants = store.messages.filter((m): m is AssistantMessage => m.type === 'assistant')
    const finals = store.messages.filter((m) => m.type === 'final_answer')
    expect(assistants.length).toBe(1)
    expect(assistants[0].markdown).toBe('Answer') // NOT 'GHOST-overwrite'
    expect(assistants[0].isStreaming).toBe(false)
    expect(finals.length).toBe(0)
  })

  it('empty final_output: streaming bubble preserves accumulated markdown, just stops streaming', async () => {
    vi.mocked(api.getRun)
      .mockResolvedValueOnce(runningRun(999))
      .mockResolvedValueOnce(completedRun(999, '')) // empty final_output

    const store = useAgentChatStore()
    await store.startNewRun(1, 'empty-final')

    store.applyStreamEvent(
      makeEvent(
        'token_delta',
        { message_id: 'msg-1', text: 'accumulated content' },
        { run_id: 999 }
      )
    )

    store.applyStreamEvent(
      makeEvent('terminal', { reason: 'done', duration_ms: 500, step_count: 1 }, { run_id: 999 })
    )
    await new Promise((r) => setTimeout(r, 10))

    const bubble = store.messages.find((m) => m.type === 'assistant')
    expect(bubble?.type === 'assistant' && (bubble as { markdown: string }).markdown).toBe(
      'accumulated content'
    )
    expect(bubble?.type === 'assistant' && (bubble as { isStreaming?: boolean }).isStreaming).toBe(
      false
    )
    // No fallback final_answer pushed (since bubble exists).
    expect(store.messages.filter((m) => m.type === 'final_answer').length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// T3/TD4 — in-run seq ordering of streamed timeline items
// ---------------------------------------------------------------------------
describe('applyStreamEvent: seq ordering (T3)', () => {
  it('reorders the run tail by seq when items arrive out of order', () => {
    const store = useAgentChatStore()
    store.applyStreamEvent(makeEvent('stream_start', undefined, { run_id: 7, seq: 1 }))
    // tool_call_start arrives FIRST with a higher seq...
    store.applyStreamEvent(
      makeEvent(
        'tool_call_start',
        { tool_call_id: 'tc-1', tool_name: 'web_search', input_preview: {} },
        { run_id: 7, seq: 5, step: 0 }
      )
    )
    // ...then a token_delta arrives with a LOWER seq (out of order).
    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-1', text: 'hi' }, { run_id: 7, seq: 3 })
    )
    // The assistant message (seq 3) must end up BEFORE the tool group (seq 5).
    expect(store.messages.map((m) => m.type)).toEqual(['assistant', 'tool_group'])
    expect(store.messages[0].seq).toBe(3)
    expect(store.messages[1].seq).toBe(5)
  })

  it('leaves in-order arrival untouched (fast-path no-op) and never reorders across the user message', () => {
    const store = useAgentChatStore()
    // A prior user message (no seq) must never be reordered into the run's tail.
    store.messages.push({ id: 'u1', type: 'user', text: 'q', timestamp: '2026-05-27T10:00:00Z' })
    store.applyStreamEvent(makeEvent('stream_start', undefined, { run_id: 7, seq: 1 }))
    store.applyStreamEvent(
      makeEvent('token_delta', { message_id: 'msg-1', text: 'hi' }, { run_id: 7, seq: 2 })
    )
    store.applyStreamEvent(
      makeEvent(
        'tool_call_start',
        { tool_call_id: 'tc-1', tool_name: 'web_search', input_preview: {} },
        { run_id: 7, seq: 3, step: 0 }
      )
    )
    expect(store.messages.map((m) => m.type)).toEqual(['user', 'assistant', 'tool_group'])
  })
})
