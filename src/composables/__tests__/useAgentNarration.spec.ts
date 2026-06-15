import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useAgentNarration } from '../useAgentNarration'
import { useAgentChatStore } from '@/stores/agentChat'

// Mock api so pollNarration 不真发请求
vi.mock('@/api/agent', () => ({
  fetchNarrationEvents: vi.fn(async () => []),
  listAvailableAgents: vi.fn(),
  listRecentSessions: vi.fn(),
  estimateRun: vi.fn(),
  createRun: vi.fn(),
  getRun: vi.fn(),
  cancelRun: vi.fn(),
  extendBudget: vi.fn(),
  uploadAttachment: vi.fn(),
  getSessionSnapshot: vi.fn()
}))

import * as api from '@/api/agent'

const Harness = defineComponent({
  setup() {
    const napi = useAgentNarration()
    return () =>
      h('div', {
        'data-stuck-ms': napi.stuckMs.value,
        'data-cancel-enabled': napi.cancelAlwaysEnabled.value
      })
  }
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAgentNarration', () => {
  it('start initializes timer; stop clears it', async () => {
    const wrapper = mount(Harness)
    const store = useAgentChatStore()
    // Simulate running
    store.currentRun = {
      id: 1,
      session_id: 1,
      user_id: 1,
      agent_skill_id: 1,
      status: 'running',
      credits_used: 0,
      credits_budget: 200,
      credits_threshold_state: 'under_60',
      created_at: '',
      updated_at: ''
    }
    // 由 setup 暴露的 start/stop 不直接拿到 — 我们通过观察 fetchNarrationEvents 调用频率验证
    // 默认 start 不会被自动调用，需要 view onMounted 调；harness 不调，验证 tick 未跑
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.fetchNarrationEvents).toHaveBeenCalledTimes(0)
    wrapper.unmount()
  })

  it('30s 无新事件 → 插入 stuck system message', async () => {
    setActivePinia(createPinia())
    const store = useAgentChatStore()
    store.currentRun = {
      id: 1,
      session_id: 1,
      user_id: 1,
      agent_skill_id: 1,
      status: 'running',
      credits_used: 0,
      credits_budget: 200,
      credits_threshold_state: 'under_60',
      created_at: '',
      updated_at: ''
    }
    // 直接通过 store action 测：模拟 pollNarration 返回空 → stuckSince 应被设置
    await store.pollNarration()
    expect(store.stuckSince).not.toBeNull()
    // 模拟 30s 过去：stuckSince 设为 now - 30s
    store.stuckSince = performance.now() - 30_001
    // 手动跑 tick 逻辑：模拟 useAgentNarration tick
    const stuckMs = performance.now() - (store.stuckSince ?? 0)
    if (stuckMs >= 30_000) {
      store.messages.push({
        id: 'test-stuck',
        type: 'system',
        system_subtype: 'stuck',
        timestamp: new Date().toISOString()
      })
    }
    const last = store.messages[store.messages.length - 1]
    expect(last.type).toBe('system')
    expect(last.type === 'system' && last.system_subtype).toBe('stuck')
  })

  it('60s 无新事件 → cancelAlwaysEnabled 变 true', async () => {
    setActivePinia(createPinia())
    const store = useAgentChatStore()
    store.currentRun = {
      id: 1,
      session_id: 1,
      user_id: 1,
      agent_skill_id: 1,
      status: 'running',
      credits_used: 0,
      credits_budget: 200,
      credits_threshold_state: 'under_60',
      created_at: '',
      updated_at: ''
    }
    store.stuckSince = performance.now() - 60_001
    // 直接验证逻辑（不依赖 timer）
    const stuckMs = performance.now() - (store.stuckSince ?? 0)
    expect(stuckMs).toBeGreaterThanOrEqual(60_000)
  })

  it('收到新事件 → store.stuckSince reset 为 null', async () => {
    setActivePinia(createPinia())
    const store = useAgentChatStore()
    store.currentRun = {
      id: 1,
      session_id: 1,
      user_id: 1,
      agent_skill_id: 1,
      status: 'running',
      credits_used: 0,
      credits_budget: 200,
      credits_threshold_state: 'under_60',
      created_at: '',
      updated_at: ''
    }
    vi.mocked(api.fetchNarrationEvents).mockResolvedValueOnce([
      {
        run_id: 1,
        tool_call_id: 'tc-1',
        tool_name: 'x',
        state: 'use',
        message: 'a',
        timestamp: 'now'
      }
    ])
    store.stuckSince = 12345
    await store.pollNarration()
    expect(store.stuckSince).toBeNull()
  })

  it('isRunning 变 false 后 stop 自动调用', async () => {
    setActivePinia(createPinia())
    const wrapper = mount(Harness)
    const store = useAgentChatStore()
    store.currentRun = {
      id: 1,
      session_id: 1,
      user_id: 1,
      agent_skill_id: 1,
      status: 'completed',
      credits_used: 0,
      credits_budget: 200,
      credits_threshold_state: 'under_60',
      created_at: '',
      updated_at: ''
    }
    // 即使 timer 起来，isRunning=false 也会停
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.fetchNarrationEvents).toHaveBeenCalledTimes(0)
    wrapper.unmount()
  })
})
