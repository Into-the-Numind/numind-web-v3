/**
 * useAgentStream — composable that drives the SSE streaming path for agent runs.
 *
 * Responsibilities:
 *  - POST /v1/agent-runs/stream via streamAgentRun and forward each AgentStreamEvent
 *    to store.applyStreamEvent
 *  - On 409 AgentStreamConflict: fall back to polling via useAgentRun().startStatusPolling()
 *  - On any other error: call store.applyError to surface a failed system message in the chat
 *  - Expose AbortController-backed stop() for user-initiated cancellation
 *
 * Spec: docs/superpowers/specs/2026-05-27-agent-react-streaming-design.md §5.4
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import {
  streamAgentRun,
  answerAndResumeStream,
  streamAgentRunEvents,
  compareAgentStreamCursor
} from '@/api/agent-stream'
import { AgentStreamConflict } from '@/types/agent-stream'
import type { AgentStreamEvent } from '@/types/agent-stream'
import { useAgentChatStore } from '@/stores/agentChat'
import { useAgentRun } from '@/composables/useAgentRun'
import type { CreateRunRequest } from '@/types/agent'
import type { AnswerItemPayload } from '@/api/agent'

export interface AttachRunEventsOptions {
  after?: string
  baseline?: 'cursor' | 'from_start' | 'pause'
}

interface StreamObserverState {
  lastCursor: string
  anyTerminalSeen: boolean
  finalTerminalSeen: boolean
  detachedContinuationExpected: boolean
}

export interface UseAgentStreamApi {
  /** Start streaming for the given run request. Resolves when stream ends. */
  start: (req: CreateRunRequest) => Promise<void>
  /**
   * Resume a paused run by submitting ask_user_question answers over the SSE
   * answer-stream (issue4: the resumed leg streams its prose narration back
   * through the same applyStreamEvent pipeline). Rethrows non-abort errors so
   * the caller can fall back to the poll-based resume.
   */
  startResume: (opts: {
    runId: number
    answers: Record<string, AnswerItemPayload>
  }) => Promise<void>
  /** Attach this tab to realtime events for an ordinary active run. */
  attachRunEvents: (runId: number, opts?: AttachRunEventsOptions) => Promise<void>
  /** Attach a loaded/rebuilt tab to an existing external continuation. */
  attachContinuation: (runId: number, after?: string) => Promise<void>
  /** Abort the in-flight stream (safe to call when not streaming). */
  stop: () => void
  /** True while SSE stream is open. */
  isStreaming: Ref<boolean>
  /** True after 409 fallback — polling is now active. */
  fallbackPolling: Ref<boolean>
}

