/**
 * useAgentNarration — 每 500ms 拉取 narration 事件并合并到 store。
 * 自动检测 stuck（90s 插 system message；180s 后取消按钮永不 disabled）。
 *
 * agent-wait-ux 5a: 阈值放宽到覆盖正常的长报告生成静默期（写最终报告/续跑启动
 * 的 1-3min 内没有工具事件是正常的，不是卡死，dev run 150 误报）。
 *
 * Refs: docs/agent-mode/feature-11-spec.md §7.1
 */
import { onUnmounted, ref, watch } from 'vue'
import { useAgentChatStore } from '@/stores/agentChat'

const uuid = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

// agent-wait-ux 5a: a long final-report generation is tool-silent for 1-3 min;
// the hint must wait past that normal window before suggesting a delay.
export const STUCK_HINT_MS = 90_000
export const CANCEL_ALWAYS_MS = 180_000

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
        stuckMs.value >= STUCK_HINT_MS &&
        !store.messages.find((m) => m.type === 'system' && m.system_subtype === 'stuck')
      ) {
        store.messages.push({
          id: uuid(),
          type: 'system',
          system_subtype: 'stuck',
          timestamp: new Date().toISOString()
        })
      }
      if (stuckMs.value >= CANCEL_ALWAYS_MS) {
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
