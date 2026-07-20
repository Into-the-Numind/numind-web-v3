/**
 * agentChat-resume.spec.ts — reproduces dev run 148 (2026-06-12): the
 * answer-resume false-终态 bug.
 *
 * After the user answers an ask_user_question, the backend row reads
 * status='terminated' + state_reason='running' (AnswerAndClear flips
 * state_reason but historically not status; the detached resume runner never
 * corrected it either). The store's terminal check looked at status alone, so
 * one poll after answering it pushed the PRE-QUESTION prose (final_output
 * synthesized from the last assistant turn) as a final_answer and stopped
 * following — while the backend kept working for 8.5 minutes and delivered the
 * real report to nobody.
 *
 * Contract under test: state_reason='running' is the resume signature — the
 * run is ACTIVE no matter what status says. No final_answer, keep polling.
 * Permanent regression protection (NDF Rule 11).
 */
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAgentChatStore } from '../agentChat'
import type { FeishuOperationResult } from '@/api/feishu'
import type { AgentRun } from '@/types/agent'
import type { TerminalEvent } from '@/types/agent-stream'

vi.mock('@/api/agent', () => ({
  listAvailableAgents: vi.fn(async () => ({ list: [], total: 0 })),
  listRecentSessions: vi.fn(async () => []),
  estimateRun: vi.fn(),
  createRun: vi.fn(),
  getRun: vi.fn(),
  fetchNarrationEvents: vi.fn(async () => []),
  cancelRun: vi.fn(),
  postAgentAnswer: vi.fn(),
  uploadAttachment: vi.fn(),
  getSessionSnapshot: vi.fn(async () => ({
    session_id: 'sess-resume',
    agent_skill_id: 1,
    messages: [],
    agent_run_ids: [],
    last_active_at: '',
    status: 'completed' as const
  }))
}))

vi.mock('@/api/feishu', () => ({
  resumeFeishuOperation: vi.fn()
}))

import * as api from '@/api/agent'
import * as feishuAPI from '@/api/feishu'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

const RESUMING_RUN = {
  id: 148,
  session_id: 'sess-resume',
  status: 'terminated',
  state_reason: 'running',
  final_output: '公开信息已经挖到不少。现在我需要向你确认一些网上查不到的细节。',
  created_at: '',
  updated_at: ''
} as unknown as AgentRun

const futureExpiry = (milliseconds = 60_000): string =>
  new Date(Date.now() + milliseconds).toISOString()

