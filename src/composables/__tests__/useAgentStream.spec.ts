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
import type { CreateRunRequest } from '@/types/agent'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the SSE API — replace with controllable function
const mockStreamAgentRun = vi.fn<
  [Record<string, unknown>, (e: AgentStreamEvent) => void, AbortSignal | undefined],
  Promise<void>
>()
vi.mock('@/api/agent-stream', () => ({
  streamAgentRun: (...args: unknown[]) =>
    mockStreamAgentRun(...(args as Parameters<typeof mockStreamAgentRun>))
}))

// Mock the store
const mockApplyStreamEvent = vi.fn()
const mockApplyError = vi.fn()
vi.mock('@/stores/agentChat', () => ({
  useAgentChatStore: () => ({
    applyStreamEvent: mockApplyStreamEvent,
    applyError: mockApplyError
  })
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

    expect(mockApplyError).toHaveBeenCalledWith(boom)
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

  // 7. fallbackPolling resets to false on next start()
  it('fallbackPolling resets to false at start of next call', async () => {
    mockStreamAgentRun.mockRejectedValueOnce(new AgentStreamConflict(99))
    const { start, fallbackPolling } = useAgentStream()
    await start(baseReq)
    expect(fallbackPolling.value).toBe(true)

    // Now a successful stream
    mockStreamAgentRun.mockResolvedValueOnce(undefined)
    await start(baseReq)
    expect(fallbackPolling.value).toBe(false)
  })
})
