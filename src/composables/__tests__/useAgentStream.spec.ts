/**
 * useAgentStream.spec.ts — Unit tests for the useAgentStream composable (T11)
 *
 * Covers:
 *  1. Happy path: onEvent callback correctly forwards to store.applyStreamEvent
 *  2. 409 (AgentStreamConflict): fallbackPolling=true + startStatusPolling called
 *  3. Other error: store.applyError called with the thrown error
 *  4. Abort: AbortController signal passed to streamAgentRun; stop() aborts
 *  5. isStreaming lifecycle: true during stream, false after resolution
 *  6. Concurrent guard: second start() while streaming is ignored
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { AgentStreamEvent } from '@/types/agent-stream'
import { AgentStreamConflict } from '@/types/agent-stream'
import type { StreamStartPayload } from '@/types/agent-stream'
import type { CreateRunRequest } from '@/types/agent'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the SSE API — replace with controllable function
const mockStreamAgentRun = vi.fn<
  [Record<string, unknown>, (e: AgentStreamEvent) => void, AbortSignal | undefined],
  Promise<void>
>()
const mockAnswerAndResumeStream = vi.fn<
  [number, Record<string, unknown>, (e: AgentStreamEvent) => void, AbortSignal | undefined],
  Promise<void>
>()
const mockStreamAgentRunEvents = vi.fn<
  [number, string, (e: AgentStreamEvent) => void, AbortSignal | undefined],
  Promise<void>
>()
vi.mock('@/api/agent-stream', () => ({
  streamAgentRun: (...args: unknown[]) =>
    mockStreamAgentRun(...(args as Parameters<typeof mockStreamAgentRun>)),
  answerAndResumeStream: (...args: unknown[]) =>
    mockAnswerAndResumeStream(...(args as Parameters<typeof mockAnswerAndResumeStream>)),
  streamAgentRunEvents: (...args: unknown[]) =>
    mockStreamAgentRunEvents(...(args as Parameters<typeof mockStreamAgentRunEvents>)),
  compareAgentStreamCursor: (a: string, b: string) => a.localeCompare(b)
}))

// Mock the store
const mockApplyStreamEvent = vi.fn()
const mockApplyError = vi.fn()
const mockAppendUserMessage = vi.fn()
const mockCurrentSessionEpoch = vi.fn(() => 7)
const mockIsCurrentSessionEpoch = vi.fn(() => true)
const mockStore = {
  applyStreamEvent: mockApplyStreamEvent,
  applyError: mockApplyError,
  appendUserMessage: mockAppendUserMessage,
  currentSessionEpoch: mockCurrentSessionEpoch,
  isCurrentSessionEpoch: mockIsCurrentSessionEpoch,
  currentRun: { id: 42 } as { id: number; status?: string; updated_at?: string } | null,
  sendingMessage: false,
  setRealtimeContinuationRun: vi.fn(),
  transportCursorForRun: vi.fn(() => ''),
  recordTransportCursor: vi.fn(),
  clearTransportCursor: vi.fn()
}
vi.mock('@/stores/agentChat', () => ({
  useAgentChatStore: () => mockStore
}))

// Mock useAgentRun composable — capture startStatusPolling
const mockStartStatusPolling = vi.fn()
vi.mock('@/composables/useAgentRun', () => ({
  useAgentRun: () => ({
    start: vi.fn(),
    cancel: vi.fn(),
    refresh: vi.fn(),
    startStatusPolling: mockStartStatusPolling,
    stopStatusPolling: vi.fn()
  })
}))

// Import AFTER mocks are set up
import { useAgentStream } from '../useAgentStream'

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------
const baseReq: CreateRunRequest = {
  agent_skill_id: 1,
  input_text: 'hello agent',
  session_id: 'sess-1'
}

function makeEvent(type: AgentStreamEvent['type']): AgentStreamEvent {
  return { type, seq: 1, ts: '2026-05-27T10:00:00Z', run_id: 42 }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockStreamAgentRun.mockReset()
  mockAnswerAndResumeStream.mockReset()
  mockStreamAgentRunEvents.mockReset()
  mockStore.transportCursorForRun.mockReset()
  mockStore.transportCursorForRun.mockReturnValue('')
  mockCurrentSessionEpoch.mockReturnValue(7)
  mockIsCurrentSessionEpoch.mockReturnValue(true)
  mockStore.currentRun = { id: 42 }
  mockStore.sendingMessage = false
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAgentStream', () => {
  // 1. Happy path
  it('happy path: streamAgentRun is called and onEvent forwards to store.applyStreamEvent', async () => {
    mockStreamAgentRun.mockImplementationOnce(async (_req, onEvent) => {
      onEvent(makeEvent('stream_start'))
      onEvent(makeEvent('token_delta'))
      onEvent(makeEvent('terminal'))
    })

    const { start } = useAgentStream()
    await start(baseReq)

    expect(mockStreamAgentRun).toHaveBeenCalledOnce()
    // Verify the request payload was forwarded
    expect(mockStreamAgentRun.mock.calls[0][0]).toMatchObject({
      agent_skill_id: 1,
      input_text: 'hello agent'
    })
    // All 3 events forwarded to store
    expect(mockApplyStreamEvent).toHaveBeenCalledTimes(3)
    expect(mockApplyStreamEvent.mock.calls[0][0].type).toBe('stream_start')
    expect(mockApplyStreamEvent.mock.calls[1][0].type).toBe('token_delta')
    expect(mockApplyStreamEvent.mock.calls[2][0].type).toBe('terminal')
    expect(mockApplyStreamEvent.mock.calls.every(([, epoch]) => epoch === 7)).toBe(true)
  })

  // 2. 409 AgentStreamConflict
  it('409 conflict: sets fallbackPolling=true and calls startStatusPolling', async () => {
    mockStreamAgentRun.mockRejectedValueOnce(new AgentStreamConflict(99))

    const { start, fallbackPolling } = useAgentStream()
    await start(baseReq)

    expect(fallbackPolling.value).toBe(true)
    expect(mockStartStatusPolling).toHaveBeenCalledOnce()
    expect(mockApplyError).not.toHaveBeenCalled()
  })

  // 3. Other error (non-409)
  it('network error: calls store.applyError with the thrown error', async () => {
    const boom = new Error('connection reset')
    mockStreamAgentRun.mockRejectedValueOnce(boom)

    const { start, fallbackPolling } = useAgentStream()
    await start(baseReq)

    expect(mockApplyError).toHaveBeenCalledWith(boom, 7)
    expect(fallbackPolling.value).toBe(false)
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
  })

  // 4. Abort — stop() triggers AbortController
  it('abort: AbortSignal is passed to streamAgentRun; stop() aborts without calling applyError', async () => {
    let capturedSignal: AbortSignal | undefined

    mockStreamAgentRun.mockImplementationOnce(async (_req, _onEvent, signal) => {
      capturedSignal = signal
      // Simulate a slow stream that eventually gets aborted
      await new Promise<void>((resolve, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }
        // Never resolves on its own — waiting for abort
      })
    })

    const { start, stop } = useAgentStream()
    const streamPromise = start(baseReq)

    // Ensure streamAgentRun has been called and the signal is captured
    await new Promise((r) => setTimeout(r, 0))
    expect(capturedSignal).toBeDefined()

    stop()
    await streamPromise

    // AbortError must NOT trigger applyError
    expect(mockApplyError).not.toHaveBeenCalled()
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
  })

  // 5. isStreaming lifecycle
  it('isStreaming: true during stream, false after completion', async () => {
    let resolveStream!: () => void
    mockStreamAgentRun.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStream = resolve
        })
    )

    const { start, isStreaming } = useAgentStream()
    expect(isStreaming.value).toBe(false)

    const streamPromise = start(baseReq)
    // Give the async function a tick to reach the await
    await new Promise((r) => setTimeout(r, 0))
    expect(isStreaming.value).toBe(true)

    resolveStream()
    await streamPromise
    expect(isStreaming.value).toBe(false)
  })

  // 6. Concurrent guard
  it('concurrent guard: second start() while already streaming is a no-op', async () => {
    let resolveFirst!: () => void
    mockStreamAgentRun.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve
        })
    )

    const { start } = useAgentStream()
    const first = start(baseReq)
    await new Promise((r) => setTimeout(r, 0)) // let first get into streaming state

    // Second call while first is in progress
    await start(baseReq)
    // streamAgentRun should only have been called once
    expect(mockStreamAgentRun).toHaveBeenCalledOnce()

    resolveFirst()
    await first
  })

  // 8. REPRODUCES BUG (2026-05-28): user bubble never appears in chat
  //
  // T14 commit 07dad3f wired AgentChatView.handleSend to useAgentStream.start
  // but the new streaming path does NOT push the user's message into store.messages
  // (the old startNewRun path at agentChat.ts:176 did). Because applyStreamEvent
  // has no `user_message` case either, the user's chat bubble never appears even
  // when the SSE stream works perfectly.
  //
  // Contract: start() must call store.appendUserMessage with input_text + attachments
  // BEFORE invoking streamAgentRun, so the bubble is optimistically rendered.
  it('reproduce: start() must append user message to store before opening SSE', async () => {
    // streamAgentRun resolves immediately (we are not testing the stream itself)
    mockStreamAgentRun.mockResolvedValueOnce(undefined)
    mockStore.currentRun = null

    const { start } = useAgentStream()
    await start({
      agent_skill_id: 1,
      input_text: 'hello agent',
      session_id: 'sess-1',
      attachment_urls: ['cos://a.png']
    })

    // 1) appendUserMessage MUST be called
    expect(mockAppendUserMessage).toHaveBeenCalledOnce()

    // 2) called with the user's text + attachments
    expect(mockAppendUserMessage.mock.calls[0][0]).toMatchObject({
      input_text: 'hello agent',
      attachment_urls: ['cos://a.png']
    })

    // 3) called BEFORE streamAgentRun (optimistic push, not after stream finishes)
    const appendOrder = mockAppendUserMessage.mock.invocationCallOrder[0]
    const streamOrder = mockStreamAgentRun.mock.invocationCallOrder[0]
    expect(appendOrder).toBeLessThan(streamOrder)
  })

  // 7. fallbackPolling resets to false on next start()
  it('fallbackPolling resets to false at start of next call', async () => {
    mockStreamAgentRun.mockRejectedValueOnce(new AgentStreamConflict(99))
    const { start, fallbackPolling } = useAgentStream()
    await start(baseReq)
    expect(fallbackPolling.value).toBe(true)

    // Now a successful stream
    mockStreamAgentRun.mockResolvedValueOnce(undefined)
    mockStore.currentRun = null
    await start(baseReq)
    expect(fallbackPolling.value).toBe(false)
  })

  it('external-action terminal attaches from the last cursor and forwards post-card events', async () => {
    mockStreamAgentRun.mockImplementationOnce(async (_req, onEvent) => {
      onEvent({ ...makeEvent('stream_start'), transport_cursor: '1000-0' })
      onEvent({ ...makeEvent('external_action'), transport_cursor: '1001-0' })
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '1002-0',
        data: { reason: 'waiting_for_user_choice' }
      })
    })
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, _after, onEvent) => {
      onEvent({ ...makeEvent('reasoning_delta'), transport_cursor: '2000-0' })
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '2001-0',
        data: { reason: 'completed' }
      })
    })

    const { start } = useAgentStream()
    await start(baseReq)

    expect(mockStreamAgentRunEvents).toHaveBeenCalledOnce()
    expect(mockStreamAgentRunEvents.mock.calls[0][0]).toBe(42)
    expect(mockStreamAgentRunEvents.mock.calls[0][1]).toBe('1002-0')
    expect(mockApplyStreamEvent.mock.calls.map(([event]) => event.type)).toContain(
      'reasoning_delta'
    )
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
  })

  it('reconnects from the confirmed cursor when the initial SSE rejects after the card', async () => {
    mockStreamAgentRun.mockImplementationOnce(async (_req, onEvent) => {
      onEvent({ ...makeEvent('stream_start'), transport_cursor: '1000-0' })
      onEvent({ ...makeEvent('external_action'), transport_cursor: '1001-0' })
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '1002-0',
        data: { reason: 'waiting_for_user_choice' }
      })
      throw new Error('proxy reset after waiting frame')
    })
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, _after, onEvent) => {
      onEvent({ ...makeEvent('token_delta'), transport_cursor: '2000-0' })
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '2001-0',
        data: { reason: 'completed' }
      })
    })

    const { start } = useAgentStream()
    await start(baseReq)

    expect(mockStreamAgentRunEvents).toHaveBeenCalledOnce()
    expect(mockStreamAgentRunEvents.mock.calls[0][1]).toBe('1002-0')
    expect(mockApplyError).not.toHaveBeenCalled()
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
  })

  it('attaches a rebuilt tab from the server-owned external-pause baseline', async () => {
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, _after, onEvent) => {
      onEvent({ ...makeEvent('stream_start'), transport_cursor: '3000-0' })
      onEvent({ ...makeEvent('reasoning_delta'), transport_cursor: '3001-0' })
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '3002-0',
        data: { reason: 'completed' }
      })
    })

    const { attachContinuation } = useAgentStream()
    await attachContinuation(42)

    expect(mockStreamAgentRunEvents).toHaveBeenCalledOnce()
    expect(mockStreamAgentRunEvents.mock.calls[0][0]).toBe(42)
    expect(mockStreamAgentRunEvents.mock.calls[0][1]).toBe('pause')
    expect(mockApplyStreamEvent.mock.calls.map(([event]) => event.type)).toContain(
      'reasoning_delta'
    )
    expect(mockStore.clearTransportCursor).toHaveBeenCalledWith(42)
  })

  it('attachRunEvents attaches ordinary active run from the beginning when no cursor exists', async () => {
    mockStore.transportCursorForRun.mockReturnValueOnce('')
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, after, onEvent) => {
      expect(after).toBe('')
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '10-0',
        data: { reason: 'completed' }
      })
    })

    const { attachRunEvents } = useAgentStream()
    await attachRunEvents(42)

    expect(mockStreamAgentRunEvents).toHaveBeenCalledWith(
      42,
      '',
      expect.any(Function),
      expect.any(AbortSignal)
    )
  })

  it('attachRunEvents uses saved cursor when present', async () => {
    mockStore.transportCursorForRun.mockReturnValueOnce('5-0')
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, after, onEvent) => {
      expect(after).toBe('5-0')
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '6-0',
        data: { reason: 'completed' }
      })
    })

    const { attachRunEvents } = useAgentStream()
    await attachRunEvents(42)

    expect(mockStreamAgentRunEvents.mock.calls[0][1]).toBe('5-0')
  })

  it('attachRunEvents explicit after takes precedence over baseline', async () => {
    mockStore.transportCursorForRun.mockReturnValue('5-0')
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, after, onEvent) => {
      expect(after).toBe('cursor-a')
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: 'cursor-z',
        data: { reason: 'completed' }
      })
    })

    const { attachRunEvents } = useAgentStream()
    await attachRunEvents(42, { after: 'cursor-a', baseline: 'from_start' })

    expect(mockStreamAgentRunEvents.mock.calls[0][1]).toBe('cursor-a')
  })

  it("attachRunEvents baseline 'from_start' ignores saved cursor", async () => {
    mockStore.transportCursorForRun.mockReturnValue('5-0')
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, after, onEvent) => {
      expect(after).toBe('')
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '10-0',
        data: { reason: 'completed' }
      })
    })

    const { attachRunEvents } = useAgentStream()
    await attachRunEvents(42, { baseline: 'from_start' })

    expect(mockStreamAgentRunEvents.mock.calls[0][1]).toBe('')
  })

  it('attachContinuation still defaults to pause when no cursor or after exists', async () => {
    mockStore.transportCursorForRun.mockReturnValueOnce('')
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, after, onEvent) => {
      expect(after).toBe('pause')
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '10-0',
        data: { reason: 'completed' }
      })
    })

    const { attachContinuation } = useAgentStream()
    await attachContinuation(42)

    expect(mockStreamAgentRunEvents.mock.calls[0][1]).toBe('pause')
  })

  it('start falls back to attachRunEvents when initial stream ends before terminal', async () => {
    mockStore.currentRun = { id: 42, status: 'running' }
    mockStreamAgentRun.mockImplementationOnce(async (_req, onEvent) => {
      onEvent({ ...makeEvent('stream_start'), transport_cursor: '1-0' })
    })
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, _after, onEvent) => {
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '2-0',
        data: { reason: 'completed' }
      })
    })

    const { start } = useAgentStream()
    await start(baseReq)

    expect(mockStreamAgentRunEvents).toHaveBeenCalled()
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
  })

  it('start treats waiting_for_user_choice terminal as a normal pause boundary', async () => {
    mockStore.currentRun = { id: 42, status: 'running' }
    mockStreamAgentRun.mockImplementationOnce(async (_req, onEvent) => {
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '1-0',
        data: { reason: 'waiting_for_user_choice' }
      })
      throw new Error('observer closed after pause')
    })

    const { start } = useAgentStream()
    await start(baseReq)

    expect(mockStreamAgentRunEvents).not.toHaveBeenCalled()
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
    expect(mockApplyError).not.toHaveBeenCalled()
  })

  it('start stream early-ended and attach failure starts polling instead of applyError', async () => {
    vi.useFakeTimers()
    mockStore.currentRun = { id: 42, status: 'running' }
    mockStreamAgentRun.mockImplementationOnce(async (_req, onEvent) => {
      onEvent({ ...makeEvent('stream_start'), transport_cursor: '1-0' })
    })
    mockStreamAgentRunEvents.mockRejectedValue(new Error('events unavailable'))

    try {
      const { start, fallbackPolling } = useAgentStream()
      const promise = start(baseReq)
      await vi.advanceTimersByTimeAsync(2000)
      await promise

      expect(fallbackPolling.value).toBe(true)
      expect(mockStartStatusPolling).toHaveBeenCalledOnce()
      expect(mockApplyError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('start does not mask a real stream error after non-terminal frames', async () => {
    const streamError = new Error('stream rejected')
    mockStore.currentRun = { id: 42, status: 'running' }
    mockStreamAgentRun.mockImplementationOnce(async (_req, onEvent) => {
      onEvent({ ...makeEvent('stream_start'), transport_cursor: '1-0' })
      throw streamError
    })

    const { start } = useAgentStream()
    await start(baseReq)

    expect(mockStreamAgentRunEvents).not.toHaveBeenCalled()
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
    expect(mockApplyError).toHaveBeenCalledWith(streamError, 7)
  })

  it('terminal clears cursor and duplicate stale cursor events are ignored', async () => {
    mockStore.transportCursorForRun.mockReturnValue('b')
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, _after, onEvent) => {
      onEvent({ ...makeEvent('token_delta'), transport_cursor: 'a' })
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: 'c',
        data: { reason: 'completed' }
      })
    })

    const { attachRunEvents } = useAgentStream()
    await attachRunEvents(42)

    expect(mockApplyStreamEvent).toHaveBeenCalledTimes(1)
    expect(mockApplyStreamEvent.mock.calls[0][0].type).toBe('terminal')
    expect(mockStore.recordTransportCursor).not.toHaveBeenCalledWith(42, 'a')
    expect(mockStore.clearTransportCursor).toHaveBeenCalledWith(42)
  })

  it('attachRunEvents treats waiting_for_user_choice terminal as a normal observer end', async () => {
    mockStreamAgentRunEvents.mockImplementationOnce(async (_runId, _after, onEvent) => {
      onEvent({
        ...makeEvent('terminal'),
        transport_cursor: '10-0',
        data: { reason: 'waiting_for_user_choice' }
      })
    })

    const { attachRunEvents } = useAgentStream()
    await attachRunEvents(42)

    expect(mockStreamAgentRunEvents).toHaveBeenCalledOnce()
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
    expect(mockApplyError).not.toHaveBeenCalled()
    expect(mockStore.recordTransportCursor).toHaveBeenCalledWith(42, '10-0')
    expect(mockStore.clearTransportCursor).not.toHaveBeenCalledWith(42)
  })

  it('StreamStartPayload accepts observer_fallback for synthetic observer fallback starts', () => {
    const payload: StreamStartPayload = {
      session_id: 'sess-1',
      run_id: 42,
      observer_fallback: true
    }

    expect(payload.observer_fallback).toBe(true)
  })

})

// ─── issue4 (dev): no narration prose after answering (poll-only resume) ──────
//
// Repro: when the user answers an ask_user_question, the resumed leg must STREAM
// its prose narration back through the same applyStreamEvent pipeline as the
// first leg. The old poll-only path (narration.start + startStatusPolling) only
// pulled tool narration + the trailing final_answer — the assistant's running
// prose never arrived, leaving the card with "只剩工具记录、无正文".
//
// Contract under test: useAgentStream exposes startResume({ runId, answers })
// which opens the SSE answer-stream (answerAndResumeStream) and forwards every
// event to store.applyStreamEvent. EXPECTED TO FAIL before T5 (startResume is
// undefined / answerAndResumeStream is never called).
describe('useAgentStream — startResume (issue4: stream answer-resume)', () => {
  const answers = { '你想要哪个格式？': { selected: ['PDF'] } }

  it('startResume opens the SSE answer-stream and forwards events to the store', async () => {
    mockAnswerAndResumeStream.mockImplementationOnce(async (_runId, _answers, onEvent) => {
      onEvent(makeEvent('token_delta'))
      onEvent(makeEvent('terminal'))
    })

    const stream = useAgentStream()
    // The poll-only resume (the bug) never touches the streaming API.
    expect(typeof stream.startResume).toBe('function')

    await stream.startResume({ runId: 42, answers })

    // The streaming answer-resume endpoint MUST be invoked with runId + answers.
    expect(mockAnswerAndResumeStream).toHaveBeenCalledOnce()
    expect(mockAnswerAndResumeStream.mock.calls[0][0]).toBe(42)
    expect(mockAnswerAndResumeStream.mock.calls[0][1]).toEqual(answers)

    // Resumed-leg events flow through the same applyStreamEvent pipeline → prose
    // narration returns.
    expect(mockApplyStreamEvent).toHaveBeenCalledTimes(2)
    expect(mockApplyStreamEvent.mock.calls[0][0].type).toBe('token_delta')
    expect(mockApplyStreamEvent.mock.calls[1][0].type).toBe('terminal')
  })

  it('startResume rethrows non-abort errors so the caller can fall back to poll', async () => {
    mockAnswerAndResumeStream.mockRejectedValueOnce(new AgentStreamConflict(42))
    const stream = useAgentStream()
    await expect(stream.startResume({ runId: 42, answers })).rejects.toBeInstanceOf(
      AgentStreamConflict
    )
  })

  it('startResume swallows an AbortError (user cancel → no fallback)', async () => {
    mockAnswerAndResumeStream.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    const stream = useAgentStream()
    await expect(stream.startResume({ runId: 42, answers })).resolves.toBeUndefined()
  })

  it('startResume rethrows validation errors without attach or polling while run remains active', async () => {
    const validationError = new Error('answers are invalid')
    mockStore.currentRun = { id: 42, status: 'running' }
    mockAnswerAndResumeStream.mockRejectedValueOnce(validationError)

    const stream = useAgentStream()
    await expect(stream.startResume({ runId: 42, answers })).rejects.toBe(validationError)

    expect(mockStreamAgentRunEvents).not.toHaveBeenCalled()
    expect(mockStartStatusPolling).not.toHaveBeenCalled()
    expect(mockApplyError).not.toHaveBeenCalled()
  })

  it('startResume early-ended stream and attach failure starts polling instead of applyError', async () => {
    vi.useFakeTimers()
    mockStore.currentRun = { id: 42, status: 'running' }
    mockAnswerAndResumeStream.mockImplementationOnce(async (_runId, _answers, onEvent) => {
      onEvent({ ...makeEvent('token_delta'), transport_cursor: '1-0' })
    })
    mockStreamAgentRunEvents.mockRejectedValue(new Error('events unavailable'))

    try {
      const stream = useAgentStream()
      const promise = stream.startResume({ runId: 42, answers })
      await vi.advanceTimersByTimeAsync(2000)
      await promise

      expect(mockStartStatusPolling).toHaveBeenCalledOnce()
      expect(mockApplyError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
