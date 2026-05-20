/**
 * useAgentCost — watch budgetThresholdState 触发 60% 警告 narration 和 100% 阻断事件。
 *
 * Refs: docs/agent-mode/feature-11-spec.md §7.0 / §7.3 / §8.1 / §8.2
 */
import { ref, watch } from 'vue'
import { useAgentChatStore } from '@/stores/agentChat'

const uuid = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export interface UseAgentCostApi {
  budgetExceeded: import('vue').Ref<boolean>
  watchThresholds: () => void
}

export function useAgentCost(): UseAgentCostApi {
  const store = useAgentChatStore()
  const budgetExceeded = ref(false)
  let warned60 = false

  const watchThresholds = (): void => {
    watch(
      () => store.budgetThresholdState,
      (newState) => {
        if (newState === 'warning_60' && !warned60) {
          warned60 = true
          store.messages.push({
            id: uuid(),
            type: 'system',
            system_subtype: 'retry',
            markdown: '🤖 任务已进行到 60% 左右，还有约 320 积分的空间。我会尽量在上限内完成。',
            timestamp: new Date().toISOString()
          })
        }
        if (newState === 'blocked_100') {
          budgetExceeded.value = true
        }
        if (newState === 'under_60') {
          // 续费后 reset
          warned60 = false
          budgetExceeded.value = false
        }
      }
    )
  }

  return { budgetExceeded, watchThresholds }
}
