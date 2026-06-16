/**
 * meeting.ts — TypeScript contract for the Meeting Copilot (会议副驾) feature.
 *
 * Source of truth: numind-server/docs/meeting-copilot/SPEC.md §2 (data model) and
 * §3 (API contract). Field names are snake_case to match the Go JSON tags 1:1,
 * mirroring the agent-stream.ts convention — no case conversion needed on the wire.
 *
 * This file is the SHARED contract; backend DTO field names must stay aligned.
 */

// ---------------------------------------------------------------------------
// Enums / literal unions (SPEC §2)
// ---------------------------------------------------------------------------

/** meeting_session.status — SPEC §2.1 */
export type MeetingSessionStatus = 'active' | 'ended'

/** meeting_session.summary_status — SPEC §2.1 */
export type MeetingSummaryStatus = 'none' | 'generating' | 'done' | 'failed'

/** meeting_feedback.trigger — SPEC §2.3 / §3.1 */
export type MeetingFeedbackTrigger = 'auto' | 'manual'

// ---------------------------------------------------------------------------
// Core DTOs (SPEC §2 / §3)
// ---------------------------------------------------------------------------

/**
 * MeetingSession — mirrors meeting_session (SPEC §2.1).
 * Time fields are ISO8601 strings (SPEC §3 note). Nullable columns map to
 * `string | null` / number; `summary` is empty string when not yet generated.
 */
export interface MeetingSession {
  id: number
  user_id: number
  title: string
  role_prompt: string
  /** null when the session was not created from a preset */
  preset_id: number | null
  status: MeetingSessionStatus
  auto_interval_seconds: number
  /** Reserved (MVP recording = per-segment list); empty when unused */
  recording_url: string
  /** Populated on end */
  duration_seconds: number
  /** AI minutes (markdown); empty until generated */
  summary: string
  summary_status: MeetingSummaryStatus
  /** ISO8601, null until started */
  started_at: string | null
  /** ISO8601, null until ended */
  ended_at: string | null
  created_at: string
  updated_at: string
}

/** MeetingSegment — mirrors meeting_segment (SPEC §2.2). */
export interface MeetingSegment {
  id: number
  session_id: number
  seq: number
  /** Transcript text; empty string for a silent segment (still persisted) */
  text: string
  /** ms offset relative to meeting start (best-effort) */
  start_ms: number
  /** ASR-reported audio duration (seconds) */
  duration_seconds: number
  /** COS URL of this segment's audio (for replay); null when absent */
  audio_url: string | null
  created_at: string
}

/** MeetingFeedback — mirrors meeting_feedback (SPEC §2.3 / SSE done payload §3.1). */
export interface MeetingFeedback {
  id: number
  session_id: number
  trigger: MeetingFeedbackTrigger
  /** Transcript progress anchor at generation time */
  anchor_seq: number
  /** Feedback body (markdown) */
  content: string
  created_at: string
}

/** MeetingPreset — mirrors meeting_preset (SPEC §2.4). */
export interface MeetingPreset {
  id: number
  /** 0 = system builtin template */
  user_id: number
  name: string
  role_prompt: string
  auto_interval_seconds: number
  /** system builtin cannot be deleted */
  is_builtin: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Request payloads (SPEC §3)
// ---------------------------------------------------------------------------

/** POST /v1/meetings body (SPEC §3) */
export interface CreateMeetingRequest {
  role_prompt: string
  preset_id?: number
  auto_interval_seconds?: number
  title?: string
}

/**
 * POST /v1/meetings/:id/segments — multipart/form-data fields (SPEC §3).
 * `audio` is the WAV Blob; `seq` / `start_ms` are optional. The blob is sent as
 * a multipart part by the API layer (see src/api/meeting.ts), so this type only
 * carries the non-file fields plus the blob reference for the API wrapper.
 */
export interface IngestSegmentRequest {
  audio: Blob
  seq?: number
  start_ms?: number
}

/** POST /v1/meetings/:id/feedback body (SPEC §3.1) */
export interface FeedbackRequest {
  trigger: MeetingFeedbackTrigger
}

/** POST /v1/meetings/presets body (SPEC §3) */
export interface SavePresetRequest {
  name: string
  role_prompt: string
  auto_interval_seconds?: number
}

// ---------------------------------------------------------------------------
// Response shapes (SPEC §3) — the API layer unwraps the {code,message,data}
// envelope, so these describe the `data` payloads.
// ---------------------------------------------------------------------------

/** GET /v1/meetings → { list, total } */
export interface ListMeetingsResponse {
  list: MeetingSession[]
  total: number
}

/** GET /v1/meetings/:id → { session, segments, feedbacks } (summary lives on session) */
export interface MeetingDetailResponse {
  session: MeetingSession
  segments: MeetingSegment[]
  feedbacks: MeetingFeedback[]
}

/** POST /v1/meetings/:id/segments → { segment } */
export interface IngestSegmentResponse {
  segment: MeetingSegment
}

/** POST /v1/meetings/:id/end → { session } (with summary + summary_status='done') */
export interface EndMeetingResponse {
  session: MeetingSession
}

/** GET /v1/meetings/presets → { list } */
export interface ListPresetsResponse {
  list: MeetingPreset[]
}

// ---------------------------------------------------------------------------
// Feedback SSE protocol (SPEC §3.1)
// Frame: data: {"type":"<t>","data":<payload>}\n\n
// ---------------------------------------------------------------------------

export type MeetingFeedbackEventType = 'token' | 'skip' | 'done' | 'error'

/** `skip` payload — auto trigger judge decided no feedback is needed. */
export interface FeedbackSkipPayload {
  reason: string
}

/** `error` payload. */
export interface FeedbackErrorPayload {
  message: string
}

/**
 * A parsed feedback SSE event. `data` is type-specific:
 *  - token → string (text increment)
 *  - skip  → FeedbackSkipPayload
 *  - done  → MeetingFeedback (persisted DTO)
 *  - error → FeedbackErrorPayload
 */
export interface MeetingFeedbackEvent {
  type: MeetingFeedbackEventType
  data: unknown
}
