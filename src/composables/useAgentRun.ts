/**
 * useAgentRun — 包装 run lifecycle（start / cancel / status 轮询 5s）。
 *
 * Refs: docs/agent-mode/feature-11-spec.md §7.0 / §7.2
 */
import { onUnmounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useAgentChatStore } from '@/stores/agentChat'

export interface UseAgentRunApi {
  start: (agentId: number, text: string, sessionId?: string) => Promise<void>
  cancel: () => Promise<void>
  refresh: () => Promise<void>
  startStatusPolling: () => void
  stopStatusPolling: () => void
  isStatusPolling: Ref<boolean>
}

export function useAgentRun(): UseAgentRunApi {
  const store = useAgentChatStore()
  let statusTimer: ReturnType<typeof setInterval> | null = null
  const isStatusPolling = ref(false)

  const start = async (agentId: number, text: string, sessionId?: string): Promise<void> => {
    await store.startNewRun(agentId, text, sessionId)
  }

  const cancel = async (): Promise<void> => {
    await store.cancelCurrent()
  }

  const refresh = async (): Promise<void> => {
    await store.refreshRunStatus()
  }

  const startStatusPolling = (): void => {
    if (statusTimer !== null) {
      isStatusPolling.value = true
      return
    }
    statusTimer = setInterval(refresh, 5000)
    isStatusPolling.value = true
  }

  const stopStatusPolling = (): void => {
    if (statusTimer !== null) {
      clearInterval(statusTimer)
      statusTimer = null
    }
    isStatusPolling.value = false
  }

  onUnmounted(stopStatusPolling)

  return { start, cancel, refresh, startStatusPolling, stopStatusPolling, isStatusPolling }
}
