/**
 * agent-stream.ts — SSE consumer for the POST /v1/agent-runs/stream endpoint.
 *
 * Spec: docs/superpowers/specs/2026-05-27-agent-react-streaming-design.md §5.1
 * Types: src/types/agent-stream.ts (T08)
 *
 * Design: uses `fetchSSE` from sales.ts for auth + URL building, but parses
 * frames generically (not as SalesChatEvent). On 409 throws AgentStreamConflict
 * so the composable can fall back to polling (R4).
 */

import type { AgentStreamEvent } from '@/types/agent-stream'
import { AgentStreamConflict } from '@/types/agent-stream'
import type { CreateRunRequest } from '@/types/agent'
import type { AnswerItemPayload } from '@/api/agent'
import { getToken, clearAuth } from './request'
import { buildApiUrl } from './sales'

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

export const STREAM_AGENT_RUN_PATH = '/v1/agent-runs/stream'
export const ANSWER_STREAM_PATH = (runId: number): string => `/v1/agent-runs/${runId}/answer-stream`
export const RUN_EVENTS_PATH = (runId: number): string => `/v1/agent-runs/${runId}/events`

// ---------------------------------------------------------------------------
// Generic SSE frame parser (not coupled to SalesChatEvent)
// ---------------------------------------------------------------------------

/**
 * Parse a single SSE frame (the text between two \n\n boundaries).
 * Returns the parsed object or null if the frame carries no data line.
 */
export function parseAgentSseChunk<T = unknown>(chunk: string): T | null {
  const lines = chunk.split('\n').map((item) => item.trim())
  const line = lines.find((item) => item.startsWith('data:'))
  if (!line) return null
  const raw = line.slice(5).trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as T
    const cursorLine = lines.find((item) => item.startsWith('id:'))
    const cursor = cursorLine?.slice(3).trim()
    if (cursor && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      ;(parsed as Record<string, unknown>).transport_cursor = cursor
    }
    return parsed
  } catch {
    return null
  }
}

