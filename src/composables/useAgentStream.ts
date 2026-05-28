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
import { streamAgentRun } from '@/api/agent-stream'
import { AgentStreamConflict } from '@/types/agent-stream'
import { useAgentChatStore } from '@/stores/agentChat'
import { useAgentRun } from '@/composables/useAgentRun'
import type { CreateRunRequest } from '@/types/agent'

export interface UseAgentStreamApi {
  /** Start streaming for the given run request. Resolves when stream ends. */
  start: (req: CreateRunRequest) => Promise<void>
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

  const start = async (req: CreateRunRequest): Promise<void> => {
    // Guard: prevent concurrent streams
    if (isStreaming.value) return

    isStreaming.value = true
    fallbackPolling.value = false
    abort.value = new AbortController()

    // Optimistically render the user's bubble before the SSE round-trip
    // (T14 wire commit missed this; the streaming path has no DB echo or
    // user_message SSE event, so without this the bubble never appears).
    store.appendUserMessage(req)

    try {
      await streamAgentRun(req, (e) => store.applyStreamEvent(e), abort.value.signal)
    } catch (err) {
      if (err instanceof AgentStreamConflict) {
        // R4: Another subscriber is already attached — fall back to polling
        fallbackPolling.value = true
        startStatusPolling()
      } else if (err instanceof DOMException && err.name === 'AbortError') {
        // User-initiated stop via stop() — not an error, no UI message
      } else {
        store.applyError(err)
      }
    } finally {
      isStreaming.value = false
    }
  }

  const stop = (): void => {
    abort.value?.abort()
  }

  return { start, stop, isStreaming, fallbackPolling }
}