export function useAgentStream(): UseAgentStreamApi {
  const store = useAgentChatStore()
  const { startStatusPolling } = useAgentRun()

  const abort = ref<AbortController | null>(null)
  const isStreaming = ref(false)
  const fallbackPolling = ref(false)

  const waitBeforeReconnect = (delayMs: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('aborted', 'AbortError'))
        return
      }
      const timer = window.setTimeout(resolve, delayMs)
      signal.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer)
          reject(new DOMException('aborted', 'AbortError'))
        },
        { once: true }
      )
    })

  const retryDelays = [250, 500, 1000]

  const isAbortError = (err: unknown): err is DOMException =>
    err instanceof DOMException && err.name === 'AbortError'

  const terminalReason = (event: AgentStreamEvent): unknown =>
    event.data && typeof event.data === 'object' && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>).reason
      : undefined

  const isWaitingTerminal = (event: AgentStreamEvent): boolean =>
    event.type === 'terminal' && terminalReason(event) === 'waiting_for_user_choice'

  const isCurrentRunActive = (runId: number): boolean => {
    const run = store.currentRun
    return (
      run?.id === runId &&
      (run.status === 'running' || run.status === 'pending')
    )
  }

  const resolveAttachAfter = (runId: number, opts?: AttachRunEventsOptions): string => {
    if (opts?.after !== undefined) return opts.after
    if (opts?.baseline === 'pause') return 'pause'
    if (opts?.baseline === 'from_start') return ''
    return store.transportCursorForRun(runId) || ''
  }

  const createObserverState = (lastCursor = ''): StreamObserverState => ({
    lastCursor,
    anyTerminalSeen: false,
    finalTerminalSeen: false,
    detachedContinuationExpected: false
  })

  const createApplyEvent = (
    sessionEpoch: number,
    state: StreamObserverState,
    opts: { runId?: number; ignoreSavedCursor?: boolean } = {}
  ): ((event: AgentStreamEvent) => void) => {
    return (event: AgentStreamEvent): void => {
      if (!store.isCurrentSessionEpoch(sessionEpoch)) return
      if (opts.runId !== undefined && event.run_id !== opts.runId) return

      const cursor = event.transport_cursor
      const savedCursor = opts.ignoreSavedCursor
        ? ''
        : store.transportCursorForRun(event.run_id)
      const comparisonCursor = state.lastCursor || savedCursor
      if (cursor && comparisonCursor && compareAgentStreamCursor(cursor, comparisonCursor) <= 0) {
        return
      }
      if (cursor) {
        state.lastCursor = cursor
        store.recordTransportCursor(event.run_id, cursor)
      }
      if (event.type === 'external_action') state.detachedContinuationExpected = true
      if (
        event.type === 'question_prompt' &&
        event.data &&
        typeof event.data === 'object' &&
        !Array.isArray(event.data) &&
        (event.data as Record<string, unknown>).pause_type === 'auth'
      ) {
        state.detachedContinuationExpected = true
      }
      if (event.type === 'terminal') {
        state.anyTerminalSeen = true
        state.finalTerminalSeen = !isWaitingTerminal(event)
        store.clearTransportCursor(event.run_id)
      }
      store.applyStreamEvent(event, sessionEpoch)
    }
  }

  const attachRunEventsCore = async (
    runId: number,
    opts: AttachRunEventsOptions | undefined,
    sessionEpoch: number,
    signal: AbortSignal
  ): Promise<StreamObserverState> => {
    const initialAfter = resolveAttachAfter(runId, opts)
    let requestAfter = initialAfter
    const state = createObserverState(initialAfter && initialAfter !== 'pause' ? initialAfter : '')
    const ignoreSavedCursor =
      opts?.after !== undefined || opts?.baseline === 'from_start' || opts?.baseline === 'pause'
    const applyEvent = createApplyEvent(sessionEpoch, state, {
      runId,
      ignoreSavedCursor
    })

    store.setRealtimeContinuationRun(runId)
    try {
      for (let attempt = 0; !state.anyTerminalSeen; attempt++) {
        try {
          await streamAgentRunEvents(runId, requestAfter, applyEvent, signal)
          if (state.anyTerminalSeen) break
          throw new Error('Agent 实时事件流提前断开')
        } catch (err) {
          if (isAbortError(err)) throw err
          if (state.anyTerminalSeen) break
          if (!store.isCurrentSessionEpoch(sessionEpoch)) return state
          if (attempt >= retryDelays.length) {
            store.setRealtimeContinuationRun(null)
            fallbackPolling.value = true
            startStatusPolling()
            break
          }
          requestAfter = state.lastCursor || requestAfter
          await waitBeforeReconnect(retryDelays[attempt], signal)
        }
      }
      return state
    } finally {
      store.setRealtimeContinuationRun(null)
    }
  }

  const start = async (req: CreateRunRequest): Promise<void> => {
    // Guard: prevent concurrent streams
    if (isStreaming.value) return

    isStreaming.value = true
    fallbackPolling.value = false
    abort.value = new AbortController()
    const sessionEpoch = store.currentSessionEpoch()

    // The backend may take several seconds before its first stream_start frame.
    // Mark the request as pending locally so the chat can acknowledge the send
    // immediately instead of leaving an empty assistant area during that gap.
    store.sendingMessage = true

    // Optimistically render the user's bubble before the SSE round-trip
    // (T14 wire commit missed this; the streaming path has no DB echo or
    // user_message SSE event, so without this the bubble never appears).
    store.appendUserMessage(req, sessionEpoch)

    try {
      const streamState = createObserverState()
      const applyEvent = createApplyEvent(sessionEpoch, streamState)

      // A proxy can reject the original response after the browser has already
      // received the external-action card and waiting terminal. Preserve that
      // state and attach from the confirmed cursor instead of losing the very
      // reconnect path the cursor exists for.
      let initialStreamError: unknown = null
      try {
        await streamAgentRun(req, applyEvent, abort.value.signal)
      } catch (err) {
        initialStreamError = err
      }
      // The card is already visible. Keep the Abort/session boundary alive for
      // the detached leg without showing a minutes-long optimistic send state.
      if (store.isCurrentSessionEpoch(sessionEpoch)) store.sendingMessage = false

      if (initialStreamError instanceof AgentStreamConflict || isAbortError(initialStreamError)) {
        throw initialStreamError
      }

      const runId = store.currentRun?.id
      if (
        runId &&
        streamState.detachedContinuationExpected &&
        !streamState.finalTerminalSeen &&
        streamState.lastCursor
      ) {
        await attachRunEventsCore(
          runId,
          { after: streamState.lastCursor },
          sessionEpoch,
          abort.value.signal
        )
      } else if (
        runId &&
        !streamState.anyTerminalSeen &&
        isCurrentRunActive(runId)
      ) {
        await attachRunEventsCore(runId, undefined, sessionEpoch, abort.value.signal)
      } else if (initialStreamError && !streamState.anyTerminalSeen) {
        throw initialStreamError
      }
    } catch (err) {
      if (!store.isCurrentSessionEpoch(sessionEpoch)) return
      if (err instanceof AgentStreamConflict) {
        // R4: Another subscriber is already attached — fall back to polling
        fallbackPolling.value = true
        startStatusPolling()
      } else if (isAbortError(err)) {
        // User-initiated stop via stop() — not an error, no UI message
      } else {
        store.applyError(err, sessionEpoch)
      }
    } finally {
      store.setRealtimeContinuationRun(null)
      if (store.isCurrentSessionEpoch(sessionEpoch)) store.sendingMessage = false
      isStreaming.value = false
    }
  }

  const startResume = async (opts: {
    runId: number
    answers: Record<string, AnswerItemPayload>
  }): Promise<void> => {
    // Guard: prevent concurrent streams
    if (isStreaming.value) return

    isStreaming.value = true
    fallbackPolling.value = false
    abort.value = new AbortController()
    const sessionEpoch = store.currentSessionEpoch()

    // No appendUserMessage: the answers are not a user chat bubble — the
    // question_prompt card flips to "answered" in place (markQuestionAnswered).
    try {
      const streamState = createObserverState()
      const applyEvent = createApplyEvent(sessionEpoch, streamState, { runId: opts.runId })
      let resumeStreamError: unknown = null
      try {
        await answerAndResumeStream(opts.runId, opts.answers, applyEvent, abort.value.signal)
      } catch (err) {
        resumeStreamError = err
      }
      if (resumeStreamError instanceof AgentStreamConflict || isAbortError(resumeStreamError)) {
        throw resumeStreamError
      }
      if (!streamState.anyTerminalSeen && isCurrentRunActive(opts.runId)) {
        await attachRunEventsCore(opts.runId, undefined, sessionEpoch, abort.value.signal)
      } else if (resumeStreamError && !streamState.anyTerminalSeen) {
        throw resumeStreamError
      }
    } catch (err) {
      if (!store.isCurrentSessionEpoch(sessionEpoch)) return
      // User-initiated stop via stop() — not an error, and the run is still
      // resuming server-side; no fallback (re-opening would 409).
      if (isAbortError(err)) return
      // AgentStreamConflict / network — rethrow so the caller can fall back to
      // the poll-based resume.
      throw err
    } finally {
      isStreaming.value = false
    }
  }

  const attachRunEvents = async (
    runId: number,
    opts?: AttachRunEventsOptions
  ): Promise<void> => {
    if (isStreaming.value || runId <= 0) return

    isStreaming.value = true
    fallbackPolling.value = false
    abort.value = new AbortController()
    const sessionEpoch = store.currentSessionEpoch()

    try {
      await attachRunEventsCore(runId, opts, sessionEpoch, abort.value.signal)
    } catch (err) {
      if (!store.isCurrentSessionEpoch(sessionEpoch)) return
      if (!isAbortError(err)) {
        store.applyError(err, sessionEpoch)
      }
    } finally {
      store.setRealtimeContinuationRun(null)
      isStreaming.value = false
    }
  }

  const attachContinuation = async (runId: number, after?: string): Promise<void> => {
    const opts: AttachRunEventsOptions =
      after === undefined ? { baseline: 'pause' } : { after, baseline: 'pause' }
    await attachRunEvents(runId, opts)
  }

  const stop = (): void => {
    store.setRealtimeContinuationRun(null)
    abort.value?.abort()
  }

  return {
    start,
    startResume,
    attachRunEvents,
    attachContinuation,
    stop,
    isStreaming,
    fallbackPolling
  }
}
