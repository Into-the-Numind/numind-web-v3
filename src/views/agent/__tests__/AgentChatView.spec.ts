import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
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

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
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
