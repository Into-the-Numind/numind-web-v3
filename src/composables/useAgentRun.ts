/**
 * useAgentRun — 包装 run lifecycle（start / cancel / status 轮询 5s）。
 *
 * Refs: docs/agent-mode/feature-11-spec.md §7.0 / §7.2
 */
import { onUnmounted } from 'vue'
import { useAgentChatStore } from '@/stores/agentChat'

export interface UseAgentRunApi {
  start: (agentId: number, text: string) => Promise<void>
  cancel: () => Promise<void>
  refresh: () => Promise<void>
  startStatusPolling: () => void
  stopStatusPolling: () => void
}

export function useAgentRun(): UseAgentRunApi {
  const store = useAgentChatStore()
  let statusTimer: ReturnType<typeof setInterval> | null = null

  const start = async (agentId: number, text: string): Promise<void> => {
    await store.startNewRun(agentId, text)
  }

  const cancel = async (): Promise<void> => {
    await store.cancelCurrent()
  }

  const refresh = async (): Promise<void> => {
    await store.refreshRunStatus()
  }

  const startStatusPolling = (): void => {
    if (statusTimer !== null) return
    statusTimer = setInterval(refresh, 5000)
  }

  const stopStatusPolling = (): void => {
    if (statusTimer !== null) {
      clearInterval(statusTimer)
      statusTimer = null
    }
  }

  onUnmounted(stopStatusPolling)

  return { start, cancel, refresh, startStatusPolling, stopStatusPolling }
}
