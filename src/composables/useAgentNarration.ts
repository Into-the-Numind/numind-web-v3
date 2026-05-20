/**
 * useAgentNarration — 每 500ms 拉取 narration 事件并合并到 store。
 * 自动检测 stuck（30s 插 system message；60s 后取消按钮永不 disabled）。
 *
 * Refs: docs/agent-mode/feature-11-spec.md §7.1
 */
import { onUnmounted, ref, watch } from 'vue'
import { useAgentChatStore } from '@/stores/agentChat'

const uuid = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export interface UseAgentNarrationApi {
  stuckMs: import('vue').Ref<number>
  cancelAlwaysEnabled: import('vue').Ref<boolean>
  start: () => void
  stop: () => void
}

export function useAgentNarration(): UseAgentNarrationApi {
  const store = useAgentChatStore()
  let timer: ReturnType<typeof setInterval> | null = null
  const stuckMs = ref(0)
  const cancelAlwaysEnabled = ref(false)

  const tick = async (): Promise<void> => {
    await store.pollNarration()
    if (store.stuckSince !== null) {
      stuckMs.value = performance.now() - store.stuckSince
      if (
        stuckMs.value >= 30_000 &&
        !store.messages.find((m) => m.type === 'system' && m.system_subtype === 'stuck')
      ) {
        store.messages.push({
          id: uuid(),
          type: 'system',
          system_subtype: 'stuck',
          timestamp: new Date().toISOString()
        })
      }
      if (stuckMs.value >= 60_000) {
        cancelAlwaysEnabled.value = true
      }
    } else {
      stuckMs.value = 0
      cancelAlwaysEnabled.value = false
    }
  }

  const start = (): void => {
    if (timer !== null) return
    timer = setInterval(tick, 500)
  }

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  watch(
    () => store.isRunning,
    (running) => {
      if (!running) stop()
    }
  )

  onUnmounted(stop)

  return { stuckMs, cancelAlwaysEnabled, start, stop }
}
