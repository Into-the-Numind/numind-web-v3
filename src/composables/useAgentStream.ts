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
      let lastCursor = ''
      let detachedContinuationExpected = false
      let finalTerminalSeen = false
      const applyEvent = (e: AgentStreamEvent): void => {
        const cursor = e.transport_cursor
        if (cursor && lastCursor && compareAgentStreamCursor(cursor, lastCursor) <= 0) return
        if (cursor) lastCursor = cursor
        if (e.type === 'external_action') detachedContinuationExpected = true
        if (
          e.type === 'question_prompt' &&
          e.data &&
          typeof e.data === 'object' &&
          !Array.isArray(e.data) &&
          (e.data as Record<string, unknown>).pause_type === 'auth'
        ) {
          detachedContinuationExpected = true
        }
        if (e.type === 'terminal') {
          const reason =
            e.data && typeof e.data === 'object' && !Array.isArray(e.data)
              ? (e.data as Record<string, unknown>).reason
              : undefined
          finalTerminalSeen = reason !== 'waiting_for_user_choice'
        }
        store.applyStreamEvent(e, sessionEpoch)
      }

      await streamAgentRun(req, applyEvent, abort.value.signal)
      // The card is already visible. Keep the Abort/session boundary alive for
      // the detached leg without showing a minutes-long optimistic send state.
      if (store.isCurrentSessionEpoch(sessionEpoch)) store.sendingMessage = false

      if (detachedContinuationExpected && !finalTerminalSeen && lastCursor) {
        const runId = store.currentRun?.id
        if (runId) {
          store.setRealtimeContinuationRun(runId)
          const retryDelays = [250, 500, 1000]
          for (let attempt = 0; !finalTerminalSeen; attempt++) {
            try {
              await streamAgentRunEvents(runId, lastCursor, applyEvent, abort.value.signal)
              if (finalTerminalSeen) break
              throw new Error('Agent 实时事件流提前断开')
            } catch (err) {
              if (err instanceof DOMException && err.name === 'AbortError') throw err
              if (!store.isCurrentSessionEpoch(sessionEpoch)) return
              if (attempt >= retryDelays.length) {
                store.setRealtimeContinuationRun(null)
                fallbackPolling.value = true
                startStatusPolling()
                break
              }
              await waitBeforeReconnect(retryDelays[attempt], abort.value.signal)
            }
          }
          if (finalTerminalSeen) store.setRealtimeContinuationRun(null)
        }
      }
    } catch (err) {
      if (!store.isCurrentSessionEpoch(sessionEpoch)) return
      if (err instanceof AgentStreamConflict) {
        // R4: Another subscriber is already attached — fall back to polling
        fallbackPolling.value = true
        startStatusPolling()
      } else if (err instanceof DOMException && err.name === 'AbortError') {
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
      await answerAndResumeStream(
        opts.runId,
        opts.answers,
        (e) => store.applyStreamEvent(e, sessionEpoch),
        abort.value.signal
      )
    } catch (err) {
      if (!store.isCurrentSessionEpoch(sessionEpoch)) return
      // User-initiated stop via stop() — not an error, and the run is still
      // resuming server-side; no fallback (re-opening would 409).
      if (err instanceof DOMException && err.name === 'AbortError') return
      // AgentStreamConflict / network — rethrow so the caller can fall back to
      // the poll-based resume.
      throw err
    } finally {
      isStreaming.value = false
    }
  }

  const stop = (): void => {
    store.setRealtimeContinuationRun(null)
    abort.value?.abort()
  }

  return { start, startResume, stop, isStreaming, fallbackPolling }
}
