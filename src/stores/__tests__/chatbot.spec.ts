/**
 * chatbot store 单元测试 (T6)
 *
 * 覆盖范围：
 *   1. renameSession — API 成功/失败时的 pessimistic UI 行为
 *   2. togglePin — pin / unpin + sortSessionsLocally 排序验证
 *   3. sortSessionsLocally — 全置顶 / 全非置顶 / 混合三种情形
 *   4. fetchSessions — chatbotId 参数透传至 API
 *
 * 对应 plan T6 验收条件 §3
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatbotStore } from '../chatbot'
import type { ChatbotSession } from '@/types/config'

// ==================== Mock @/api/chatbot ====================

vi.mock('@/api/chatbot', () => ({
  listVisibleChatbots: vi.fn(),
  createChatbotSession: vi.fn(),
  listChatbotSessions: vi.fn(),
  deleteChatbotSession: vi.fn(),
  listChatbotMessages: vi.fn(),
  sendChatbotMessageStream: vi.fn(),
  renameChatbotSession: vi.fn(),
  pinChatbotSession: vi.fn(),
  generateChatbotSessionTitle: vi.fn()
}))

import {
  listChatbotSessions,
  renameChatbotSession,
  pinChatbotSession,
  createChatbotSession,
  sendChatbotMessageStream,
  generateChatbotSessionTitle
} from '@/api/chatbot'

// ==================== Fixtures ====================

function makeSession(overrides: Partial<ChatbotSession> = {}): ChatbotSession {
  return {
    id: 1,
    user_id: 10,
    chatbot_id: 42,
    title: 'Test Session',
    status: 'active',
    message_count: 0,
    pinned_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

// ==================== Setup ====================

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

// ==================== renameSession ====================

describe('renameSession', () => {
  it('API 成功后本地 title 更新（pessimistic 验证）', async () => {
    vi.mocked(renameChatbotSession).mockResolvedValueOnce({
      data: makeSession({ title: 'New Title' })
    } as any)

    const store = useChatbotStore()
    store.sessions.push(makeSession({ id: 5, title: 'Old Title' }))

    const result = await store.renameSession(5, 'New Title')

    expect(result).toBe(true)
    expect(store.sessions.find((s) => s.id === 5)?.title).toBe('New Title')
    expect(renameChatbotSession).toHaveBeenCalledWith(5, 'New Title')
  })

  it('API 失败时本地 title 不更新（pessimistic）', async () => {
    vi.mocked(renameChatbotSession).mockRejectedValueOnce(new Error('network error'))

    const store = useChatbotStore()
    store.sessions.push(makeSession({ id: 5, title: 'Old Title' }))

    const result = await store.renameSession(5, 'New Title')

    expect(result).toBe(false)
    expect(store.sessions.find((s) => s.id === 5)?.title).toBe('Old Title')
  })
})

// ==================== togglePin ====================

describe('togglePin', () => {
  it('pin 后本地 pinned_at 写入 + 排序后置顶组在前', async () => {
    const pinnedAt = '2026-05-14T10:00:00Z'
    vi.mocked(pinChatbotSession).mockResolvedValueOnce({ data: { pinned_at: pinnedAt } } as any)

    const store = useChatbotStore()
    // Two sessions; session 5 will be pinned
    store.sessions.push(
      makeSession({ id: 5, title: 'To Pin', pinned_at: null, updated_at: '2026-01-02T00:00:00Z' }),
      makeSession({ id: 6, title: 'Normal', pinned_at: null, updated_at: '2026-01-01T00:00:00Z' })
    )

    const result = await store.togglePin(5, null)

    expect(result).toBe(true)
    expect(store.sessions.find((s) => s.id === 5)?.pinned_at).toBe(pinnedAt)
    expect(pinChatbotSession).toHaveBeenCalledWith(5, true)
    // After sort, pinned session should be first
    expect(store.sessions[0].id).toBe(5)
  })

  it('unpin 后本地 pinned_at 清空 + 排序后回到 updated_at 序列', async () => {
    vi.mocked(pinChatbotSession).mockResolvedValueOnce({ data: { pinned_at: null } } as any)

    const store = useChatbotStore()
    const pinnedAt = '2026-05-14T10:00:00Z'
    store.sessions.push(
      makeSession({
        id: 5,
        title: 'Pinned',
        pinned_at: pinnedAt,
        updated_at: '2026-01-01T00:00:00Z'
      }),
      makeSession({ id: 6, title: 'Normal', pinned_at: null, updated_at: '2026-01-02T00:00:00Z' })
    )

    const result = await store.togglePin(5, pinnedAt)

    expect(result).toBe(true)
    expect(store.sessions.find((s) => s.id === 5)?.pinned_at).toBeNull()
    expect(pinChatbotSession).toHaveBeenCalledWith(5, false)
    // After sort, session 6 (newer updated_at) should be first
    expect(store.sessions[0].id).toBe(6)
  })
})

// ==================== sortSessionsLocally ====================

describe('sortSessionsLocally (via togglePin)', () => {
  // We test sortSessionsLocally indirectly through the store by directly
  // manipulating sessions and calling togglePin with a successful mock.

  it('全置顶按 pinned_at DESC（最新置顶排前）', async () => {
    vi.mocked(pinChatbotSession).mockResolvedValueOnce({
      data: { pinned_at: '2026-05-14T12:00:00Z' }
    } as any)

    const store = useChatbotStore()
    // Both already pinned; we trigger togglePin on one to call sortSessionsLocally
    store.sessions.push(
      makeSession({ id: 1, pinned_at: '2026-05-10T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }),
      makeSession({ id: 2, pinned_at: '2026-05-12T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }),
      makeSession({ id: 3, pinned_at: null, updated_at: '2026-01-01T00:00:00Z' })
    )

    // Unpin id=3 (null → pin) to trigger sort; give it the latest pinned_at
    await store.togglePin(3, null)

    // All pinned; expect sorted by pinned_at DESC: 3 (2026-05-14) > 2 (2026-05-12) > 1 (2026-05-10)
    const ids = store.sessions.map((s) => s.id)
    expect(ids).toEqual([3, 2, 1])
  })

  it('全非置顶按 updated_at DESC', async () => {
    vi.mocked(pinChatbotSession).mockResolvedValueOnce({ data: { pinned_at: null } } as any)

    const store = useChatbotStore()
    store.sessions.push(
      makeSession({ id: 1, pinned_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }),
      makeSession({ id: 2, pinned_at: null, updated_at: '2026-01-03T00:00:00Z' }),
      makeSession({ id: 3, pinned_at: null, updated_at: '2026-01-02T00:00:00Z' })
    )

    // Unpin id=1 (pinned → null) to trigger sort
    await store.togglePin(1, '2026-01-01T00:00:00Z')

    // All unpinned; expect sorted by updated_at DESC: 2 > 3 > 1
    const ids = store.sessions.map((s) => s.id)
    expect(ids).toEqual([2, 3, 1])
  })

  it('混合 — 置顶组在前，各组内部正确排序', async () => {
    vi.mocked(pinChatbotSession).mockResolvedValueOnce({
      data: { pinned_at: '2026-05-14T08:00:00Z' }
    } as any)

    const store = useChatbotStore()
    store.sessions.push(
      makeSession({
        id: 10,
        pinned_at: '2026-05-13T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z'
      }),
      makeSession({ id: 20, pinned_at: null, updated_at: '2026-01-04T00:00:00Z' }),
      makeSession({ id: 30, pinned_at: null, updated_at: '2026-01-03T00:00:00Z' }),
      makeSession({ id: 40, pinned_at: null, updated_at: '2026-01-02T00:00:00Z' })
    )

    // Pin id=40 (null → pinned) with pinned_at=2026-05-14 (newer than id=10)
    await store.togglePin(40, null)

    // Expected: pinned group first (id=40 > id=10 by pinned_at), then unpinned by updated_at (id=20 > id=30)
    const ids = store.sessions.map((s) => s.id)
    expect(ids).toEqual([40, 10, 20, 30])
  })
})

// ==================== fetchSessions ====================

describe('fetchSessions', () => {
  it('携带 chatbot_id 参数调用 API', async () => {
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: [makeSession({ chatbot_id: 99 })], total: 1 }
    } as any)

    const store = useChatbotStore()
    await store.fetchSessions(99)

    expect(listChatbotSessions).toHaveBeenCalledWith(0, 20, 99)
    expect(store.sessions).toHaveLength(1)
    expect(store.sessionsTotal).toBe(1)
  })

  it('更新当前会话标题（首轮自动重命名后 refetch 同步, US1/US3）', async () => {
    const store = useChatbotStore()
    store.currentSession = makeSession({ id: 5, chatbot_id: 7, title: '客服助手' })
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: [makeSession({ id: 5, chatbot_id: 7, title: '退货流程咨询' })], total: 1 }
    } as any)

    await store.fetchSessions(7)
    expect(store.currentSession?.title).toBe('退货流程咨询')
  })
})

// ==================== loadMoreSessions (US5) ====================

describe('loadMoreSessions', () => {
  it('追加下一页并推进 offset（不替换已加载项）', async () => {
    const store = useChatbotStore()
    const page1 = [makeSession({ id: 1, chatbot_id: 7 }), makeSession({ id: 2, chatbot_id: 7 })]
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: page1, total: 4 }
    } as any)
    await store.fetchSessions(7)
    expect(store.sessionsOffset).toBe(2)

    const page2 = [makeSession({ id: 3, chatbot_id: 7 }), makeSession({ id: 4, chatbot_id: 7 })]
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: page2, total: 4 }
    } as any)
    await store.loadMoreSessions(7)

    expect(listChatbotSessions).toHaveBeenLastCalledWith(2, 20, 7)
    expect(store.sessions.map((s) => s.id)).toEqual([1, 2, 3, 4])
    expect(store.sessionsOffset).toBe(4)
  })

  it('全部加载完后再调用为 no-op', async () => {
    const store = useChatbotStore()
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: [makeSession({ id: 1, chatbot_id: 7 })], total: 1 }
    } as any)
    await store.fetchSessions(7)
    vi.mocked(listChatbotSessions).mockClear()

    await store.loadMoreSessions(7)
    expect(listChatbotSessions).not.toHaveBeenCalled()
  })

  it('inflight 守卫：连点时第二次调用被拦截（防重复页/重复 key）', async () => {
    const store = useChatbotStore()
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: [makeSession({ id: 1, chatbot_id: 7 })], total: 5 }
    } as any)
    await store.fetchSessions(7)
    vi.mocked(listChatbotSessions).mockClear()

    let resolveFn!: (v: unknown) => void
    vi.mocked(listChatbotSessions).mockImplementationOnce(
      () => new Promise((r) => (resolveFn = r)) as never
    )
    const p1 = store.loadMoreSessions(7) // inflight
    const p2 = store.loadMoreSessions(7) // must be guarded → no 2nd API call
    resolveFn({ data: { list: [makeSession({ id: 2, chatbot_id: 7 })], total: 5 } })
    await Promise.all([p1, p2])

    expect(listChatbotSessions).toHaveBeenCalledTimes(1)
    expect(store.sessions.map((s) => s.id)).toEqual([1, 2])
    expect(store.sessionsLoadingMore).toBe(false)
  })

  it('错误时不追加、不推进 offset', async () => {
    const store = useChatbotStore()
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: [makeSession({ id: 1, chatbot_id: 7 })], total: 5 }
    } as any)
    await store.fetchSessions(7)
    expect(store.sessionsOffset).toBe(1)

    vi.mocked(listChatbotSessions).mockRejectedValueOnce(new Error('network'))
    await store.loadMoreSessions(7)
    expect(store.sessions.map((s) => s.id)).toEqual([1]) // unchanged
    expect(store.sessionsOffset).toBe(1) // not advanced
    expect(store.sessionsLoadingMore).toBe(false)
  })
})

// ==================== fetchSessions title-sync edge cases ====================

describe('fetchSessions title sync edge cases', () => {
  it('当前会话不在返回列表时标题不变、不报错', async () => {
    const store = useChatbotStore()
    store.currentSession = makeSession({ id: 5, chatbot_id: 7, title: '原标题' })
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: [makeSession({ id: 99, chatbot_id: 7, title: '别的' })], total: 1 }
    } as any)
    await store.fetchSessions(7)
    expect(store.currentSession?.title).toBe('原标题')
  })

  it('currentSession 为 null 时 refetch 不报错', async () => {
    const store = useChatbotStore()
    store.currentSession = null
    vi.mocked(listChatbotSessions).mockResolvedValueOnce({
      data: { list: [makeSession({ id: 1, chatbot_id: 7 })], total: 1 }
    } as any)
    await expect(store.fetchSessions(7)).resolves.toBeUndefined()
    expect(store.currentSession).toBeNull()
  })
})

// ==================== instant-title-ux: draft + send-time title ====================

describe('instant-title-ux draft flow', () => {
  it('startDraft 不建会话也不加侧边栏项', () => {
    const store = useChatbotStore()
    store.startDraft(7)
    expect(store.isDraft).toBe(true)
    expect(store.currentSession).toBeNull()
    expect(store.currentChatbotId).toBe(7)
    expect(store.sessions).toHaveLength(0)
    expect(createChatbotSession).not.toHaveBeenCalled()
  })

  it('草稿态首发: 建会话 + 占位 pending + 从 prompt 秒生成标题 + 拿到更新', async () => {
    const store = useChatbotStore()
    store.startDraft(7)

    vi.mocked(createChatbotSession).mockResolvedValueOnce({
      data: makeSession({ id: 100, chatbot_id: 7, title: '客服助手' })
    } as any)
    vi.mocked(generateChatbotSessionTitle).mockResolvedValueOnce({ data: { title: '退货咨询' } } as any)
    vi.mocked(sendChatbotMessageStream).mockResolvedValueOnce(undefined as any)
    vi.mocked(listChatbotSessions).mockResolvedValue({
      data: { list: [makeSession({ id: 100, chatbot_id: 7, title: '退货咨询' })], total: 1 }
    } as any)

    await store.sendMessage('怎么退货')
    // title generation is fire-and-forget — flush microtasks/macrotasks.
    await new Promise((r) => setTimeout(r, 0))

    expect(createChatbotSession).toHaveBeenCalledWith(7)
    expect(generateChatbotSessionTitle).toHaveBeenCalledWith(100, '怎么退货')
    expect(store.isDraft).toBe(false)
    expect(store.sessions.find((s) => s.id === 100)?.title).toBe('退货咨询')
    expect(store.titlePendingIds.has(100)).toBe(false)
  })

  it('标题生成失败: 清除 pending, 不影响发送 (best-effort)', async () => {
    const store = useChatbotStore()
    store.startDraft(7)

    vi.mocked(createChatbotSession).mockResolvedValueOnce({
      data: makeSession({ id: 101, chatbot_id: 7, title: '客服助手' })
    } as any)
    vi.mocked(generateChatbotSessionTitle).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(sendChatbotMessageStream).mockResolvedValueOnce(undefined as any)
    vi.mocked(listChatbotSessions).mockResolvedValue({
      data: { list: [makeSession({ id: 101, chatbot_id: 7, title: '客服助手' })], total: 1 }
    } as any)

    await store.sendMessage('你好')
    await new Promise((r) => setTimeout(r, 0))

    expect(store.titlePendingIds.has(101)).toBe(false)
    expect(sendChatbotMessageStream).toHaveBeenCalled()
  })
})
