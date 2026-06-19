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

/** meeting_session.summary_status — SPEC §2.1（skipped = 结束时选择不生成纪要） */
export type MeetingSummaryStatus = 'none' | 'generating' | 'done' | 'failed' | 'skipped'

/** meeting_feedback.trigger — SPEC §2.3 / §3.1 */
export type MeetingFeedbackTrigger = 'auto' | 'manual'

/**
 * meeting_session.diarization_status — DIARIZATION_SPEC §6 / §7 (T10/T11).
 * Lifecycle of speaker diarization for a session:
 *  - none     — diarization not run (flag off, or no audio yet)
 *  - online   — online incremental clustering produced provisional A/B/C labels
 *  - refining — offline global re-clustering in flight ("正在校正说话人…")
 *  - done     — offline re-clustering finished; final 1/2/3 labels are authoritative
 *  - failed   — offline pass failed (online labels, if any, still stand)
 */
export type MeetingDiarizationStatus = 'none' | 'online' | 'refining' | 'done' | 'failed'

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

  // ── Speaker diarization (DIARIZATION_SPEC §6, flag-gated) ─────────────
  /**
   * Distinct speaker count for this meeting (offline result). null when
   * diarization has not produced a final speaker set yet. Optional on the wire:
   * a backend without the diarization migration omits it entirely.
   */
  speaker_count?: number | null
  /**
   * Diarization lifecycle (DIARIZATION_SPEC §6). Defaults to 'none' server-side;
   * optional on the wire so a pre-migration backend response stays valid.
   */
  diarization_status?: MeetingDiarizationStatus
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

  // ── Speaker diarization (DIARIZATION_SPEC §6, flag-gated) ─────────────
  // All optional on the wire: a pre-migration backend omits them; diarization
  // OFF leaves them absent. Display precedence (DIARIZATION_SPEC §6):
  //   final_speaker_id (→ meeting_speaker map: 1/2/3) ?? online_speaker_id
  //   (A/B/C temp) ?? "发言人?" (grey).
  /**
   * Online incremental cluster id (会中临时编号). Maps to a letter label A/B/C.
   * null when no online label was assigned (silent / too-short / soft-degraded).
   */
  online_speaker_id?: number | null
  /**
   * True when the online label was assigned with low confidence (grey-zone match
   * not committed to a centroid) → render weakened (translucent + "?").
   */
  online_provisional?: boolean
  /**
   * Final cluster id from offline global re-clustering (会后精修 1/2/3). When
   * present it WINS over online_speaker_id; maps via the meeting_speaker list.
   * null until the offline pass completes.
   */
  final_speaker_id?: number | null
  /**
   * Speaker-attribution confidence in [0,1] (cosine-similarity derived). Below
   * a threshold the label is weakened regardless of provisional. null = unknown.
   */
  speaker_confidence?: number | null
}

/**
 * MeetingSpeaker — mirrors meeting_speaker (DIARIZATION_SPEC §6). One row per
 * distinct final cluster in a meeting; gives a stable in-appearance-order display
 * label (1/2/3) + a palette color index. Used to map a segment's final_speaker_id
 * → human label + color. Appears in MeetingDetailResponse.speakers when the
 * offline pass has run; absent otherwise.
 */
export interface MeetingSpeaker {
  id: number
  meeting_id: number
  /** Final cluster id this row labels (matches MeetingSegment.final_speaker_id). */
  cluster_id: number
  /** Stable human label in appearance order ("1" / "2" / "发言人 1" …). */
  display_label: string
  /** Index into the front-end speaker color palette (mod palette length). */
  color_index: number
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

/** GET /v1/meetings/:id → { session, segments, feedbacks, speakers? } (summary lives on session) */
export interface MeetingDetailResponse {
  session: MeetingSession
  segments: MeetingSegment[]
  feedbacks: MeetingFeedback[]
  /**
   * Final speaker roster (DIARIZATION_SPEC §6). Present once the offline pass has
   * run; optional so a pre-migration backend response stays valid. Maps a
   * segment's final_speaker_id → display label + palette color.
   */
  speakers?: MeetingSpeaker[]
}

/** POST /v1/meetings/:id/segments → { segment } */
export interface IngestSegmentResponse {
  segment: MeetingSegment
}

/**
 * POST /v1/meetings/:id/end → { session }.
 * v2: /end now returns near-instantly (秒回) with summary_status='generating' —
 * the AI minutes are produced by a background goroutine after the response, so
 * `session.summary` is still empty here. The Summary page polls until
 * summary_status flips to 'done' (or 'failed').
 */
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

// ---------------------------------------------------------------------------
// Realtime ASR WebSocket protocol (SPEC §2 — our front↔back contract)
//
// Endpoint: GET /v1/meetings/:id/asr-stream?token=<user_jwt> (ws upgrade).
// Front → back: binary frames = raw PCM 16bit LE 16kHz mono (~100ms/frame);
//               text frame {"action":"finish"} = user ended.
// Back → front (JSON text frames): the five message kinds below.
// ---------------------------------------------------------------------------

/** Discriminant for a backend → frontend ASR WS message (SPEC §2). */
export type AsrMessageType = 'ready' | 'interim' | 'final' | 'error' | 'closed'

/** `{"type":"ready"}` — Ali task-started; client may begin sending audio. */
export interface AsrReadyMessage {
  type: 'ready'
}

/**
 * `{"type":"interim","text":"<current sentence>"}` — overwrite-style update of
 * the in-progress (not yet finalized) sentence, rendered greyed/italic.
 */
export interface AsrInterimMessage {
  type: 'interim'
  text: string
}

/**
 * `final.segment` — the persisted meeting_segment for a finalized sentence
 * (SPEC §2). A subset of MeetingSegment (audio_url/session_id omitted on the
 * wire for the realtime path; audio_url is empty for streaming segments anyway).
 */
export interface AsrFinalSegment {
  id: number
  seq: number
  text: string
  start_ms: number
  duration_seconds: number
  created_at: string

