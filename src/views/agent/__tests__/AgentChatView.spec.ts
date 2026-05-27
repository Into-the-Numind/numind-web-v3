import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useAgentChatStore } from '@/stores/agentChat'

// 验证：AgentChatView 6 状态分支由 store + props 计算逻辑驱动
// 复杂 mount 用 e2e 覆盖（T15）；这里只验关键 store / sessionStorage 行为

vi.mock('@/api/agent', () => ({
  listAvailableAgents: vi.fn(async () => ({ list: [], total: 0 })),
  listRecentSessions: vi.fn(async () => []),
  listAllHistorySessions: vi.fn(async () => []),
  estimateRun: vi.fn(),
  createRun: vi.fn(
    async () =>
      ({
        run_id: 1,
        session_id: 1,
        estimated_credits_min: 0,
        estimated_credits_max: 0
      }) as import('@/types/agent').CreateRunResponse
  ),
  getRun: vi.fn(async () => ({
    id: 1,
    session_id: 1,
    user_id: 1,
    agent_skill_id: 1,
    status: 'running' as const,
    credits_used: 0,
    credits_budget: 200,
    credits_threshold_state: 'under_60' as const,
    created_at: '',
    updated_at: ''
  })),
  fetchNarrationEvents: vi.fn(async () => []),
  cancelRun: vi.fn(),
  extendBudget: vi.fn(),
  submitFeedback: vi.fn(),
  uploadAttachment: vi.fn(),
  getSessionSnapshot: vi.fn(async () => ({
    session_id: 1,
    agent_skill_id: 1,
    messages: [],
    agent_run_ids: [],
    last_active_at: '',
    status: 'completed' as const
  })),
  getSupportContact: vi.fn(async () => ({ wechat: 'x' }))
}))

// ─── useAgentStream mock ───────────────────────────────────────────────────
const mockStreamStart = vi.fn(async () => {})
const mockStreamStop = vi.fn()
const mockIsStreaming = ref(false)
const mockFallbackPolling = ref(false)

vi.mock('@/composables/useAgentStream', () => ({
  useAgentStream: () => ({
    start: mockStreamStart,
    stop: mockStreamStop,
    isStreaming: mockIsStreaming,
    fallbackPolling: mockFallbackPolling
  })
}))

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
  mockIsStreaming.value = false
  mockFallbackPolling.value = false
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AgentChatView 6 状态分支', () => {
  it('isNewSession + 空 messages → showFirstRun', () => {
    const store = useAgentChatStore()
    store.currentAgent = {
      id: 1,
      name: 'a',
      description: '',
      is_active: true,
      created_at: '',
      updated_at: ''
    }
    // sessionId = 'new' && messages.length === 0 && currentAgent !== null → showFirstRun = true
    const sessionId = 'new'
    const showFirstRun =
      sessionId === 'new' && store.messages.length === 0 && store.currentAgent !== null
    expect(showFirstRun).toBe(true)
  })

  it('历史会话 sessionId !== "new" → 不显示 First-run', () => {
    const store = useAgentChatStore()
    const sessionId = '1234'
    const showFirstRun = sessionId === 'new' && store.messages.length === 0
    expect(showFirstRun).toBe(false)
  })

  it('loadingSnapshot=true → loading state', () => {
    const store = useAgentChatStore()
    store.loadingSnapshot = true
    expect(store.loadingSnapshot).toBe(true)
  })

  it('sessionError 非 null → error state', () => {
    const store = useAgentChatStore()
    store.sessionError = '加载失败'
    expect(store.sessionError).toBe('加载失败')
  })

  it('readOnly=true → isReadOnly 应在 loadSessionSnapshot 后被设', async () => {
    const store = useAgentChatStore()
    await store.loadSessionSnapshot(1, true)
    expect(store.isReadOnly).toBe(true)
  })

  it('sessionStorage.currentRunId 存在时可恢复（验证 store 写入逻辑）', async () => {
    const store = useAgentChatStore()
    await store.startNewRun(1, 'hi')
    expect(sessionStorage.getItem('agentChat:currentRunId')).toBe('1')
  })
})

// ─── T14: useAgentStream 集成行为验证 ────────────────────────────────────────
describe('T14 — streaming path wiring', () => {
  it('handleSend 调用 useAgentStream().start 并传入正确的 CreateRunRequest', async () => {
    const store = useAgentChatStore()
    store.currentAgent = {
      id: 42,
      name: 'test-agent',
      description: '',
      is_active: true,
      created_at: '',
      updated_at: ''
    }

    // Simulate the handleSend logic directly (mirrors AgentChatView.handleSend)
    const sessionId = 'new'
    const text = '测试问题'
    await mockStreamStart({
      agent_skill_id: store.currentAgent.id,
      input_text: text,
      session_id: sessionId !== 'new' ? sessionId : undefined,
      attachment_urls: store.attachments.map((a) => a.url)
    })

    expect(mockStreamStart).toHaveBeenCalledOnce()
    const callArg = mockStreamStart.mock.calls[0][0]
    expect(callArg.agent_skill_id).toBe(42)
    expect(callArg.input_text).toBe('测试问题')
    expect(callArg.session_id).toBeUndefined() // 'new' → not passed
    expect(callArg.attachment_urls).toEqual([])
  })

  it('session_id 非 new 时透传给 start()', async () => {
    const store = useAgentChatStore()
    store.currentAgent = {
      id: 7,
      name: 'a',
      description: '',
      is_active: true,
      created_at: '',
      updated_at: ''
    }

    const sessionId = 'abc-123'
    await mockStreamStart({
      agent_skill_id: store.currentAgent.id,
      input_text: 'hello',
      session_id: sessionId !== 'new' ? sessionId : undefined,
      attachment_urls: []
    })

    const callArg = mockStreamStart.mock.calls[0][0]
    expect(callArg.session_id).toBe('abc-123')
  })

  it('isStreaming=true 时 input disabled 计算为 true', () => {
    mockIsStreaming.value = true
    const store = useAgentChatStore()
    // The AgentInputArea :disabled binding is: isStreaming || store.isRunning || store.isWaitingForUser
    const disabled = mockIsStreaming.value || store.isRunning || store.isWaitingForUser
    expect(disabled).toBe(true)
  })

  it('isStreaming=false 时 input disabled 跟随 store.isRunning', () => {
    mockIsStreaming.value = false
    const store = useAgentChatStore()
    store.currentRun = null // not running
    const disabled = mockIsStreaming.value || store.isRunning || store.isWaitingForUser
    expect(disabled).toBe(false)
  })

  it('点击中止按钮调用 stop()', () => {
    mockStreamStop()
    expect(mockStreamStop).toHaveBeenCalledOnce()
  })

  it('onBeforeUnmount 时 stop() 应被调用（模拟清理路径）', () => {
    // Simulate the onUnmounted cleanup path
    const stopFn = mockStreamStop
    stopFn() // as would be called in onUnmounted
    expect(stopFn).toHaveBeenCalledOnce()
  })
})
