/**
 * meeting.ts — HTTP + SSE client for the Meeting Copilot (会议副驾) feature.
 *
 * Contract: numind-server/docs/meeting-copilot/SPEC.md §3 (API) + §3.1 (feedback SSE).
 * All plain HTTP goes through the shared axios instance (src/api/request.ts);
 * the streaming feedback endpoint uses fetch + SSE (EventSource can't POST),
 * reusing the same auth/URL helpers as agent-stream / sales (fetchSSE,
 * readAgentSSEStream, parseAgentSseChunk).
 *
 * NEVER import axios directly here (see .claude/rules/frontend-state.md §2).
 */

import request, { getToken } from './request'
import type { ApiResponse } from './request'
import { fetchSSE, buildApiUrl } from './sales'
import { readAgentSSEStream, parseAgentSseChunk } from './agent-stream'
import type {
  MeetingSession,
  MeetingFeedback,
  MeetingPreset,
  CreateMeetingRequest,
  IngestSegmentRequest,
  FeedbackRequest,
  SavePresetRequest,
  ListMeetingsResponse,
  MeetingDetailResponse,
  IngestSegmentResponse,
  EndMeetingResponse,
  ListPresetsResponse,
  MeetingFeedbackEvent,
  AsrMessage,
  AsrStreamHandlers,
  AsrStreamHandle
} from '@/types/meeting'

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const BASE = '/v1/meetings'
const FEEDBACK_PATH = (id: number): string => `${BASE}/${id}/feedback`

// ---------------------------------------------------------------------------
// Session lifecycle (SPEC §3)
// ---------------------------------------------------------------------------

/** POST /v1/meetings — create a session. Returns the session DTO. */
export const createSession = async (payload: CreateMeetingRequest): Promise<MeetingSession> => {
  const res = (await request.post(BASE, payload)) as unknown as ApiResponse<MeetingSession>
  return res.data
}

/** GET /v1/meetings — paginated history list (page 1-based, default page_size 20). */
export const listSessions = async (page = 1, pageSize = 20): Promise<ListMeetingsResponse> => {
  const res = (await request.get(BASE, {
    params: { page, page_size: pageSize }
  })) as unknown as ApiResponse<ListMeetingsResponse>
  return res.data
}

/** GET /v1/meetings/:id — detail: { session, segments, feedbacks }. */
export const getSession = async (id: number): Promise<MeetingDetailResponse> => {
  const res = (await request.get(`${BASE}/${id}`)) as unknown as ApiResponse<MeetingDetailResponse>
  return res.data
}

/**
 * POST /v1/meetings/:id/segments — upload one WAV segment for near-realtime ASR.
 * multipart/form-data: audio (file) + optional seq + start_ms. The axios request
 * interceptor detects FormData and lets the browser set the multipart boundary.
 *
 * `timeout` is widened beyond the 30s default because ASR of a ~10s clip can be
 * slow under load; segments are small but FunASR round-trips vary.
 */
export const ingestSegment = async (
  id: number,
  payload: IngestSegmentRequest
): Promise<IngestSegmentResponse> => {
  const form = new FormData()
  // Name the part "segment-<seq>.wav" so a server-side filename (if logged) is
  // meaningful; the backend keys COS by userID/sessionID/seq regardless.
  const filename = `segment-${payload.seq ?? 0}.wav`
  form.append('audio', payload.audio, filename)
  if (payload.seq !== undefined) form.append('seq', String(payload.seq))
  if (payload.start_ms !== undefined) form.append('start_ms', String(payload.start_ms))

  const res = (await request.post(`${BASE}/${id}/segments`, form, {
    timeout: 120000
  })) as unknown as ApiResponse<IngestSegmentResponse>
  return res.data
}

/** POST /v1/meetings/:id/end — end + synchronously generate summary. Returns session. */
export const endMeeting = async (id: number): Promise<MeetingSession> => {
  const res = (await request.post(
    `${BASE}/${id}/end`
  )) as unknown as ApiResponse<EndMeetingResponse>
  return res.data.session
}

// ---------------------------------------------------------------------------
// Realtime ASR streaming (SPEC §2) + full recording upload (SPEC §3)
// ---------------------------------------------------------------------------

