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

import request from './request'
import type { ApiResponse } from './request'
import { fetchSSE } from './sales'
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
  MeetingFeedbackEvent
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
