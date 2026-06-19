/**
 * meeting store — Meeting Copilot (会议副驾) state machine.
 *
 * Contract: numind-server/docs/meeting-copilot/SPEC.md §5. Pinia setup store
 * (Composition API style per .claude/rules/frontend-state.md §1). Wraps the
 * meeting API + the recorder engine; every async action uses try/catch with a
 * finally that resets its loading flag, and surfaces a user-facing `error` string.
 *
 * The store owns DATA + LIFECYCLE; the recorder hardware lifecycle lives in
 * useMeetingRecorder (a view/composable concern) — the store only mirrors its
 * recording-state booleans so views can render uniformly.
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import * as api from '@/api/meeting'
import type {
  MeetingSession,
  MeetingSegment,
  MeetingSpeaker,
  SpeakerUpdate,
  MeetingDiarizationStatus,
  MeetingFeedback,
  MeetingPreset,
  MeetingSummaryStatus,
  CreateMeetingRequest,
  SavePresetRequest,
  FeedbackRequest,
  FeedbackErrorPayload,
  MeetingFeedbackTrigger,
  AsrFinalSegment,
  AsrStreamHandle
} from '@/types/meeting'

export const useMeetingStore = defineStore('meeting', () => {
  // ── State ────────────────────────────────────────────────────────────
  const currentSession = ref<MeetingSession | null>(null)
  const segments = ref<MeetingSegment[]>([])
  const feedbacks = ref<MeetingFeedback[]>([])
  const presets = ref<MeetingPreset[]>([])

  // Final speaker roster (DIARIZATION_SPEC §6). Populated from the detail
  // response once the offline pass has run; maps a segment's final_speaker_id →
  // display label + palette color. Empty before offline diarization completes.
  const speakers = ref<MeetingSpeaker[]>([])

  // History list
  const sessions = ref<MeetingSession[]>([])
  const sessionsTotal = ref(0)

  // Recording-state mirror (driven by the view's useMeetingRecorder).
  const recording = ref(false)
  const paused = ref(false)
  const elapsedMs = ref(0)

  // ── Realtime ASR (SPEC §2) ───────────────────────────────────────────
  // The in-progress (not yet finalized) sentence from the ASR `interim` frame.
  // Overwrite-style: each interim replaces it; cleared when the sentence
  // finalizes (a `final` frame) or the stream closes. Rendered greyed/italic.
  const interimText = ref('')
  // True once the backend sent `ready` (Ali task-started) → safe to send audio.
  const asrReady = ref(false)
  // True while an ASR ws is open (between openAsrStream and its close).
  const asrStreaming = ref(false)
  // The live ASR ws handle (sendPCM / finish / close). Null when no stream open.
  // Held outside Vue reactivity (it's an imperative handle, not render state).
  let asrHandle: AsrStreamHandle | null = null
  // Monotonic timestamp (ms, from session start) of the last segment that
  // actually carried transcript text — used to gate auto feedback (canFeedback).
  const lastTranscribedMs = ref(0)
  // Anchor (highest segment seq) consumed by the last feedback — the auto
  // content-gate (canFeedback) only fires when ENOUGH new transcript has arrived
  // since this anchor (FEEDBACK_V2 §1: ≥2 new final segments OR ≥~100 chars).
  // Sentinel -1 means "no feedback yet" so the very first segment (seq=0) is
  // counted as new (a seq=0-only meeting would otherwise never count anything
  // once lastFeedbackSeq settled at 0).
  const lastFeedbackSeq = ref(-1)
  // True while a feedback SSE stream is in flight (manual or auto).
  const feedbackStreaming = ref(false)
  // The live, partially-streamed feedback content (token accumulation). Null when
  // no stream is active. Views render this as a transient bubble until `done`.
  const streamingFeedback = ref<string | null>(null)

  // Loading flags (one per async surface).
  const creating = ref(false)
  const loadingDetail = ref(false)
  const loadingList = ref(false)
  // True while the full-session recording is uploading (SPEC §3).
  const uploadingRecording = ref(false)
  const ending = ref(false)
  const loadingPresets = ref(false)
  const savingPreset = ref(false)
  const deletingPreset = ref(false)

  // User-facing error (last failed action). Views show + offer retry.
  const error = ref<string | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────
  /** Finalized transcript text, segments joined in seq order (silent skipped). */
  const finalsTranscript = computed(() =>
    [...segments.value]
      .sort((a, b) => a.seq - b.seq)
      .map((s) => s.text)
      .filter((t) => t.trim().length > 0)
      .join('\n')
  )

  /**
   * Full transcript: finalized segments joined in seq order, with the live
   * in-progress (interim) sentence appended at the end (SPEC §5). The view
   * renders the interim tail greyed/italic via `interimText` directly; this
   * getter is the plain-text rollup used for length gating / display fallback.
   */
  const transcript = computed(() => {
    const finals = finalsTranscript.value
    const interim = interimText.value.trim()
    if (!interim) return finals
    return finals ? `${finals}\n${interim}` : interim
  })

  /** Total transcribed character count (drives "enough new transcript" gating). */
  const transcriptLength = computed(() => segments.value.reduce((acc, s) => acc + s.text.length, 0))

  const isRecording = computed(() => recording.value)
  const isPaused = computed(() => paused.value)
  const isActive = computed(() => currentSession.value?.status === 'active')

  // ── Speaker diarization getters (DIARIZATION_SPEC §6) ─────────────────
  /** Diarization lifecycle of the current session ('none' when absent/off). */
  const diarizationStatus = computed<MeetingDiarizationStatus>(
    () => currentSession.value?.diarization_status ?? 'none'
  )
  /**
   * Lookup of final cluster_id → MeetingSpeaker, so a segment's final_speaker_id
   * resolves to its stable display label + palette color in O(1) at render time.
   */
  const speakerByCluster = computed<Record<number, MeetingSpeaker>>(() => {
    const map: Record<number, MeetingSpeaker> = {}
    for (const sp of speakers.value) map[sp.cluster_id] = sp
    return map
  })

  /** Highest segment seq seen so far (-1 when none). */
  const latestSeq = computed(() =>
    segments.value.reduce((max, s) => (s.seq > max ? s.seq : max), -1)
  )

  // Content-gate thresholds (FEEDBACK_V2 §1): the auto timer only fires once
  // ENOUGH genuinely new transcript has accumulated since the last feedback —
  // either ≥2 new final segments OR ≥~100 new characters. A single short
  // utterance ("好的") no longer triggers a feedback round; this kills the
  // "talked over / interrupting" feel and the request storm on choppy transcripts.
  const FEEDBACK_MIN_NEW_SEGMENTS = 2
  const FEEDBACK_MIN_NEW_CHARS = 100

  /**
   * canFeedback — true when it is meaningful to request AUTO feedback now:
   *  - a session is active,
   *  - no feedback stream is already in flight,
   *  - AND the transcript that arrived since the last feedback (lastFeedbackSeq)
   *    crosses the content gate: ≥2 new non-empty final segments OR ≥~100 new
   *    chars. Manual feedback bypasses this gate (requestFeedback is called
   *    directly with trigger='manual'); for the AUTO timer this getter is the gate.
   */
  const canFeedback = computed(() => {
    if (!isActive.value) return false
    if (feedbackStreaming.value) return false
    let newSegments = 0
    let newChars = 0
    for (const s of segments.value) {
      if (s.seq <= lastFeedbackSeq.value) continue
      const len = s.text.trim().length
      if (len === 0) continue
      newSegments += 1
      newChars += len
    }
    return newSegments >= FEEDBACK_MIN_NEW_SEGMENTS || newChars >= FEEDBACK_MIN_NEW_CHARS
  })

  // ── Recorder-state sync (called by the view's useMeetingRecorder) ─────
  const setRecordingState = (rec: boolean, isPausedVal: boolean, elapsed: number): void => {
    recording.value = rec
    paused.value = isPausedVal
    elapsedMs.value = elapsed
  }

  // ── Actions: session lifecycle ────────────────────────────────────────
  const createSession = async (payload: CreateMeetingRequest): Promise<MeetingSession | null> => {
    creating.value = true
    error.value = null
    try {
      const session = await api.createSession(payload)
      currentSession.value = session
      segments.value = []
      feedbacks.value = []
      speakers.value = []
      lastFeedbackSeq.value = -1
      lastTranscribedMs.value = 0
      interimText.value = ''
      return session
    } catch (err) {
      error.value = (err as Error).message ?? '创建会议失败'
      return null
    } finally {
      creating.value = false
    }
  }

  const loadSession = async (id: number): Promise<void> => {
    loadingDetail.value = true
    error.value = null
    try {
      const detail = await api.getSession(id)
      currentSession.value = detail.session
      segments.value = [...detail.segments].sort((a, b) => a.seq - b.seq)
      feedbacks.value = [...detail.feedbacks].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      // Final speaker roster (DIARIZATION_SPEC §6). Absent on a pre-migration /
      // pre-offline backend → empty list (segments then fall back to A/B/C / grey).
      speakers.value = detail.speakers ?? []
      // Restore feedback anchor to the highest feedback's anchor so a re-entered
      // active session doesn't immediately re-fire auto feedback. Sentinel -1
      // (no prior feedback) keeps the seq=0 trigger boundary consistent.
      lastFeedbackSeq.value = feedbacks.value.reduce(
        (max, f) => (f.anchor_seq > max ? f.anchor_seq : max),
        -1
      )
    } catch (err) {
      error.value = (err as Error).message ?? '加载会议失败'
    } finally {
      loadingDetail.value = false
    }
  }

  const loadHistory = async (page = 1, pageSize = 20): Promise<void> => {
    loadingList.value = true
    error.value = null
    try {
      const res = await api.listSessions(page, pageSize)
      sessions.value = res.list
      sessionsTotal.value = res.total
    } catch (err) {
      error.value = (err as Error).message ?? '加载历史失败'
    } finally {
      loadingList.value = false
    }
  }

  /**
   * appendFinalSegment — fold an ASR `final` frame's segment into `segments`
   * (SPEC §2). De-dups by seq (defensive against a redelivered frame), keeps
   * seq order, clears the interim tail (that sentence is now finalized), and
   * advances lastTranscribedMs when the segment carried real text.
   *
   * The wire `final.segment` is a subset of MeetingSegment (no session_id /
   * audio_url — streaming segments store no per-segment audio, SPEC §3); we
   * widen it to a MeetingSegment with session_id from the current session and a
   * null audio_url so the rest of the store/view treats it uniformly.
   */
  const appendFinalSegment = (seg: AsrFinalSegment): void => {
    const sessionId = currentSession.value?.id ?? 0
    const segment: MeetingSegment = {
      id: seg.id,
      session_id: sessionId,
      seq: seg.seq,
      text: seg.text,
      start_ms: seg.start_ms,
      duration_seconds: seg.duration_seconds,
      audio_url: null,
      created_at: seg.created_at,
      // Carry the online speaker label (DIARIZATION_SPEC §6) from the wire frame
      // so the live transcript can color-code segments as they finalize. Absent
      // when diarization is OFF / soft-degraded → the view falls back to grey.
      online_speaker_id: seg.online_speaker_id ?? null,
      online_provisional: seg.online_provisional ?? false,
      speaker_confidence: seg.speaker_confidence ?? null
    }
    segments.value = [...segments.value.filter((s) => s.seq !== segment.seq), segment].sort(
      (a, b) => a.seq - b.seq
    )
    // The interim sentence just became this final → clear the grey tail.
    interimText.value = ''
    if (segment.text.trim().length > 0) {
      lastTranscribedMs.value = segment.start_ms + segment.duration_seconds * 1000
    }
  }

  /**
   * applySpeakerUpdate — merge a standalone `speaker` ws frame into the matching
   * segment (by DB id). The online speaker is assigned a few seconds AFTER the
   * `final` (embed+cluster runs behind), so without handling this frame the live
   * transcript shows every segment as 「发言人?」 forever — that was the bug.
   */
  const applySpeakerUpdate = (u: SpeakerUpdate): void => {
    const i = segments.value.findIndex((s) => s.id === u.segment_id)
    if (i === -1) return
    const updated: MeetingSegment = {
      ...segments.value[i],
      online_speaker_id: u.online_speaker_id,
      online_provisional: u.online_provisional,
      speaker_confidence: u.speaker_confidence
    }
    segments.value = [...segments.value.slice(0, i), updated, ...segments.value.slice(i + 1)]
  }

  /**
   * startAsrStream — open the realtime ASR ws for the active session and wire
   * its frames into store state (SPEC §2). Returns the handle so the view can
   * push PCM frames (from useMeetingRecorder.onPcmFrame) and finish/close.
   *
   * Idempotent-ish: if a stream is already open it is closed first. Errors from
   * the ws surface via `error` (frontend-state.md §3) and stop the stream; the
   * recording itself (full webm) is independent and keeps going.
   */
  const startAsrStream = (): AsrStreamHandle | null => {
    if (!currentSession.value) return null
    // Tear down any prior stream defensively.
    if (asrHandle) {
      asrHandle.close()
      asrHandle = null
    }
    asrReady.value = false
    asrStreaming.value = true
    interimText.value = ''
    error.value = null

    asrHandle = api.openAsrStream(currentSession.value.id, {
      onReady: () => {
        asrReady.value = true
      },
      onInterim: (text) => {
        interimText.value = text
      },
      onFinal: (segment) => {
        appendFinalSegment(segment)
      },
      onSpeaker: (u) => {
        applySpeakerUpdate(u)
      },
      onError: (message) => {
        // Non-fatal to the recording; surface to the user (retry = restart stream).
        error.value = message || '实时转写出错'
      },
      onClosed: () => {
        asrStreaming.value = false
        asrReady.value = false
        interimText.value = ''
        // The ws is fully closed — drop the handle so no stale reference lingers
        // (a later sendPcmFrame / finish / close becomes a clean no-op).
        asrHandle = null
      }
    })
    return asrHandle
  }

  /** sendPcmFrame — forward one raw PCM frame over the open ASR ws (no-op if none). */
  const sendPcmFrame = (frame: ArrayBuffer): void => {
    asrHandle?.sendPCM(frame)
  }

  /**
   * finishAsrStream — signal end-of-audio to the backend (graceful finish).
   * The stream stays open until the backend sends `closed` (then onClosed fires).
   */
  const finishAsrStream = (): void => {
    asrHandle?.finish()
  }

  /**
   * waitForAsrClosed — resolve once the ASR ws has fully closed (onClosed flips
   * asrStreaming → false) OR after `timeoutMs`, whichever comes first.
   *
   * Why: dashscope (Ali Paraformer) processing lags behind the audio, so after
   * `finish` the relay still emits a final sentence or two before sending
   * `closed`. doEnd() awaits this so those trailing finals land in the transcript
   * before we hard-close. The timeout is a safety net — if the relay never sends
   * `closed` (network drop), we don't hang the end flow forever; the caller then
   * hard-closes as a fallback.
   *
   * Resolves immediately if no stream is open (asrStreaming already false).
   */
  const waitForAsrClosed = (timeoutMs = 5000): Promise<void> => {
    if (!asrStreaming.value) return Promise.resolve()
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        stop()
        resolve()
      }
      const stop = watch(asrStreaming, (streaming) => {
        if (!streaming) finish()
      })
      const timer = setTimeout(finish, Math.max(0, timeoutMs))
    })
  }

  /** closeAsrStream — hard-close the ASR ws (idempotent) and reset stream state. */
  const closeAsrStream = (): void => {
    if (asrHandle) {
      asrHandle.close()
      asrHandle = null
    }
    asrStreaming.value = false
    asrReady.value = false
    interimText.value = ''
  }

  /**
   * uploadRecording — upload the full-session audio blob (webm/opus from the
   * parallel MediaRecorder) and merge the returned session (carries
   * recording_url) into state (SPEC §3). Non-fatal: a failed upload leaves the
   * transcript/summary intact, only playback is missing.
   *
   * Returns true on success. Surfaces failures via `error` per frontend-state.md.
   */
  const uploadRecording = async (blob: Blob): Promise<boolean> => {
    if (!currentSession.value) return false
    const sessionId = currentSession.value.id
    uploadingRecording.value = true
    try {
      const session = await api.uploadRecording(sessionId, blob)
      currentSession.value = session
      return true
    } catch (err) {
      error.value = (err as Error).message ?? '录音上传失败'
      return false
    } finally {
      uploadingRecording.value = false
    }
  }

  /**
   * endMeeting — POST /v1/meetings/:id/end (FEEDBACK_V2 §3.1: now ASYNC).
   *
   * The backend returns IMMEDIATELY (秒回) after flipping status→ended +
   * summary_status→'generating'; the minutes are produced by a background
   * goroutine. So the returned session usually carries summary_status==='generating'
   * (occasionally 'done' if generation was near-instant). This action no longer
   * blocks on summary generation — the Summary view polls getSession until the
   * status settles to 'done' / 'failed'. We only persist whatever the end call
   * returns into currentSession so the Summary page starts from a correct status.
   */
  const endMeeting = async (generateSummary = true): Promise<MeetingSession | null> => {
    if (!currentSession.value) return null
    const sessionId = currentSession.value.id
    ending.value = true
    error.value = null
    try {
      const session = await api.endMeeting(sessionId, generateSummary)
      currentSession.value = session
      return session
    } catch (err) {
      error.value = (err as Error).message ?? '结束会议失败'
      return null
    } finally {
      ending.value = false
    }
  }

  /**
   * refreshSession — re-fetch the session detail (GET /v1/meetings/:id) and merge
   * into state, WITHOUT toggling loadingDetail (so a background poll doesn't flash
   * the full-page skeleton). Used by the Summary view to poll summary_status while
   * it transitions generating → done / failed (FEEDBACK_V2 §3.2). Errors surface
   * via `error` per frontend-state.md §3; returns the updated status or null on failure.
   */
  const refreshSession = async (id: number): Promise<MeetingSummaryStatus | null> => {
    try {
      const detail = await api.getSession(id)
      currentSession.value = detail.session
      // Keep transcript/feedbacks fresh too (cheap; summary view ignores them but
      // a re-entered live view benefits from consistency).
      segments.value = [...detail.segments].sort((a, b) => a.seq - b.seq)
      feedbacks.value = [...detail.feedbacks].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      // Refresh the speaker roster too — a poll while diarization_status flips
      // refining → done is exactly when the final A/B/C → 1/2/3 labels arrive.
      speakers.value = detail.speakers ?? []
      return detail.session.summary_status
    } catch (err) {
      error.value = (err as Error).message ?? '加载会议失败'
      return null
    }
  }

  // ── Actions: feedback (SSE) ───────────────────────────────────────────
  /**
   * requestFeedback — POST a feedback request and consume the SSE stream.
   *  - trigger='auto': judge may `skip` (no bubble); on `done` append the DTO.
   *  - trigger='manual': always produces a `done` feedback.
   * Token frames accumulate into `streamingFeedback` for a live bubble; the
   * terminal `done`/`error`/`skip` clears it.
   *
   * Returns the final MeetingFeedback on `done`, null on skip/error.
   */
  const requestFeedback = async (
    trigger: MeetingFeedbackTrigger,
    signal?: AbortSignal
  ): Promise<MeetingFeedback | null> => {
    if (!currentSession.value) return null
    if (feedbackStreaming.value) return null
    const sessionId = currentSession.value.id
    // Highest seq consumed by this request. -1 (no segments yet) is a valid
    // anchor under the sentinel convention — advancing to it is a no-op so a
    // future seq=0 segment still satisfies canFeedback's `seq > lastFeedbackSeq`.
    const anchorSeq = latestSeq.value

    feedbackStreaming.value = true
    streamingFeedback.value = ''
    error.value = null

    let result: MeetingFeedback | null = null
    try {
      const payload: FeedbackRequest = { trigger }
      await api.streamFeedback(
        sessionId,
        payload,
        (event) => {
          switch (event.type) {
            case 'token': {
              const text = typeof event.data === 'string' ? event.data : ''
              streamingFeedback.value = (streamingFeedback.value ?? '') + text
              break
            }
            case 'skip': {
              // Auto judge decided no feedback — stay silent (no bubble).
              streamingFeedback.value = null
              break
            }
            case 'done': {
              const fb = event.data as MeetingFeedback
              if (fb && typeof fb.id === 'number') {
                feedbacks.value = [...feedbacks.value, fb]
                result = fb
              }
              streamingFeedback.value = null
              break
            }
            case 'error': {
              const errPayload = event.data as FeedbackErrorPayload
              error.value = errPayload?.message || '反馈生成失败'
              streamingFeedback.value = null
              break
            }
          }
        },
        signal
      )
      // Advance the auto-feedback anchor regardless of skip/done so the next auto
      // tick waits for genuinely new transcript (a skip still "consumed" the window).
      lastFeedbackSeq.value = anchorSeq
      return result
    } catch (err) {
      // AbortError (user navigated away / cancelled) is not a user-facing error.
      if ((err as Error)?.name !== 'AbortError') {
        error.value = (err as Error).message ?? '反馈请求失败'
        // Backoff: advance the anchor even on network failure / stream break so
        // the next auto tick does NOT immediately re-fire on the same transcript
        // (canFeedback would stay true → request storm during network flapping).
        // It will only retry once genuinely new transcript arrives past anchorSeq.
        // AbortError is intentional cancellation — leave the anchor so a fresh
        // request can still cover this window.
        lastFeedbackSeq.value = anchorSeq
      }
      streamingFeedback.value = null
      return null
    } finally {
      feedbackStreaming.value = false
    }
  }

  // ── Actions: presets ──────────────────────────────────────────────────
  const loadPresets = async (): Promise<void> => {
    loadingPresets.value = true
    error.value = null
    try {
      presets.value = await api.listPresets()
    } catch (err) {
      error.value = (err as Error).message ?? '加载预设失败'
    } finally {
      loadingPresets.value = false
    }
  }

  const savePreset = async (payload: SavePresetRequest): Promise<MeetingPreset | null> => {
    savingPreset.value = true
    error.value = null
    try {
      const preset = await api.savePreset(payload)
      presets.value = [...presets.value, preset]
      return preset
    } catch (err) {
      error.value = (err as Error).message ?? '保存预设失败'
      return null
    } finally {
      savingPreset.value = false
    }
  }

  const deletePreset = async (id: number): Promise<boolean> => {
    deletingPreset.value = true
    error.value = null
    try {
      await api.deletePreset(id)
      presets.value = presets.value.filter((p) => p.id !== id)
      return true
    } catch (err) {
      error.value = (err as Error).message ?? '删除预设失败'
      return false
    } finally {
      deletingPreset.value = false
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────
  const reset = (): void => {
    // Tear down any live ASR ws so a navigation away doesn't leak the socket.
    if (asrHandle) {
      asrHandle.close()
      asrHandle = null
    }
    currentSession.value = null
    segments.value = []
    feedbacks.value = []
    speakers.value = []
    sessions.value = []
    sessionsTotal.value = 0
    recording.value = false
    paused.value = false
    elapsedMs.value = 0
    lastTranscribedMs.value = 0
    lastFeedbackSeq.value = -1
    feedbackStreaming.value = false
    streamingFeedback.value = null
    interimText.value = ''
    asrReady.value = false
    asrStreaming.value = false
    creating.value = false
    loadingDetail.value = false
    loadingList.value = false
    uploadingRecording.value = false
    ending.value = false
    loadingPresets.value = false
    savingPreset.value = false
    deletingPreset.value = false
    error.value = null
  }

  return {
    // state
    currentSession,
    segments,
    feedbacks,
    speakers,
    presets,
    sessions,
    sessionsTotal,
    recording,
    paused,
    elapsedMs,
    interimText,
    asrReady,
    asrStreaming,
    lastTranscribedMs,
    lastFeedbackSeq,
    feedbackStreaming,
    streamingFeedback,
    creating,
    loadingDetail,
    loadingList,
    uploadingRecording,
    ending,
    loadingPresets,
    savingPreset,
    deletingPreset,
    error,
    // getters
    transcript,
    finalsTranscript,
    transcriptLength,
    isRecording,
    isPaused,
    isActive,
    latestSeq,
    canFeedback,
    diarizationStatus,
    speakerByCluster,
    // actions
    setRecordingState,
    applySpeakerUpdate,
    createSession,
    loadSession,
    loadHistory,
    startAsrStream,
    sendPcmFrame,
    finishAsrStream,
    waitForAsrClosed,
    closeAsrStream,
    appendFinalSegment,
    uploadRecording,
    endMeeting,
    refreshSession,
    requestFeedback,
    loadPresets,
    savePreset,
    deletePreset,
    reset
  }
})