/**
 * buildWsUrl — turn an API path into an absolute ws(s):// URL with a token query.
 *
 * Reuses buildApiUrl (which prefixes request.defaults.baseURL, e.g. "/api") so
 * the ws endpoint hits the SAME backend the axios client does. The result may be
 * relative ("/api/v1/...") when baseURL is a path; we resolve it against
 * window.location and swap http(s)→ws(s) so wss is used on HTTPS pages
 * (mixed-content safe, per SPEC §2/§5 "ws(s):// 与当前 origin 协议匹配").
 *
 * Browser ws cannot set Authorization headers, so the user JWT rides in
 * `?token=` (SPEC §2 auth). The token is URL-encoded defensively.
 */
const buildWsUrl = (path: string, token: string): string => {
  // buildApiUrl yields e.g. "/api/v1/meetings/3/asr-stream" or an absolute URL.
  const apiUrl = buildApiUrl(path)
  // Resolve against the current origin (handles both relative and absolute).
  const abs = new URL(apiUrl, window.location.href)
  abs.protocol = abs.protocol === 'https:' ? 'wss:' : 'ws:'
  abs.searchParams.set('token', token)
  return abs.toString()
}

/**
 * parseAsrMessage — parse a backend → frontend ASR WS text frame into a typed
 * AsrMessage, or null when malformed / unknown. The backend sends one JSON
 * object per ws message (not SSE \n\n framing), so this is a plain JSON.parse
 * with a discriminant check.
 */
const parseAsrMessage = (raw: string): AsrMessage | null => {
  try {
    const obj = JSON.parse(raw) as { type?: unknown }
    if (typeof obj?.type !== 'string') return null
    switch (obj.type) {
      case 'ready':
      case 'interim':
      case 'final':
      case 'error':
      case 'closed':
        return obj as AsrMessage
      default:
        return null
    }
  } catch {
    return null
  }
}

/**
 * openAsrStream — open our realtime ASR WebSocket for a session and dispatch
 * backend frames to `handlers`. URL = ws(s)://<api host>/v1/meetings/:id/asr-stream
 * ?token=<user jwt> (SPEC §2). Returns a handle to push PCM frames / finish /
 * close.
 *
 * Auth: token is read from localStorage (request.ts getToken). With no token we
 * surface an onError instead of opening — the caller treats this as a failed
 * start (the recorder won't be wired). We deliberately do NOT redirect to /login
 * here (the recorder lifecycle owns that decision); a missing token mid-meeting
 * is exceptional.
 *
 * Lifecycle: onmessage parses + dispatches; onerror/onclose map to onError/
 * onClosed. The handle's close() is idempotent and detaches handlers so a late
 * frame after teardown is ignored (no zombie callbacks).
 */
export const openAsrStream = (sessionId: number, handlers: AsrStreamHandlers): AsrStreamHandle => {
  const token = getToken()

  // No token → return an inert handle and report the error asynchronously so the
  // caller's onError wiring (set synchronously after this returns) still fires.
  if (!token) {
    queueMicrotask(() => handlers.onError?.('未登录，请重新登录'))
    return {
      sendPCM: () => {},
      finish: () => {},
      close: () => {}
    }
  }

  let closed = false
  let ws: WebSocket
  try {
    ws = new WebSocket(buildWsUrl(`${BASE}/${sessionId}/asr-stream`, token))
  } catch (err) {
    queueMicrotask(() => handlers.onError?.((err as Error)?.message || '无法建立实时转写连接'))
    return {
      sendPCM: () => {},
      finish: () => {},
      close: () => {}
    }
  }

  // Binary PCM frames must arrive as ArrayBuffer when echoed (defensive; we only
  // ever READ JSON text from the backend, but set it for completeness).
  ws.binaryType = 'arraybuffer'

  ws.onopen = (): void => {
    handlers.onOpen?.()
  }

  ws.onmessage = (ev: MessageEvent): void => {
    if (closed) return
    // Backend → frontend frames are JSON text per SPEC §2. Ignore binary.
    if (typeof ev.data !== 'string') return
    const msg = parseAsrMessage(ev.data)
    if (!msg) return
    switch (msg.type) {
      case 'ready':
        handlers.onReady?.()
        break
      case 'interim':
        handlers.onInterim?.(msg.text)
        break
      case 'final':
        handlers.onFinal?.(msg.segment)
        break
      case 'error':
        handlers.onError?.(msg.message || '实时转写出错')
        break
      case 'closed':
        // Mark closed BEFORE dispatching so the subsequent ws.onclose (which the
        // browser fires right after) does not invoke onClosed a second time.
        closed = true
        handlers.onClosed?.()
        break
    }
  }

  ws.onerror = (): void => {
    if (closed) return
    // An onerror means the connection is dead — treat it as terminal so the
    // browser's follow-up ws.onclose does NOT also fire onClosed (double callback).
    // We surface onError only; the caller's onError resets stream state.
    closed = true
    handlers.onError?.('实时转写连接异常')
  }

  ws.onclose = (): void => {
    if (closed) return
    closed = true
    handlers.onClosed?.()
  }

  const sendPCM = (frame: ArrayBuffer): void => {
    if (closed) return
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(frame)
    }
  }

  const finish = (): void => {
    if (closed) return
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'finish' }))
    }
  }

  const close = (): void => {
    if (closed) return
    closed = true
    // Detach handlers so a frame in flight after teardown is dropped.
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    } catch {
      /* ignore */
    }
  }

  return { sendPCM, finish, close }
}

