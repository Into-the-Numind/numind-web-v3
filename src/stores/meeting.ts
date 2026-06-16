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
import { ref, computed } from 'vue'
import * as api from '@/api/meeting'
import type {
  MeetingSession,
  MeetingSegment,
  MeetingFeedback,
  MeetingPreset,
  CreateMeetingRequest,
  IngestSegmentRequest,
  SavePresetRequest,
  FeedbackRequest,
  FeedbackErrorPayload,
  MeetingFeedbackTrigger
} from '@/types/meeting'

export const useMeetingStore = defineStore('meeting', () => {
  // ── State ────────────────────────────────────────────────────────────
  const currentSession = ref<MeetingSession | null>(null)
  const segments = ref<MeetingSegment[]>([])
  const feedbacks = ref<MeetingFeedback[]>([])
  const presets = ref<MeetingPreset[]>([])

  // History list
  const sessions = ref<MeetingSession[]>([])
  const sessionsTotal = ref(0)

  // Recording-state mirror (driven by the view's useMeetingRecorder).
  const recording = ref(false)
  const paused = ref(false)
  const elapsedMs = ref(0)
  // Monotonic timestamp (ms, from session start) of the last segment that
  // actually carried transcript text — used to gate auto feedback (canFeedback).
  const lastTranscribedMs = ref(0)
  // Anchor (highest segment seq) consumed by the last feedback — auto trigger
  // only fires when new transcript has arrived since. Sentinel -1 means "no
  // feedback yet" so the very first segment (seq=0) can satisfy canFeedback's
  // strict `seq > lastFeedbackSeq` gate (a seq=0-only meeting would otherwise
  // never trigger once lastFeedbackSeq settled at 0).
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
  const ingesting = ref(false)
  const ending = ref(false)
  const loadingPresets = ref(false)
  const savingPreset = ref(false)
  const deletingPreset = ref(false)

  // User-facing error (last failed action). Views show + offer retry.
  const error = ref<string | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────
  /** Full transcript text, segments joined in seq order (silent segments skipped). */
  const transcript = computed(() =>
    [...segments.value]
      .sort((a, b) => a.seq - b.seq)
      .map((s) => s.text)
      .filter((t) => t.trim().length > 0)
      .join('\n')
  )

  /** Total transcribed character count (drives "enough new transcript" gating). */
  const transcriptLength = computed(() => segments.value.reduce((acc, s) => acc + s.text.length, 0))

  const isRecording = computed(() => recording.value)
  const isPaused = computed(() => paused.value)
  const isActive = computed(() => currentSession.value?.status === 'active')

  /** Highest segment seq seen so far (-1 when none). */
  const latestSeq = computed(() =>
    segments.value.reduce((max, s) => (s.seq > max ? s.seq : max), -1)
  )

  /**
   * canFeedback — true when it is meaningful to request feedback now:
   *  - a session is active,
   *  - no feedback stream is already in flight,
   *  - AND there is at least one non-empty transcript segment that arrived since
   *    the last feedback (lastFeedbackSeq). Manual feedback may bypass the
   *    "new transcript" part via requestManualFeedback's own check, but for the
   *    AUTO timer this getter is the gate.
   */
  const canFeedback = computed(() => {
    if (!isActive.value) return false
    if (feedbackStreaming.value) return false
    const hasNewTranscript = segments.value.some(
      (s) => s.seq > lastFeedbackSeq.value && s.text.trim().length > 0
    )
    return hasNewTranscript
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
      lastFeedbackSeq.value = -1
      lastTranscribedMs.value = 0
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
   * ingestSegment — upload one recorded WAV window for ASR and append the
   * returned segment. Called per recorder window (SPEC §3 segments). On success
   * advances lastTranscribedMs when the segment carried real text.
   *
   * Returns the persisted segment (or null on failure) so the caller can react.
   */
  const ingestSegment = async (payload: IngestSegmentRequest): Promise<MeetingSegment | null> => {
    if (!currentSession.value) return null
    const sessionId = currentSession.value.id
    ingesting.value = true
    try {
      const res = await api.ingestSegment(sessionId, payload)
      const segment = res.segment
      // De-dup by seq (defensive against retries) then insert in order.
      segments.value = [...segments.value.filter((s) => s.seq !== segment.seq), segment].sort(
        (a, b) => a.seq - b.seq
      )
      if (segment.text.trim().length > 0) {
        lastTranscribedMs.value = segment.start_ms + segment.duration_seconds * 1000
      }
      return segment
    } catch (err) {
      // Segment ingest failures are non-fatal (one lost window) — surface but do
      // not throw; the recording keeps going.
      error.value = (err as Error).message ?? '转写失败'
      return null
    } finally {
      ingesting.value = false
    }
  }

  const endMeeting = async (): Promise<MeetingSession | null> => {
    if (!currentSession.value) return null
    const sessionId = currentSession.value.id
    ending.value = true
    error.value = null
    try {
      const session = await api.endMeeting(sessionId)
      currentSession.value = session
      return session
    } catch (err) {
      error.value = (err as Error).message ?? '结束会议失败'
      return null
    } finally {
      ending.value = false
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
    currentSession.value = null
    segments.value = []
    feedbacks.value = []
    sessions.value = []
    sessionsTotal.value = 0
    recording.value = false
    paused.value = false
    elapsedMs.value = 0
    lastTranscribedMs.value = 0
    lastFeedbackSeq.value = -1
    feedbackStreaming.value = false
    streamingFeedback.value = null
    creating.value = false
    loadingDetail.value = false
    loadingList.value = false
    ingesting.value = false
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
    presets,
    sessions,
    sessionsTotal,
    recording,
    paused,
    elapsedMs,
    lastTranscribedMs,
    lastFeedbackSeq,
    feedbackStreaming,
    streamingFeedback,
    creating,
    loadingDetail,
    loadingList,
    ingesting,
    ending,
    loadingPresets,
    savingPreset,
    deletingPreset,
    error,
    // getters
    transcript,
    transcriptLength,
    isRecording,
    isPaused,
    isActive,
    latestSeq,
    canFeedback,
    // actions
    setRecordingState,
    createSession,
    loadSession,
    loadHistory,
    ingestSegment,
    endMeeting,
    requestFeedback,
    loadPresets,
    savePreset,
    deletePreset,
    reset
  }
})
