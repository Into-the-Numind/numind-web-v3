/**
 * Tests for agent-stream.ts (T09)
 *
 * Mock fetch using vi.stubGlobal to simulate SSE streams.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamAgentRun, parseAgentSseChunk, STREAM_AGENT_RUN_PATH } from './agent-stream'
import { AgentStreamConflict } from '@/types/agent-stream'
import type { AgentStreamEvent } from '@/types/agent-stream'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a ReadableStream that emits the given SSE frames as text chunks,
 * each separated by \n\n as per SSE spec.
 */
function makeSSEStream(frames: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        const line = `data: ${JSON.stringify(frame)}\n\n`
        controller.enqueue(encoder.encode(line))
      }
      controller.close()
    }
  })
}

/** Build a minimal Response wrapping a ReadableStream. */
function makeStreamResponse(body: ReadableStream<Uint8Array>, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' }
  })
}

// Seed localStorage token so getToken() returns a value
beforeEach(() => {
  localStorage.setItem('token', 'test-token')
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// parseAgentSseChunk unit tests
// ---------------------------------------------------------------------------

describe('parseAgentSseChunk', () => {
  it('parses a well-formed data line', () => {
    const chunk = 'data: {"type":"token_delta","seq":1,"ts":"2026-05-27T00:00:00Z","run_id":99}'
    const result = parseAgentSseChunk(chunk)
    expect(result).toEqual({ type: 'token_delta', seq: 1, ts: '2026-05-27T00:00:00Z', run_id: 99 })
  })

  it('returns null for a comment / ping line', () => {
    expect(parseAgentSseChunk(':ping')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseAgentSseChunk('')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseAgentSseChunk('data: {not valid json')).toBeNull()
  })

  it('extracts data from multi-line chunk (first data: line wins)', () => {
    const chunk = 'id: 1\ndata: {"type":"ping","seq":2,"ts":"","run_id":0}\n'
    const result = parseAgentSseChunk<AgentStreamEvent>(chunk)
    expect(result?.type).toBe('ping')
  })
})

// ---------------------------------------------------------------------------
// streamAgentRun happy path
// ---------------------------------------------------------------------------

describe('streamAgentRun', () => {
  it('invokes onEvent once per frame, in order', async () => {
    const frames: AgentStreamEvent[] = [
      { type: 'stream_start', seq: 1, ts: '2026-05-27T00:00:00Z', run_id: 1 },
      {
        type: 'token_delta',
        seq: 2,
        ts: '2026-05-27T00:00:01Z',
        run_id: 1,
        step: 0,
        data: { message_id: 'm1', text: 'hello' }
      },
      {
        type: 'terminal',
        seq: 3,
        ts: '2026-05-27T00:00:02Z',
        run_id: 1,
        data: { reason: 'done', duration_ms: 100, step_count: 1 }
      }
    ]

    const mockFetch = vi.fn().mockResolvedValue(makeStreamResponse(makeSSEStream(frames)))
    vi.stubGlobal('fetch', mockFetch)

    const received: AgentStreamEvent[] = []
    await streamAgentRun({ agent_skill_id: 1, input_text: 'hi' }, (e) => received.push(e))

    expect(received).toHaveLength(3)
    expect(received[0].type).toBe('stream_start')
    expect(received[1].type).toBe('token_delta')
    expect(received[2].type).toBe('terminal')
  })

  it('passes Authorization header and correct URL', async () => {
    const frames: AgentStreamEvent[] = [
      {
        type: 'terminal',
        seq: 1,
        ts: '',
        run_id: 1,
        data: { reason: 'done', duration_ms: 0, step_count: 0 }
      }
    ]
    const mockFetch = vi.fn().mockResolvedValue(makeStreamResponse(makeSSEStream(frames)))
    vi.stubGlobal('fetch', mockFetch)

    await streamAgentRun({ agent_skill_id: 1, input_text: 'test' }, () => {})

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(STREAM_AGENT_RUN_PATH)
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
    expect(init.method).toBe('POST')
  })

  // ---------------------------------------------------------------------------
  // 409 path → throws AgentStreamConflict
  // ---------------------------------------------------------------------------

  it('throws AgentStreamConflict with runId when backend returns 409', async () => {
    const conflictBody = { code: 40901, message: 'stream already attached', data: { run_id: 42 } }
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(conflictBody), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    vi.stubGlobal('fetch', mockFetch)

    let caught: unknown
    try {
      await streamAgentRun({ agent_skill_id: 1, input_text: 'hi' }, () => {})
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(AgentStreamConflict)
    expect((caught as AgentStreamConflict).runId).toBe(42)
    expect((caught as AgentStreamConflict).snapshot).toEqual(conflictBody)
  })

  // ---------------------------------------------------------------------------
  // Unauthenticated path → throws '未登录，请重新登录'
  // ---------------------------------------------------------------------------

  it('throws unauthenticated error when no token is in localStorage', async () => {
    const savedToken = localStorage.getItem('token')
    localStorage.removeItem('token')

    let caught: unknown
    try {
      await streamAgentRun({ agent_skill_id: 1, input_text: 'hi' }, () => {})
    } catch (err) {
      caught = err
    } finally {
      if (savedToken !== null) {
        localStorage.setItem('token', savedToken)
      }
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('未登录，请重新登录')
  })

  it('throws generic Error for other non-2xx responses', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
    vi.stubGlobal('fetch', mockFetch)

    await expect(streamAgentRun({ agent_skill_id: 1, input_text: 'hi' }, () => {})).rejects.toThrow(
      'HTTP 500'
    )
  })

  // ---------------------------------------------------------------------------
  // AbortSignal path
  // ---------------------------------------------------------------------------

  it('propagates AbortSignal — fetch is aborted and onEvent not called after abort', async () => {
    const controller = new AbortController()

    // fetch will reject with AbortError when signal fires
    const mockFetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          if (init.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            })
          }
        })
    )
    vi.stubGlobal('fetch', mockFetch)

    const received: AgentStreamEvent[] = []
    const promise = streamAgentRun(
      { agent_skill_id: 1, input_text: 'hi' },
      (e) => received.push(e),
      controller.signal
    )

    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(received).toHaveLength(0)
  })

  it('passes AbortSignal through to fetch options.signal', async () => {
    const controller = new AbortController()
    const frames: AgentStreamEvent[] = [
      {
        type: 'terminal',
        seq: 1,
        ts: '',
        run_id: 1,
        data: { reason: 'done', duration_ms: 0, step_count: 0 }
      }
    ]
    const mockFetch = vi.fn().mockResolvedValue(makeStreamResponse(makeSSEStream(frames)))
    vi.stubGlobal('fetch', mockFetch)

    await streamAgentRun({ agent_skill_id: 1, input_text: 'hi' }, () => {}, controller.signal)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })
})