/**
 * uploadRecording — POST /v1/meetings/:id/recording with the full-session audio
 * blob (webm/opus from the parallel MediaRecorder, SPEC §3). multipart field
 * `audio`. Returns the updated session (carrying recording_url). The axios
 * interceptor sets the multipart boundary for FormData automatically.
 *
 * `timeout` is widened beyond the 30s default because a long meeting's recording
 * can be several MB and slow to upload + persist to COS.
 */
export const uploadRecording = async (id: number, blob: Blob): Promise<MeetingSession> => {
  const form = new FormData()
  form.append('audio', blob, 'full.webm')
  const res = (await request.post(`${BASE}/${id}/recording`, form, {
    timeout: 120000
  })) as unknown as ApiResponse<EndMeetingResponse>
  return res.data.session
}

// ---------------------------------------------------------------------------
// Presets (SPEC §3)
// ---------------------------------------------------------------------------

/** GET /v1/meetings/presets — user presets + builtins. */
export const listPresets = async (): Promise<MeetingPreset[]> => {
  const res = (await request.get(`${BASE}/presets`)) as unknown as ApiResponse<ListPresetsResponse>
  return res.data.list
}

/** POST /v1/meetings/presets — save a preset. */
export const savePreset = async (payload: SavePresetRequest): Promise<MeetingPreset> => {
  const res = (await request.post(
    `${BASE}/presets`,
    payload
  )) as unknown as ApiResponse<MeetingPreset>
  return res.data
}

/** DELETE /v1/meetings/presets/:id — delete a preset (own, non-builtin only). */
export const deletePreset = async (id: number): Promise<void> => {
  await request.delete(`${BASE}/presets/${id}`)
}

// ---------------------------------------------------------------------------
// Feedback SSE consumer (SPEC §3.1)
// ---------------------------------------------------------------------------

/**
 * streamFeedback — POST /v1/meetings/:id/feedback and stream the judge+generate
 * result back through onEvent, frame-for-frame per SPEC §3.1.
 *
 * Event types: token (text increment string) / skip ({reason}) / done
 * (MeetingFeedback DTO) / error ({message}). Reuses fetchSSE for auth + 401/403
 * handling and readAgentSSEStream/parseAgentSseChunk for generic frame parsing —
 * the meeting protocol's `data: {"type":...,"data":...}\n\n` shape is identical.
 *
 * The caller distinguishes terminal frames by event type (done/error); this
 * function resolves when the stream body ends.
 *
 * Throws:
 *   - friendly Error on non-2xx (via fetchSSE: 401/403 handled, others mapped)
 *   - DOMException (AbortError) when `signal` aborts before the stream ends
 */
export const streamFeedback = async (
  sessionId: number,
  payload: FeedbackRequest,
  onEvent: (event: MeetingFeedbackEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetchSSE(FEEDBACK_PATH(sessionId), {
    // Explicit SSE Accept header (SPEC §3.1 streams text/event-stream). fetchSSE
    // merges these into its Authorization/Content-Type defaults.
    headers: { Accept: 'text/event-stream' },
    body: JSON.stringify(payload),
    signal
  })

  await readAgentSSEStream(response, (chunk) => {
    const event = parseAgentSseChunk<MeetingFeedbackEvent>(chunk)
    // Only forward well-formed frames carrying a known type discriminant.
    if (event && typeof event.type === 'string') {
      onEvent(event)
    }
  })
}

// Re-export the persisted DTO type for convenience at call sites that consume
// the `done` payload.
export type { MeetingFeedback }