describe('agentChat — answer-resume lifecycle (dev run 148)', () => {
  it('maps live and restored external actions into the same safe action message', async () => {
    const store = useAgentChatStore()
    const expiresAt = futureExpiry()

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: '2026-07-14T23:00:00Z',
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-1',
        session_id: 'session-1',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        url: 'https://open.feishu.cn/authorize',
        expires_at: expiresAt,
        scopes: ['forbidden']
      }
    })

    const live = store.messages.find((message) => message.type === 'external_action')
    expect(live).toMatchObject({
      type: 'external_action',
      run_id: 148,
      operation_id: 'op-1',
      session_id: 'session-1',
      phase: 'user_auth',
      url: 'https://open.feishu.cn/authorize',
      expires_at: expiresAt,
      action_status: 'pending'
    })
    expect(live).not.toHaveProperty('provider')
    expect(live).not.toHaveProperty('scopes')
    expect(live).not.toHaveProperty('tool_call_id')

    vi.mocked(api.getSessionSnapshot).mockResolvedValue({
      session_id: 'sess-resume',
      agent_skill_id: 1,
      agent_run_ids: [148],
      last_active_at: '',
      status: 'running',
      run: {
        id: 148,
        session_id: 'sess-resume',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      },
      messages: [
        {
          id: 'external-action-148',
          type: 'external_action',
          run_id: 148,
          operation_id: 'op-1',
          session_id: 'session-1',
          phase: 'user_auth',
          // Snapshot payloads are never permitted to rehydrate a transient
          // authorization URL, even if an old/malformed server payload leaks one.
          url: 'https://open.feishu.cn/anomalous-snapshot-url',
          expires_at: expiresAt,
          provider: 'feishu'
        }
      ]
    } as never)

    await store.loadSessionSnapshot('sess-resume', false)

    expect(store.messages).toEqual([
      expect.objectContaining({
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-1',
        session_id: 'session-1',
        phase: 'user_auth',
        expires_at: expiresAt,
        action_status: 'pending'
      })
    ])
    expect(store.messages[0]).not.toHaveProperty('provider')
    expect(store.messages[0]).not.toHaveProperty('url')
    store.reset()
  })

  it('keeps an official Lark authorization URL without transforming its opaque bytes', () => {
    const store = useAgentChatStore()
    const url = 'https://open.larksuite.com/suite/passport/oauth/device?user_code=opaque-value'

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: {
        provider: 'lark',
        operation_id: 'op-lark-url',
        session_id: 'session-lark-url',
        phase: 'user_auth',
        url,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    })

    expect(store.messages[0]).toMatchObject({ url, action_status: 'pending' })
    store.reset()
  })

  it('keeps the real Feishu v1.0.68 accounts verification URL without transforming it', () => {
    const store = useAgentChatStore()
    const url =
      'https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=opaque-flow&user_code=SAFE-CODE'
    try {
      store.applyStreamEvent({
        type: 'external_action',
        seq: 1,
        ts: new Date().toISOString(),
        run_id: 148,
        data: {
          provider: 'feishu',
          operation_id: 'op-feishu-accounts-url',
          session_id: 'session-feishu-accounts-url',
          phase: 'user_auth',
          url,
          expires_at: new Date(Date.now() + 60_000).toISOString()
        }
      })

      expect(store.messages[0]).toMatchObject({ url, action_status: 'pending' })
    } finally {
      store.$dispose()
    }
  })

  it.each([
    [
      'wrong path',
      'https://accounts.feishu.cn/oauth/v1/device/other?flow_id=opaque-flow&user_code=SAFE-CODE'
    ],
    ['missing flow_id', 'https://accounts.feishu.cn/oauth/v1/device/verify?user_code=SAFE-CODE'],
    [
      'extra query key',
      'https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=opaque-flow&user_code=SAFE-CODE&next=unsafe'
    ],
    [
      'duplicate user_code',
      'https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=opaque-flow&user_code=A&user_code=B'
    ]
  ])('fails closed for an accounts external-action URL with %s', (_label, url) => {
    const store = useAgentChatStore()
    try {
      store.applyStreamEvent({
        type: 'external_action',
        seq: 1,
        ts: new Date().toISOString(),
        run_id: 148,
        data: {
          provider: 'feishu',
          operation_id: `op-unsafe-accounts-${_label}`,
          session_id: `session-unsafe-accounts-${_label}`,
          phase: 'user_auth',
          url,
          expires_at: new Date(Date.now() + 60_000).toISOString()
        }
      })

      expect(store.messages[0]).toMatchObject({ action_status: 'pending' })
      expect(store.messages[0]).not.toHaveProperty('url')
    } finally {
      store.$dispose()
    }
  })

  it.each([
    ['non-HTTPS scheme', 'http://open.feishu.cn/suite/passport/oauth/device?user_code=opaque'],
    ['untrusted host', 'https://evil.example/authorize?next=open.feishu.cn'],
    ['lookalike host', 'https://open.feishu.cn.evil.example/authorize'],
    ['embedded credentials', 'https://user@open.feishu.cn/authorize'],
    ['fragment', 'https://open.feishu.cn/authorize#opaque'],
    ['non-default port', 'https://open.feishu.cn:8443/authorize']
  ])('fails closed for a %s external-action URL', (_name, url) => {
    const store = useAgentChatStore()

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: `op-unsafe-${_name}`,
        session_id: `session-unsafe-${_name}`,
        phase: 'user_auth',
        url,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    })

    expect(store.messages[0]).toMatchObject({ action_status: 'pending' })
    expect(store.messages[0]).not.toHaveProperty('url')
    store.reset()
  })

  it.each(['external_resume_ready', 'ext_resume:lease-token'])(
    'settles a restored external action when %s has already released it',
    async (stateReason) => {
      vi.useFakeTimers()
      const now = new Date('2026-07-14T10:00:00Z')
      vi.setSystemTime(now)
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      const store = useAgentChatStore()
      const expiresAt = new Date(now.getTime() + 60_000).toISOString()
      vi.mocked(api.getSessionSnapshot).mockResolvedValue({
        session_id: 'sess-resume',
        agent_skill_id: 1,
        agent_run_ids: [148],
        last_active_at: '',
        status: 'running',
        run: {
          id: 148,
          session_id: 'sess-resume',
          status: 'running',
          state_reason: stateReason,
          created_at: '',
          updated_at: ''
        },
        messages: [
          {
            id: `external-action-${stateReason}`,
            type: 'external_action',
            run_id: 148,
            operation_id: 'op-queued',
            session_id: 'session-queued',
            phase: 'user_auth',
            expires_at: expiresAt,
            provider: 'feishu'
          }
        ]
      } as never)

      await store.loadSessionSnapshot('sess-resume', false)

      const action = store.messages.find((message) => message.type === 'external_action')
      expect(action).toMatchObject({ action_status: 'completed' })
      expect(action).not.toHaveProperty('url')
      expect(store.isWaitingForExternalAction).toBe(false)
      expect(store.currentRun).toMatchObject({
        id: 148,
        status: 'running',
        state_reason: stateReason
      })
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(api.getRun).not.toHaveBeenCalled()
      expect(api.postAgentAnswer).not.toHaveBeenCalled()
      expect(feishuAPI.resumeFeishuOperation).not.toHaveBeenCalled()
      store.reset()
    }
  )

  it.each(['external_resume_ready', 'ext_resume:lease-token'])(
    'settles a live external action without rendering final prose when reconcile reads %s',
    async (stateReason) => {
      vi.useFakeTimers()
      const now = new Date('2026-07-14T10:00:00Z')
      vi.setSystemTime(now)
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      const store = useAgentChatStore()
      store.currentRun = {
        id: 148,
        session_id: 'sess-resume',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as AgentRun
      vi.mocked(api.getRun).mockResolvedValueOnce({
        id: 148,
        session_id: 'sess-resume',
        status: 'running',
        state_reason: stateReason,
        // This is pre-resume content, not an answer to render while the
        // durable continuation is only queued.
        final_output: '等待续跑时不能显示为最终回答',
        created_at: '',
        updated_at: ''
      } as AgentRun)

      store.applyStreamEvent({
        type: 'external_action',
        seq: 1,
        ts: now.toISOString(),
        run_id: 148,
        data: {
          provider: 'feishu',
          operation_id: 'op-live-queued',
          session_id: 'session-live-queued',
          tool_call_id: 'tool-call-1',
          phase: 'user_auth',
          url: 'https://open.feishu.cn/authorize',
          expires_at: new Date(now.getTime() + 60_000).toISOString()
        }
      })
      expect(vi.getTimerCount()).toBe(1)

      await store.refreshRunStatus()

      const action = store.messages.find((message) => message.type === 'external_action')
      expect(action).toMatchObject({ action_status: 'completed' })
      expect(action).not.toHaveProperty('url')
      expect(store.isWaitingForExternalAction).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
      expect(store.messages.filter((message) => message.type === 'final_answer')).toHaveLength(0)
      expect(api.postAgentAnswer).not.toHaveBeenCalled()
      expect(feishuAPI.resumeFeishuOperation).not.toHaveBeenCalled()
      store.reset()
    }
  )

  it.each(['ext_resume', 'ext_resume:', 'ext_other:lease-token', 'external_resume_ready_later'])(
    'does not settle an external action for non-continuation state_reason %s',
    async (stateReason) => {
      vi.useFakeTimers()
      const now = new Date('2026-07-14T10:00:00Z')
      vi.setSystemTime(now)
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      const store = useAgentChatStore()
      store.currentRun = {
        id: 148,
        session_id: 'sess-resume',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as AgentRun
      vi.mocked(api.getRun).mockResolvedValueOnce({
        ...store.currentRun,
        state_reason: stateReason
      })
      store.applyStreamEvent({
        type: 'external_action',
        seq: 1,
        ts: now.toISOString(),
        run_id: 148,
        data: {
          provider: 'feishu',
          operation_id: 'op-non-continuation',
          session_id: 'session-non-continuation',
          tool_call_id: 'tool-call-1',
          phase: 'user_auth',
          url: 'https://open.feishu.cn/authorize',
          expires_at: new Date(now.getTime() + 60_000).toISOString()
        }
      })

      await store.refreshRunStatus()

      const action = store.messages.find((message) => message.type === 'external_action')
      expect(action).toMatchObject({
        action_status: 'pending',
        url: 'https://open.feishu.cn/authorize'
      })
      expect(store.isWaitingForExternalAction).toBe(true)
      expect(vi.getTimerCount()).toBe(1)
      store.reset()
    }
  )

  it('keeps a real waiting_for_user_choice external action pending on refresh', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as AgentRun
    vi.mocked(api.getRun).mockResolvedValueOnce({ ...store.currentRun })
    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-still-waiting',
        session_id: 'session-still-waiting',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        url: 'https://open.feishu.cn/authorize',
        expires_at: new Date(now.getTime() + 60_000).toISOString()
      }
    })

    await store.refreshRunStatus()

    expect(store.messages.find((message) => message.type === 'external_action')).toMatchObject({
      action_status: 'pending',
      url: 'https://open.feishu.cn/authorize'
    })
    expect(store.isWaitingForExternalAction).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    store.reset()
  })

  it('resumes a Feishu operation through its lifecycle API, never the normal answer path', async () => {
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as never
    store.messages = [
      {
        id: 'external-action-148',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-1',
        session_id: 'session-1',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        action_status: 'pending',
        timestamp: ''
      }
    ] as never
    vi.mocked(feishuAPI.resumeFeishuOperation).mockResolvedValue({
      operation_id: 'op-1',
      state: 'succeeded'
    })

    await store.resumeFeishuOperation('op-1')

    expect(feishuAPI.resumeFeishuOperation).toHaveBeenCalledWith('op-1', 'user_completed')
    expect(store.messages[0]).toMatchObject({
      type: 'external_action',
      action_status: 'completed',
      terminal_state: 'succeeded'
    })
    expect(store.currentRun).toMatchObject({
      id: 148,
      status: 'running',
      state_reason: 'external_resume_ready'
    })
    expect(store.isQueuedExternalContinuationActive).toBe(true)
    expect(api.postAgentAnswer).not.toHaveBeenCalled()
  })

  it.each(['failed', 'unknown', 'cancelled'] as const)(
    'terminalizes the exact Agent run when user_completed returns %s',
    async (state) => {
      const store = useAgentChatStore()
      store.currentRun = {
        id: 148,
        session_id: 'sess-resume',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      store.messages = [
        {
          id: 'external-action-148',
          type: 'external_action',
          run_id: 148,
          operation_id: 'op-terminal',
          session_id: 'session-terminal',
          phase: 'user_auth',
          expires_at: futureExpiry(),
          action_status: 'pending',
          timestamp: ''
        }
      ] as never
      vi.mocked(feishuAPI.resumeFeishuOperation).mockResolvedValue({
        operation_id: 'op-terminal',
        state
      })

      await store.resumeFeishuOperation('op-terminal')

      expect(store.messages[0]).toMatchObject({ action_status: 'terminal', terminal_state: state })
      expect(store.currentRun).toMatchObject({
        id: 148,
        status: 'cancelled',
        state_reason: 'aborted_tools'
      })
      expect(store.isWaitingForExternalAction).toBe(false)
    }
  )

  it('replaces the same card with a live resume action without a page refresh', async () => {
    const store = useAgentChatStore()
    try {
      const oldURL = 'https://open.feishu.cn/suite/passport/oauth/device?user_code=OLD'
      const newURL = 'https://open.feishu.cn/suite/passport/oauth/device?user_code=NEW'
      store.applyStreamEvent({
        type: 'external_action',
        seq: 1,
        ts: new Date().toISOString(),
        run_id: 148,
        data: {
          provider: 'feishu',
          operation_id: 'op-old',
          session_id: 'session-old',
          tool_call_id: 'tool-call-1',
          phase: 'user_auth',
          url: oldURL,
          expires_at: futureExpiry()
        }
      })
      vi.mocked(feishuAPI.resumeFeishuOperation).mockResolvedValueOnce({
        operation_id: 'op-old',
        state: 'waiting_user_auth',
        notice_code: 'authorization_expired',
        action: {
          operation_id: 'op-old',
          session_id: 'session-new',
          phase: 'user_auth',
          expires_at: futureExpiry(),
          url: newURL
        }
      } as never)

      await store.resumeFeishuOperation('op-old')

      const actions = store.messages.filter((message) => message.type === 'external_action')
      expect(actions).toHaveLength(1)
      expect(actions[0]).toMatchObject({
        operation_id: 'op-old',
        session_id: 'session-new',
        url: newURL,
        notice_code: 'authorization_expired',
        action_status: 'pending'
      })
      expect(actions[0]).not.toMatchObject({ session_id: 'session-old', url: oldURL })
    } finally {
      store.reset()
      store.$dispose()
    }
  })

  it('rejects a replacement bound to another operation without changing the live card', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const store = useAgentChatStore()
    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-old',
        session_id: 'session-old',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        url: 'https://open.feishu.cn/old-authorize',
        expires_at: new Date(now.getTime() + 60_000).toISOString()
      }
    })
    vi.mocked(feishuAPI.resumeFeishuOperation).mockResolvedValueOnce({
      operation_id: 'op-old',
      state: 'waiting_user_auth',
      action: {
        operation_id: 'op-successor',
        session_id: 'session-successor',
        phase: 'app_scope',
        expires_at: new Date(now.getTime() + 120_000).toISOString()
      }
    })

    await expect(store.resumeFeishuOperation('op-old')).rejects.toThrow('飞书授权步骤已更新')

    expect(store.messages.find((message) => message.type === 'external_action')).toMatchObject({
      operation_id: 'op-old',
      session_id: 'session-old',
      url: 'https://open.feishu.cn/old-authorize',
      action_status: 'pending'
    })
    store.reset()
  })

  it('updates a notice without replacing the current session, URL, or expiry', async () => {
    const store = useAgentChatStore()
    const expiresAt = futureExpiry()
    const url = 'https://open.feishu.cn/authorize?user_code=KEEP'
    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-notice',
        session_id: 'session-keep',
        phase: 'user_auth',
        expires_at: expiresAt,
        url
      }
    })
    vi.mocked(feishuAPI.resumeFeishuOperation).mockResolvedValueOnce({
      operation_id: 'op-notice',
      state: 'waiting_user_auth',
      notice_code: 'authorization_pending'
    })

    await store.resumeFeishuOperation('op-notice')

    expect(store.messages[0]).toMatchObject({
      session_id: 'session-keep',
      expires_at: expiresAt,
      url,
      notice_code: 'authorization_pending',
      action_status: 'pending'
    })
    store.reset()
  })

  it('clears an old notice when authorization advances to a new external step', async () => {
    const store = useAgentChatStore()
    store.messages = [
      {
        id: 'external-action-next-step',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-next-step',
        session_id: 'session-user-auth',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url: 'https://open.feishu.cn/authorize?step=user-auth',
        notice_code: 'authorization_processing',
        action_status: 'pending',
        timestamp: ''
      }
    ]
    vi.mocked(feishuAPI.resumeFeishuOperation).mockResolvedValueOnce({
      operation_id: 'op-next-step',
      state: 'waiting_confirmation',
      action: {
        operation_id: 'op-next-step',
        session_id: 'session-confirmation',
        phase: 'confirmation',
        expires_at: futureExpiry()
      }
    })

    await store.resumeFeishuOperation('op-next-step')

    expect(store.messages[0]).toMatchObject({
      operation_id: 'op-next-step',
      session_id: 'session-confirmation',
      phase: 'confirmation',
      action_status: 'pending'
    })
    expect(store.messages[0]).not.toHaveProperty('notice_code')
    expect(store.messages[0]).not.toHaveProperty('url')
    store.reset()
  })

  it('coalesces duplicate resume clicks into one lifecycle request', async () => {
    const store = useAgentChatStore()
    store.messages = [
      {
        id: 'external-action-duplicate',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-duplicate',
        session_id: 'session-duplicate',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url: 'https://open.feishu.cn/authorize?user_code=DUPLICATE',
        action_status: 'pending',
        timestamp: ''
      }
    ]
    let resolveRequest: ((result: FeishuOperationResult) => void) | undefined
    vi.mocked(feishuAPI.resumeFeishuOperation).mockImplementationOnce(
      () =>
        new Promise<FeishuOperationResult>((resolve) => {
          resolveRequest = resolve
        })
    )

    const first = store.resumeFeishuOperation('op-duplicate')
    const second = store.resumeFeishuOperation('op-duplicate')
    resolveRequest?.({
      operation_id: 'op-duplicate',
      state: 'waiting_user_auth',
      notice_code: 'authorization_processing'
    })

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(feishuAPI.resumeFeishuOperation).toHaveBeenCalledTimes(1)
    expect(store.messages[0]).toMatchObject({ notice_code: 'authorization_processing' })
    store.reset()
  })

  it('discards a late replacement after the navigation epoch changes', async () => {
    const store = useAgentChatStore()
    const oldURL = 'https://open.feishu.cn/authorize?user_code=OLD'
    store.messages = [
      {
        id: 'external-action-stale',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-stale',
        session_id: 'session-old',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url: oldURL,
        action_status: 'pending',
        timestamp: ''
      }
    ]
    let resolveRequest: ((result: FeishuOperationResult) => void) | undefined
    vi.mocked(feishuAPI.resumeFeishuOperation).mockImplementationOnce(
      () =>
        new Promise<FeishuOperationResult>((resolve) => {
          resolveRequest = resolve
        })
    )

    const request = store.resumeFeishuOperation('op-stale')
    store.beginSession('another-session')
    resolveRequest?.({
      operation_id: 'op-stale',
      state: 'waiting_user_auth',
      notice_code: 'authorization_expired',
      action: {
        operation_id: 'op-stale',
        session_id: 'session-new',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url: 'https://open.feishu.cn/authorize?user_code=NEW'
      }
    })
    await request

    expect(store.messages[0]).toMatchObject({ session_id: 'session-old', url: oldURL })
    expect(store.messages[0]).not.toHaveProperty('notice_code')
    store.reset()
  })

  it('does not let an old resume response overwrite a newer session for the same operation', async () => {
    const store = useAgentChatStore()
    store.messages = [
      {
        id: 'external-action-session-race',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-session-race',
        session_id: 'session-old',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url: 'https://open.feishu.cn/authorize?user_code=OLD',
        action_status: 'pending',
        timestamp: ''
      }
    ]
    let resolveRequest: ((result: FeishuOperationResult) => void) | undefined
    vi.mocked(feishuAPI.resumeFeishuOperation).mockImplementationOnce(
      () =>
        new Promise<FeishuOperationResult>((resolve) => {
          resolveRequest = resolve
        })
    )

    const request = store.resumeFeishuOperation('op-session-race')
    const currentURL = 'https://open.feishu.cn/authorize?user_code=CURRENT'
    store.messages = [
      {
        id: 'external-action-session-race',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-session-race',
        session_id: 'session-current',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url: currentURL,
        action_status: 'pending',
        timestamp: ''
      }
    ]
    resolveRequest?.({
      operation_id: 'op-session-race',
      state: 'waiting_user_auth',
      notice_code: 'authorization_expired',
      action: {
        operation_id: 'op-session-race',
        session_id: 'session-late',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url: 'https://open.feishu.cn/authorize?user_code=LATE'
      }
    })
    await request

    expect(store.messages[0]).toMatchObject({
      session_id: 'session-current',
      url: currentURL
    })
    expect(store.messages[0]).not.toHaveProperty('notice_code')
    store.reset()
  })

  it('keeps the live link when a resume transport request fails', async () => {
    const store = useAgentChatStore()
    const url = 'https://open.feishu.cn/authorize?user_code=RETRY'
    store.messages = [
      {
        id: 'external-action-retry',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-retry',
        session_id: 'session-retry',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url,
        notice_code: 'authorization_pending',
        action_status: 'pending',
        timestamp: ''
      }
    ]
    vi.mocked(feishuAPI.resumeFeishuOperation).mockRejectedValueOnce(new Error('503'))

    await expect(store.resumeFeishuOperation('op-retry')).rejects.toThrow('503')
    expect(store.messages[0]).toMatchObject({ url, notice_code: 'authorization_pending' })
    store.reset()
  })

  it('clears an old authorization notice after terminal success', async () => {
    const store = useAgentChatStore()
    store.messages = [
      {
        id: 'external-action-success',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-success',
        session_id: 'session-success',
        phase: 'user_auth',
        expires_at: futureExpiry(),
        url: 'https://open.feishu.cn/authorize?user_code=SUCCESS',
        notice_code: 'authorization_processing',
        action_status: 'pending',
        timestamp: ''
      }
    ]
    vi.mocked(feishuAPI.resumeFeishuOperation).mockResolvedValueOnce({
      operation_id: 'op-success',
      state: 'succeeded'
    })

    await store.resumeFeishuOperation('op-success')

    expect(store.messages[0]).toMatchObject({
      action_status: 'completed',
      terminal_state: 'succeeded'
    })
    expect(store.messages[0]).not.toHaveProperty('notice_code')
    expect(store.messages[0]).not.toHaveProperty('url')
    store.reset()
  })

  it('rebinds an external-action poll after the page returns to visible and stops at terminal', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    const addEventListener = vi.spyOn(document, 'addEventListener')
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as AgentRun
    vi.mocked(api.getRun).mockResolvedValue({
      ...store.currentRun,
      status: 'completed',
      state_reason: 'completed'
    })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-1',
        session_id: 'session-1',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        expires_at: new Date(now.getTime() + 60_000).toISOString()
      }
    })
    expect(vi.getTimerCount()).toBe(1)
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'visibilitychange')
    ).toHaveLength(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getRun).not.toHaveBeenCalled()

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(1)
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'visibilitychange')
    ).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(api.getRun).toHaveBeenCalledTimes(1)
    expect(store.messages[0]).toMatchObject({
      type: 'external_action',
      action_status: 'completed'
    })
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getRun).toHaveBeenCalledTimes(1)
    store.reset()
    addEventListener.mockRestore()
  })

  it('terminal success synchronously settles its external action before a delayed failed reconcile', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as AgentRun

    let rejectReconcile: (reason?: unknown) => void = () => undefined
    vi.mocked(api.getRun).mockImplementationOnce(
      () =>
        new Promise<AgentRun>((_resolve, reject) => {
          rejectReconcile = reject
        })
    )

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-terminal-success',
        session_id: 'session-terminal-success',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        url: 'https://open.feishu.cn/authorize',
        expires_at: new Date(now.getTime() + 60_000).toISOString()
      }
    })
    expect(vi.getTimerCount()).toBe(1)

    store.applyStreamEvent({
      type: 'terminal',
      seq: 2,
      ts: now.toISOString(),
      run_id: 148,
      data: { reason: 'completed', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)

    const action = store.messages.find((message) => message.type === 'external_action')
    expect(action).toMatchObject({
      operation_id: 'op-terminal-success',
      action_status: 'completed'
    })
    expect(action).not.toHaveProperty('url')
    expect(store.isWaitingForExternalAction).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(api.getRun).toHaveBeenCalledTimes(1)

    // A visibility change after the terminal must not re-arm external polling.
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getRun).toHaveBeenCalledTimes(1)

    // Reconciliation is best-effort and may fail after the synchronous card
    // cleanup. It must never re-expose the original authorization action.
    rejectReconcile(new Error('delayed reconciliation failure'))
    await vi.advanceTimersByTimeAsync(0)
    const actionAfterReconcileFailure = store.messages.find(
      (message) => message.type === 'external_action'
    )
    expect(actionAfterReconcileFailure).toMatchObject({ action_status: 'completed' })
    expect(actionAfterReconcileFailure).not.toHaveProperty('url')
    removeListener.mockRestore()
    store.reset()
  })

  it.each(['error', 'cancelled', 'unknown'])(
    'terminal reason %s settles its same-run external action as terminal',
    (reason) => {
      vi.useFakeTimers()
      const now = new Date('2026-07-14T10:00:00Z')
      vi.setSystemTime(now)
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      const store = useAgentChatStore()
      vi.mocked(api.getRun).mockImplementationOnce(() => new Promise<AgentRun>(() => undefined))

      store.applyStreamEvent({
        type: 'external_action',
        seq: 1,
        ts: now.toISOString(),
        run_id: 148,
        data: {
          provider: 'feishu',
          operation_id: `op-${reason}`,
          session_id: `session-${reason}`,
          tool_call_id: 'tool-call-1',
          phase: 'user_auth',
          url: 'https://open.feishu.cn/authorize',
          expires_at: new Date(now.getTime() + 60_000).toISOString()
        }
      })
      store.applyStreamEvent({
        type: 'terminal',
        seq: 2,
        ts: now.toISOString(),
        run_id: 148,
        data: { reason, duration_ms: 1, step_count: 1 }
      } as TerminalEvent)

      const action = store.messages.find((message) => message.type === 'external_action')
      expect(action).toMatchObject({ action_status: 'terminal' })
      expect(action).not.toHaveProperty('url')
      expect(store.isWaitingForExternalAction).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
      store.reset()
    }
  )

  it('keeps a normal question pause pending instead of treating it as an external terminal', () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'running' } as AgentRun
    store.applyStreamEvent({
      type: 'question_prompt',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: {
        questions: [{ question: '请选择下一步', options: [], multi_select: false }]
      }
    })

    store.applyStreamEvent({
      type: 'terminal',
      seq: 2,
      ts: new Date().toISOString(),
      run_id: 148,
      data: { reason: 'waiting_for_user_choice', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)

    expect(store.currentRun?.status).toBe('running')
    expect(store.isWaitingForUser).toBe(true)
    expect(store.messages.find((message) => message.type === 'question_prompt')).toMatchObject({
      answer_status: 'pending'
    })
  })

  it('does not settle an external action belonging to another run', () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const store = useAgentChatStore()
    vi.mocked(api.getRun).mockImplementationOnce(() => new Promise<AgentRun>(() => undefined))

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-other-run',
        session_id: 'session-other-run',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        url: 'https://open.feishu.cn/authorize',
        expires_at: new Date(now.getTime() + 60_000).toISOString()
      }
    })
    store.applyStreamEvent({
      type: 'terminal',
      seq: 2,
      ts: now.toISOString(),
      run_id: 149,
      data: { reason: 'completed', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)

    const action = store.messages.find((message) => message.type === 'external_action')
    expect(action).toMatchObject({
      action_status: 'pending',
      url: 'https://open.feishu.cn/authorize'
    })
    expect(store.isWaitingForExternalAction).toBe(true)
    store.reset()
  })

  it('keeps polling an action until its server expiry, even after the old five-minute window', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as AgentRun
    vi.mocked(api.getRun).mockResolvedValue({ ...store.currentRun })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: new Date(now.getTime() - 6 * 60_000).toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-1',
        session_id: 'session-1',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        // The action was emitted six minutes after the run started, but its
        // server-owned authorization lease remains valid for another 12 minutes.
        // A fixed five-minute client window must not preempt this lease.
        expires_at: new Date(now.getTime() + 12 * 60_000).toISOString()
      }
    })
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    const callsAtOldDeadline = vi.mocked(api.getRun).mock.calls.length
    await vi.advanceTimersByTimeAsync(5_000)

    expect(callsAtOldDeadline).toBeGreaterThan(0)
    expect(api.getRun).toHaveBeenCalledTimes(callsAtOldDeadline + 1)

    vi.mocked(api.getRun).mockResolvedValueOnce({
      ...store.currentRun,
      status: 'completed',
      state_reason: 'completed'
    })
    await vi.advanceTimersByTimeAsync(5_000)

    expect(store.messages[0]).toMatchObject({
      type: 'external_action',
      action_status: 'completed'
    })
    const callsAfterTerminal = vi.mocked(api.getRun).mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getRun).toHaveBeenCalledTimes(callsAfterTerminal)
    store.reset()
  })

  it('fails closed when the browser considers an action expired: it clears the URL and never resumes', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as AgentRun

    // A browser clock that is ahead of the server is safer treated as expired:
    // do not leave an old URL actionable while waiting for a fresh server action.
    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: new Date(now.getTime() - 6 * 60_000).toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-expired',
        session_id: 'session-expired',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        url: 'https://open.feishu.cn/expired-authorize',
        expires_at: new Date(now.getTime() - 1_000).toISOString()
      }
    })

    expect(store.messages[0]).toMatchObject({
      type: 'external_action',
      action_status: 'expired'
    })
    expect(store.messages[0]).not.toHaveProperty('url')
    expect(store.isWaitingForExternalAction).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getRun).not.toHaveBeenCalled()

    await expect(store.resumeFeishuOperation('op-expired')).rejects.toThrow('飞书授权已过期')
    expect(feishuAPI.resumeFeishuOperation).not.toHaveBeenCalled()
    store.reset()
  })

  it('fails closed when a malformed expiry replaces a live action', () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const store = useAgentChatStore()

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-malformed-expiry',
        session_id: 'session-1',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        url: 'https://open.feishu.cn/live-authorize',
        expires_at: new Date(now.getTime() + 60_000).toISOString()
      }
    })
    store.applyStreamEvent({
      type: 'external_action',
      seq: 2,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-malformed-expiry',
        session_id: 'session-2',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        expires_at: 'not-a-timestamp'
      }
    })

    expect(store.messages[0]).toMatchObject({
      type: 'external_action',
      action_status: 'expired'
    })
    expect(store.messages[0]).not.toHaveProperty('url')
    store.reset()
  })

  it('cleans its external-action timer when Pinia disposes the store', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-14T10:00:00Z')
    vi.setSystemTime(now)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as AgentRun
    vi.mocked(api.getRun).mockResolvedValue({ ...store.currentRun })

    store.applyStreamEvent({
      type: 'external_action',
      seq: 1,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-dispose',
        session_id: 'session-dispose',
        tool_call_id: 'tool-call-1',
        phase: 'user_auth',
        expires_at: new Date(now.getTime() + 60_000).toISOString()
      }
    })

    store.$dispose()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getRun).not.toHaveBeenCalled()
  })

  it('does NOT push the stale pre-question prose as a final_answer while resuming', async () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'running' } as AgentRun
    vi.mocked(api.getRun).mockResolvedValueOnce(RESUMING_RUN)

    await store.refreshRunStatus()

    const finals = store.messages.filter((m) => m.type === 'final_answer')
    expect(finals).toHaveLength(0)
  })

  it('keeps treating the run as active so polling continues', async () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'running' } as AgentRun
    vi.mocked(api.getRun).mockResolvedValueOnce(RESUMING_RUN)

    await store.refreshRunStatus()

    expect(store.currentRun?.status).toBe('running')
  })

  it('the terminal-event reconcile path also refuses the stale prose for a resuming run', async () => {
    const store = useAgentChatStore()
    vi.mocked(api.getRun).mockResolvedValue(RESUMING_RUN)

    // reconcileFromDB is internal; the SSE terminal event is its public trigger.
    store.applyStreamEvent({
      type: 'terminal',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: { reason: 'completed', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)
    await new Promise((r) => setTimeout(r, 0))

    const finals = store.messages.filter((m) => m.type === 'final_answer')
    expect(finals).toHaveLength(0)
  })

  it('keeps an authorization-pause bubble provisional and shows the real result without reload', async () => {
    const store = useAgentChatStore()
    const waitingRun = {
      id: 239,
      session_id: 'sess-feishu-live-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      final_output: '授权前的阶段性说明，不能成为最终回复。',
      created_at: '',
      updated_at: ''
    } as unknown as AgentRun
    const completedRun = {
      ...waitingRun,
      status: 'completed',
      state_reason: 'completed',
      final_output: '飞书多维表格已创建并复读成功。'
    } as unknown as AgentRun

    store.currentRun = waitingRun
    store.applyStreamEvent({
      type: 'token_delta',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 239,
      data: {
        message_id: 'pre-auth-assistant-239',
        text: '授权前的阶段性说明，不能成为最终回复。'
      }
    })
    vi.mocked(api.getRun).mockResolvedValueOnce(waitingRun)

    // The real SSE connection closes with a waiting terminal while the user
    // leaves the page to authorize. DB reconciliation must keep the existing
    // streaming bubble provisional instead of labelling it as the final answer.
    store.applyStreamEvent({
      type: 'terminal',
      seq: 2,
      ts: new Date().toISOString(),
      run_id: 239,
      data: { reason: 'waiting_for_user_choice', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)
    await vi.waitFor(() => expect(api.getRun).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => {
      expect(store.messages.filter((message) => message.type === 'final_answer')).toHaveLength(0)
    })

    // After authorization the detached continuation is observed only through
    // status polling. Its authoritative final_output must replace/finalize the
    // provisional bubble without relying on a browser refresh or snapshot.
    vi.mocked(api.getRun).mockResolvedValueOnce(completedRun)
    await store.refreshRunStatus()

    const finals = store.messages.filter((message) => message.type === 'final_answer')
    expect(finals).toHaveLength(1)
    expect(finals[0]).toMatchObject({
      run_id: 239,
      markdown: '飞书多维表格已创建并复读成功。'
    })
  })

  it('a pending-status run is also kept active through a resume signature', async () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'pending' } as AgentRun
    vi.mocked(api.getRun).mockResolvedValueOnce(RESUMING_RUN)

    await store.refreshRunStatus()

    expect(store.messages.filter((m) => m.type === 'final_answer')).toHaveLength(0)
    expect(store.currentRun?.status).toBe('running')
  })

  it('injects the follow-up question card from the snapshot when a resumed run yields again (F4)', async () => {
    const store = useAgentChatStore()
    store.currentRun = { id: 148, status: 'running' } as AgentRun
    const WAITING_RUN = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as unknown as AgentRun
    vi.mocked(api.getRun).mockResolvedValue(WAITING_RUN)
    vi.mocked(api.getSessionSnapshot).mockResolvedValue({
      session_id: 'sess-resume',
      agent_skill_id: 1,
      agent_run_ids: [148],
      last_active_at: '',
      status: 'running',
      messages: [
        {
          id: 'q-148',
          type: 'question_prompt',
          run_id: 148,
          questions: [{ question: '第二轮追问？', options: [], multi_select: false }],
          answer_status: 'pending',
          timestamp: ''
        }
      ]
    } as never)

    await store.refreshRunStatus()
    const cards = store.messages.filter((m) => m.type === 'question_prompt')
    expect(cards).toHaveLength(1)
    expect((cards[0] as { questions?: { question: string }[] }).questions?.[0]?.question).toBe(
      '第二轮追问？'
    )

    // Idempotent: a second poll with the pending card present must not duplicate.
    await store.refreshRunStatus()
    expect(store.messages.filter((m) => m.type === 'question_prompt')).toHaveLength(1)
  })

  it('injects a second Feishu action from the waiting snapshot without reload', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-20T02:00:00Z')
    vi.setSystemTime(now)
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as never
    store.messages = [
      {
        id: 'tool-group-148',
        type: 'tool_group',
        tool_calls: [
          {
            tool_call_id: 'tool-call-base-create',
            tool_name: 'lark_execute',
            events: [],
            current_state: 'use'
          }
        ],
        timestamp: now.toISOString()
      },
      {
        id: 'external-action-148',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-base-create',
        session_id: 'session-base-create',
        phase: 'user_auth',
        expires_at: new Date(now.getTime() + 60_000).toISOString(),
        action_status: 'completed',
        timestamp: now.toISOString()
      }
    ] as never
    const waitingRun = { ...store.currentRun } as AgentRun
    vi.mocked(api.getRun).mockResolvedValue(waitingRun)
    vi.mocked(api.getSessionSnapshot).mockResolvedValue({
      session_id: 'sess-resume',
      agent_skill_id: 1,
      agent_run_ids: [148],
      last_active_at: now.toISOString(),
      status: 'running',
      run: waitingRun,
      messages: [
        {
          // The backend snapshot synthesizer may reuse a run-derived id. A
          // different operation still needs a unique local Vue key.
          id: 'external-action-148',
          type: 'external_action',
          run_id: 148,
          provider: 'feishu',
          operation_id: 'op-base-read',
          session_id: 'session-base-read',
          phase: 'user_auth',
          expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
          timestamp: now.toISOString()
        }
      ]
    } as never)

    await store.refreshRunStatus()

    const actions = store.messages.filter((message) => message.type === 'external_action')
    expect(actions).toHaveLength(2)
    expect(actions[0]).toMatchObject({
      id: 'external-action-148',
      operation_id: 'op-base-create',
      session_id: 'session-base-create',
      action_status: 'completed'
    })
    expect(actions[1]).toMatchObject({
      operation_id: 'op-base-read',
      session_id: 'session-base-read',
      action_status: 'pending'
    })
    expect(actions[1]).not.toHaveProperty('url')
    expect(new Set(actions.map((message) => message.id)).size).toBe(2)
    expect(store.messages.find((message) => message.type === 'tool_group')).toMatchObject({
      tool_calls: [{ current_state: 'result' }]
    })

    await store.refreshRunStatus()
    expect(store.messages.filter((message) => message.type === 'external_action')).toHaveLength(2)
    expect(api.getSessionSnapshot).toHaveBeenCalledTimes(1)
    store.reset()
  })

  it('does not let a late URL-less snapshot downgrade a live action for the same operation', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-20T02:10:00Z')
    vi.setSystemTime(now)
    const store = useAgentChatStore()
    const waitingRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as unknown as AgentRun
    store.currentRun = waitingRun
    vi.mocked(api.getRun).mockResolvedValue(waitingRun)

    let resolveSnapshot!: (value: never) => void
    let markSnapshotRequested!: () => void
    const snapshotRequested = new Promise<void>((resolve) => {
      markSnapshotRequested = resolve
    })
    vi.mocked(api.getSessionSnapshot).mockImplementationOnce(() => {
      markSnapshotRequested()
      return new Promise((resolve) => {
        resolveSnapshot = resolve
      })
    })

    const refreshing = store.refreshRunStatus()
    await snapshotRequested
    store.applyStreamEvent({
      type: 'external_action',
      seq: 2,
      ts: now.toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-base-read',
        session_id: 'session-base-read',
        phase: 'user_auth',
        expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
        url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=LIVE-READ'
      }
    })
    resolveSnapshot({
      session_id: 'sess-resume',
      agent_skill_id: 1,
      agent_run_ids: [148],
      last_active_at: now.toISOString(),
      status: 'running',
      run: waitingRun,
      messages: [
        {
          id: 'external-action-snapshot-148',
          type: 'external_action',
          run_id: 148,
          provider: 'feishu',
          operation_id: 'op-base-read',
          session_id: 'session-base-read',
          phase: 'user_auth',
          expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
          timestamp: now.toISOString()
        }
      ]
    } as never)
    await refreshing

    const actions = store.messages.filter((message) => message.type === 'external_action')
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      operation_id: 'op-base-read',
      session_id: 'session-base-read',
      url: 'https://open.feishu.cn/suite/passport/oauth/device?user_code=LIVE-READ'
    })
    store.reset()
  })

  it('replaces an expired card in place when the same operation advances to a new snapshot session', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-20T02:20:00Z')
    vi.setSystemTime(now)
    const store = useAgentChatStore()
    const waitingRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as unknown as AgentRun
    store.currentRun = waitingRun
    store.messages = [
      {
        id: 'external-action-base-read',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-base-read',
        session_id: 'session-base-read-old',
        phase: 'user_auth',
        expires_at: new Date(now.getTime() - 60_000).toISOString(),
        action_status: 'expired',
        timestamp: now.toISOString()
      }
    ] as never
    vi.mocked(api.getRun).mockResolvedValue(waitingRun)

    let resolveSnapshot!: (value: never) => void
    let markSnapshotRequested!: () => void
    const snapshotRequested = new Promise<void>((resolve) => {
      markSnapshotRequested = resolve
    })
    vi.mocked(api.getSessionSnapshot).mockImplementationOnce(() => {
      markSnapshotRequested()
      return new Promise((resolve) => {
        resolveSnapshot = resolve
      })
    })

    const refreshing = store.refreshRunStatus()
    await snapshotRequested
    const originalID = store.messages.find((message) => message.type === 'external_action')?.id
    resolveSnapshot({
      session_id: 'sess-resume',
      agent_skill_id: 1,
      agent_run_ids: [148],
      last_active_at: now.toISOString(),
      status: 'running',
      run: waitingRun,
      messages: [
        {
          id: 'external-action-snapshot-148',
          type: 'external_action',
          run_id: 148,
          provider: 'feishu',
          operation_id: 'op-base-read',
          session_id: 'session-base-read-new',
          phase: 'user_auth',
          expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
          timestamp: now.toISOString()
        }
      ]
    } as never)
    await refreshing

    const actions = store.messages.filter((message) => message.type === 'external_action')
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      id: originalID,
      operation_id: 'op-base-read',
      session_id: 'session-base-read-new',
      action_status: 'pending'
    })
    expect(actions[0]).not.toHaveProperty('url')
    store.reset()
  })

  it('does not let an older in-flight snapshot roll back a newly refreshed session and URL', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-20T02:25:00Z')
    vi.setSystemTime(now)
    const store = useAgentChatStore()
    const waitingRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as unknown as AgentRun
    store.currentRun = waitingRun
    store.messages = [
      {
        id: 'external-action-base-read',
        type: 'external_action',
        run_id: 148,
        operation_id: 'op-base-read',
        session_id: 'session-base-read-old',
        phase: 'user_auth',
        expires_at: new Date(now.getTime() - 60_000).toISOString(),
        action_status: 'expired',
        timestamp: now.toISOString()
      }
    ] as never
    vi.mocked(api.getRun).mockResolvedValue(waitingRun)

    let resolveSnapshot!: (value: never) => void
    let markSnapshotRequested!: () => void
    const snapshotRequested = new Promise<void>((resolve) => {
      markSnapshotRequested = resolve
    })
    vi.mocked(api.getSessionSnapshot).mockImplementationOnce(() => {
      markSnapshotRequested()
      return new Promise((resolve) => {
        resolveSnapshot = resolve
      })
    })

    const refreshing = store.refreshRunStatus()
    await snapshotRequested
    const freshURL =
      'https://open.feishu.cn/suite/passport/oauth/device?user_code=NEW-REFRESHED-READ'
    store.applyStreamEvent({
      type: 'external_action',
      seq: 3,
      ts: new Date(now.getTime() + 1_000).toISOString(),
      run_id: 148,
      data: {
        provider: 'feishu',
        operation_id: 'op-base-read',
        session_id: 'session-base-read-refreshed',
        phase: 'user_auth',
        expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
        url: freshURL
      }
    })
    resolveSnapshot({
      session_id: 'sess-resume',
      agent_skill_id: 1,
      agent_run_ids: [148],
      last_active_at: now.toISOString(),
      status: 'running',
      run: waitingRun,
      messages: [
        {
          id: 'external-action-stale-snapshot-148',
          type: 'external_action',
          run_id: 148,
          provider: 'feishu',
          operation_id: 'op-base-read',
          session_id: 'session-base-read-old',
          phase: 'user_auth',
          expires_at: new Date(now.getTime() + 5 * 60_000).toISOString(),
          timestamp: now.toISOString()
        }
      ]
    } as never)
    await refreshing

    const actions = store.messages.filter((message) => message.type === 'external_action')
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      id: 'external-action-base-read',
      operation_id: 'op-base-read',
      session_id: 'session-base-read-refreshed',
      url: freshURL,
      action_status: 'pending'
    })
    store.reset()
  })

  it('uses the latest overlapping snapshot request when responses arrive out of order', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-20T02:27:00Z')
    vi.setSystemTime(now)
    const store = useAgentChatStore()
    const waitingRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as unknown as AgentRun
    store.currentRun = waitingRun
    vi.mocked(api.getRun).mockResolvedValue(waitingRun)

    let resolveOlderSnapshot!: (value: never) => void
    let resolveLatestSnapshot!: (value: never) => void
    let markOlderRequested!: () => void
    let markLatestRequested!: () => void
    const olderRequested = new Promise<void>((resolve) => {
      markOlderRequested = resolve
    })
    const latestRequested = new Promise<void>((resolve) => {
      markLatestRequested = resolve
    })
    vi.mocked(api.getSessionSnapshot)
      .mockImplementationOnce(() => {
        markOlderRequested()
        return new Promise((resolve) => {
          resolveOlderSnapshot = resolve
        })
      })
      .mockImplementationOnce(() => {
        markLatestRequested()
        return new Promise((resolve) => {
          resolveLatestSnapshot = resolve
        })
      })

    const olderRefresh = store.refreshRunStatus()
    await olderRequested
    const latestRefresh = store.refreshRunStatus()
    await latestRequested

    const snapshot = (sessionID: string) =>
      ({
        session_id: 'sess-resume',
        agent_skill_id: 1,
        agent_run_ids: [148],
        last_active_at: now.toISOString(),
        status: 'running',
        run: waitingRun,
        messages: [
          {
            id: `external-action-${sessionID}`,
            type: 'external_action',
            run_id: 148,
            provider: 'feishu',
            operation_id: 'op-base-read',
            session_id: sessionID,
            phase: 'user_auth',
            expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
            timestamp: now.toISOString()
          }
        ]
      }) as never

    resolveOlderSnapshot(snapshot('session-base-read-old'))
    await olderRefresh
    expect(store.messages.filter((message) => message.type === 'external_action')).toHaveLength(0)

    resolveLatestSnapshot(snapshot('session-base-read-new'))
    await latestRefresh
    expect(store.messages.filter((message) => message.type === 'external_action')).toEqual([
      expect.objectContaining({
        operation_id: 'op-base-read',
        session_id: 'session-base-read-new',
        action_status: 'pending'
      })
    ])
    store.reset()
  })

  it('drops a late sequential-action snapshot after the route session is reset', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-07-20T02:30:00Z')
    vi.setSystemTime(now)
    const store = useAgentChatStore()
    const waitingRun = {
      id: 148,
      session_id: 'sess-resume',
      status: 'running',
      state_reason: 'waiting_for_user_choice',
      created_at: '',
      updated_at: ''
    } as unknown as AgentRun
    store.currentRun = waitingRun
    vi.mocked(api.getRun).mockResolvedValue(waitingRun)

    let resolveSnapshot!: (value: never) => void
    let markSnapshotRequested!: () => void
    const snapshotRequested = new Promise<void>((resolve) => {
      markSnapshotRequested = resolve
    })
    vi.mocked(api.getSessionSnapshot).mockImplementationOnce(() => {
      markSnapshotRequested()
      return new Promise((resolve) => {
        resolveSnapshot = resolve
      })
    })

    const refreshing = store.refreshRunStatus()
    await snapshotRequested
    store.reset()
    resolveSnapshot({
      session_id: 'sess-resume',
      agent_skill_id: 1,
      agent_run_ids: [148],
      last_active_at: now.toISOString(),
      status: 'running',
      run: waitingRun,
      messages: [
        {
          id: 'external-action-snapshot-148',
          type: 'external_action',
          run_id: 148,
          provider: 'feishu',
          operation_id: 'op-base-read',
          session_id: 'session-base-read',
          phase: 'user_auth',
          expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
          timestamp: now.toISOString()
        }
      ]
    } as never)
    await refreshing

    expect(store.messages.filter((message) => message.type === 'external_action')).toHaveLength(0)
    expect(store.currentRun).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  // issue3 (stuck spinner after task done): once a run is terminal, NO live
  // indicator may keep spinning — isRunning false AND isWaitingForUser false,
  // even if the run carries a stale 'waiting_for_user_choice' state_reason (which
  // the poll-based resume path could leave behind when it never refreshed cleanly
  // to the final terminal). The streaming-resume terminal event (T5) drives the
  // clean clear at runtime; this guards the invariant defensively. EXPECTED TO
  // FAIL before the isWaitingForUser terminal-status guard.
  it('issue3: a terminal run is never waiting/running even with a stale waiting state_reason', () => {
    const store = useAgentChatStore()
    store.currentRun = {
      id: 148,
      status: 'terminated',
      state_reason: 'waiting_for_user_choice'
    } as unknown as AgentRun
    expect(store.isRunning).toBe(false)
    expect(store.isWaitingForUser).toBe(false)
  })

  // issue3: a real (non-pause) terminal event clears the stuck-silence marker so
  // the run-pulse word/timer doesn't keep "working" after the task is done.
  it('issue3: a completed terminal event clears the stuck-silence marker', () => {
    const store = useAgentChatStore()
    vi.mocked(api.getRun).mockResolvedValue({
      id: 148,
      status: 'completed',
      state_reason: 'completed'
    } as unknown as AgentRun)
    store.currentRun = {
      id: 148,
      status: 'running',
      state_reason: 'running'
    } as unknown as AgentRun
    store.stuckSince = 12345
    store.applyStreamEvent({
      type: 'terminal',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: { reason: 'completed', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)
    expect(store.stuckSince).toBeNull()
  })

  // ...but a waiting-pause terminal must NOT clear it (the run is paused, not
  // done — pollNarration owns stuckSince during the wait).
  it('issue3: a waiting-pause terminal does NOT clear the stuck marker', () => {
    const store = useAgentChatStore()
    vi.mocked(api.getRun).mockResolvedValue({
      id: 148,
      status: 'running',
      state_reason: 'waiting_for_user_choice'
    } as unknown as AgentRun)
    store.currentRun = {
      id: 148,
      status: 'running',
      state_reason: 'running'
    } as unknown as AgentRun
    store.stuckSince = 12345
    store.applyStreamEvent({
      type: 'terminal',
      seq: 1,
      ts: new Date().toISOString(),
      run_id: 148,
      data: { reason: 'waiting_for_user_choice', duration_ms: 1, step_count: 1 }
    } as TerminalEvent)
    expect(store.stuckSince).toBe(12345)
  })
})