/** Compare Redis Stream IDs without coercing their 64-bit components to Number. */
export function compareAgentStreamCursor(a: string, b: string): number {
  if (a === b) return 0
  const parse = (value: string): [string, string] | null => {
    const parts = value.split('-')
    if (parts.length !== 2 || !parts.every((part) => /^\d+$/.test(part))) return null
    return [parts[0].replace(/^0+(?=\d)/, ''), parts[1].replace(/^0+(?=\d)/, '')]
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return a < b ? -1 : 1
  for (let i = 0; i < 2; i++) {
    if (left[i].length !== right[i].length) return left[i].length < right[i].length ? -1 : 1
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1
  }
  return 0
}

// ---------------------------------------------------------------------------
// Generic SSE stream reader (mirrors sales.ts:readSSEStream without the
// SalesChatEvent fallback logic — agent protocol always uses event-stream)
// ---------------------------------------------------------------------------

/**
 * Read an SSE response body and invoke onChunk for each \n\n-delimited frame.
 * Does not emit a synthetic "done" event — callers detect terminal via event type.
 */
export async function readAgentSSEStream(
  response: Response,
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('no stream body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let isDone = false

  while (!isDone) {
    const { done, value } = await reader.read()
    isDone = done
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      onChunk(chunk)
    }
  }

  // Flush any remaining data that didn't end with \n\n
  const remaining = buffer.trim()
  if (remaining) {
    onChunk(remaining)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * streamAgentRun — POST to /v1/agent-runs/stream and invoke onEvent for each
 * parsed AgentStreamEvent frame until the stream ends (terminal / error / abort).
 *
 * Throws:
 *   - AgentStreamConflict  when backend returns 409 (another client is streaming)
 *   - Error('HTTP <N>')    on any other non-2xx response
 *   - DOMException (AbortError) when signal is aborted before the stream ends
 */
export async function streamAgentRun(
  req: CreateRunRequest,
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken()
  if (!token) {
    clearAuth()
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login'
    }
    throw new Error('未登录，请重新登录')
  }

  const response = await fetch(buildApiUrl(STREAM_AGENT_RUN_PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(req),
    signal
  })

  if (response.status === 409) {
    let runId = 0
    let snapshot: unknown = undefined
    try {
      const body = (await response.json()) as { data?: { run_id?: number }; [k: string]: unknown }
      runId = body?.data?.run_id ?? 0
      snapshot = body
    } catch {
      // ignore parse error — runId stays 0
    }
    throw new AgentStreamConflict(runId, snapshot)
  }

  if (!response.ok) {
    // Friendly, user-facing messages instead of a bare "HTTP <N>". The raw
    // status is logged for debugging.
    console.error('[agent-stream] non-2xx response', response.status)
    if (response.status === 402) {
      throw new Error('积分不足，请充值后再试。')
    }
    if (response.status === 401) {
      // Match the no-token path (and axios interceptor): clear auth + redirect.
      clearAuth()
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
      throw new Error('登录已过期，请重新登录。')
    }
    throw new Error('服务暂时不可用，请稍后再试。')
  }

  await readAgentSSEStream(response, (chunk) => {
    const event = parseAgentSseChunk<AgentStreamEvent>(chunk)
    if (event) onEvent(event)
  })
}

/**
 * answerAndResumeStream — POST the ask_user_question answers to
 * /v1/agent-runs/:id/answer-stream and stream the resumed leg back through
 * onEvent, frame-for-frame identical to streamAgentRun (issue4: the resumed
 * leg's assistant prose returns via the same applyStreamEvent pipeline, not just
 * tool narration + a trailing final_answer that poll-only gave us).
 *
 * The backend persists the answer server-side AND streams the resume in one shot;
 * the event protocol is identical to /v1/agent-runs/stream.
 *
 * Throws:
 *   - AgentStreamConflict  when backend returns 409 (another client is streaming)
 *   - Error(friendly msg)  on any other non-2xx response (402/401/其它)
 *   - DOMException (AbortError) when signal is aborted before the stream ends
 */
export async function answerAndResumeStream(
  runId: number,
  answers: Record<string, AnswerItemPayload>,
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken()
  if (!token) {
    clearAuth()
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login'
    }
    throw new Error('未登录，请重新登录')
  }

  const response = await fetch(buildApiUrl(ANSWER_STREAM_PATH(runId)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ answers }),
    signal
  })

  if (response.status === 409) {
    let conflictRunId = 0
    let snapshot: unknown = undefined
    try {
      const body = (await response.json()) as { data?: { run_id?: number }; [k: string]: unknown }
      conflictRunId = body?.data?.run_id ?? 0
      snapshot = body
    } catch {
      // ignore parse error — runId stays 0
    }
    throw new AgentStreamConflict(conflictRunId, snapshot)
  }

  if (!response.ok) {
    // Friendly, user-facing messages instead of a bare "HTTP <N>". The raw
    // status is logged for debugging.
    console.error('[agent-stream] answer-stream non-2xx response', response.status)
    if (response.status === 402) {
      throw new Error('积分不足，请充值后再试。')
    }
    if (response.status === 401) {
      // Match the no-token path (and axios interceptor): clear auth + redirect.
      clearAuth()
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
      throw new Error('登录已过期，请重新登录。')
    }
    throw new Error('服务暂时不可用，请稍后再试。')
  }

  await readAgentSSEStream(response, (chunk) => {
    const event = parseAgentSseChunk<AgentStreamEvent>(chunk)
    if (event) onEvent(event)
  })
}

/**
 * Attach to a run after an external-action card closed the original response.
 * `after` is exclusive; the server replays missed entries and then stays open
 * for live detached-continuation events.
 */
export async function streamAgentRunEvents(
  runId: number,
  after: string,
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken()
  if (!token) {
    clearAuth()
    throw new Error('未登录，请重新登录')
  }
  const query = after ? `?after=${encodeURIComponent(after)}` : ''
  const response = await fetch(buildApiUrl(`${RUN_EVENTS_PATH(runId)}${query}`), {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`
    },
    signal
  })
  if (!response.ok) {
    if (response.status === 401) {
      clearAuth()
      throw new Error('登录已过期，请重新登录。')
    }
    throw new Error(
      response.status === 503 ? 'Agent 实时事件流暂时不可用' : '无法恢复 Agent 实时事件流'
    )
  }
  await readAgentSSEStream(response, (chunk) => {
    const event = parseAgentSseChunk<AgentStreamEvent>(chunk)
    if (event) onEvent(event)
  })
}