  // ── Online speaker diarization (DIARIZATION_SPEC §3 / §6, flag-gated) ──
  // The relay's online incremental clustering may attach a temp speaker label to
  // a finalized segment and push it on the `final` frame (or a later `closed`
  // re-push). All optional: absent when diarization is OFF or soft-degraded.
  online_speaker_id?: number | null
  online_provisional?: boolean
  speaker_confidence?: number | null
}

/**
 * `{"type":"final","segment":{...}}` — sentence finalized + persisted as a
 * meeting_segment; the store appends it to `segments`.
 */
export interface AsrFinalMessage {
  type: 'final'
  segment: AsrFinalSegment
}

/** `{"type":"error","message":"..."}` — relay or dashscope error. */
export interface AsrErrorMessage {
  type: 'error'
  message: string
}

/** `{"type":"closed"}` — Ali task-finished; the relay closed cleanly. */
export interface AsrClosedMessage {
  type: 'closed'
}

/**
 * Online clustering's temp speaker assignment for one segment, pushed as a
 * standalone `speaker` frame AFTER the `final` (the embed+cluster runs a few
 * seconds behind the finalized text). The store applies it to the matching
 * segment by id — this is what makes the live transcript speaker labels appear.
 */
export interface SpeakerUpdate {
  segment_id: number
  online_speaker_id: number
  online_provisional: boolean
  speaker_confidence: number
}

/** `{"type":"speaker","speaker":{...}}` — online speaker assigned to a segment. */
export interface AsrSpeakerMessage {
  type: 'speaker'
  speaker: SpeakerUpdate
}

/** Any backend → frontend ASR WS message (discriminated union on `type`). */
export type AsrMessage =
  | AsrReadyMessage
  | AsrInterimMessage
  | AsrFinalMessage
  | AsrErrorMessage
  | AsrClosedMessage
  | AsrSpeakerMessage

/**
 * Event handlers for an open ASR stream (see api/meeting.ts:openAsrStream).
 * All optional so callers wire only what they need. `onOpen` fires when the
 * underlying ws connects (transport-level), distinct from `onReady` which
 * fires on the protocol-level `ready` message (Ali task-started).
 */
export interface AsrStreamHandlers {
  /** ws transport opened (not yet ready to send audio). */
  onOpen?: () => void
  /** Protocol `ready` — safe to start sending PCM. */
  onReady?: () => void
  /** Protocol `interim` — overwrite-style current-sentence update. */
  onInterim?: (text: string) => void
  /** Protocol `final` — a finalized + persisted segment. */
  onFinal?: (segment: AsrFinalSegment) => void
  /** Protocol `error`, or a transport/parse error (message is user-facing). */
  onError?: (message: string) => void
  /** Protocol `closed`, or the ws transport closed for any reason. */
  onClosed?: () => void
  /** Protocol `speaker` — online clustering assigned a temp speaker to a segment. */
  onSpeaker?: (update: SpeakerUpdate) => void
}

/**
 * Handle to an open ASR stream. `sendPCM` forwards one raw-PCM frame as a
 * binary ws message; `finish` sends {"action":"finish"} (graceful end);
 * `close` tears the socket down immediately.
 */
export interface AsrStreamHandle {
  /** Send one raw PCM 16bit LE 16kHz mono frame (binary). No-op if not open. */
  sendPCM: (frame: ArrayBuffer) => void
  /** Signal end-of-audio to the backend ({"action":"finish"}). */
  finish: () => void
  /** Close the underlying ws immediately (idempotent). */
  close: () => void
}
