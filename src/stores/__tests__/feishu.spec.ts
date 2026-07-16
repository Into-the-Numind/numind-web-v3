import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFeishuStore } from '../feishu'

vi.mock('@/api/feishu', () => ({
  connectFeishu: vi.fn(),
  getFeishuStatus: vi.fn(),
  refreshFeishuAction: vi.fn(),
  unbindFeishuConnection: vi.fn()
}))

import * as api from '@/api/feishu'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('feishu workspace store', () => {
  it('never treats an unknown capability as available', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue({
      state: 'connected',
      connected: true,
      app_id_masked: 'cli_****8f2a',
      cli_version: '1.0.68',
      capabilities: {
        docs: { state: 'unknown' },
        base: { state: 'available' },
        wiki: { state: 'needs_user_scope' }
      }
    })

    const store = useFeishuStore()
    await store.fetchStatus()

    expect(store.capabilities.docs.state).toBe('unknown')
    expect(store.availableCapabilities).toEqual(['base'])
    expect(store.hasAvailableCapability('docs')).toBe(false)
  })

  it('keeps a live authorization URL only in the in-memory active action', async () => {
    vi.mocked(api.connectFeishu).mockResolvedValue({
      state: 'waiting_user_auth',
      action: {
        operation_id: 'op-1',
        session_id: 'session-1',
        phase: 'user_auth',
        url: 'https://safe.example/authorize',
        expires_at: '2026-07-15T00:00:00Z'
      }
    })

    const store = useFeishuStore()
    await store.connect()

    expect(store.activeAction?.url).toBe('https://safe.example/authorize')
    expect(JSON.stringify(store.$state)).not.toContain('https://safe.example/authorize')
  })

  it('returns a refreshed action without mutating shared connection state', async () => {
    vi.mocked(api.refreshFeishuAction).mockResolvedValue({
      action: {
        operation_id: 'op-1',
        session_id: 'session-2',
        phase: 'user_auth',
        url: 'https://safe.example/refreshed',
        expires_at: '2026-07-15T01:00:00Z'
      }
    })
    vi.mocked(api.unbindFeishuConnection).mockResolvedValue({
      state: 'none',
      connected: false,
      message: '有数侧连接已删除'
    })

    const store = useFeishuStore()
    store.appIdMasked = 'cli_****8f2a'
    store.connected = true
    await store.refreshAction('session-1')

    expect(store.activeAction).toBeNull()

    await store.disconnect()

    expect(api.refreshFeishuAction).toHaveBeenCalledWith('session-1')
    expect(store.connected).toBe(false)
    expect(store.appIdMasked).toBe('')
    expect(store.activeAction).toBeNull()
  })

  it('does not cache a terminal refresh result as a live action', async () => {
    vi.mocked(api.refreshFeishuAction).mockResolvedValue({
      terminal: { operation_id: 'op-terminal', state: 'failed' }
    })
    const store = useFeishuStore()

    await expect(store.refreshAction('session-stale')).resolves.toEqual({
      terminal: { operation_id: 'op-terminal', state: 'failed' }
    })

    expect(store.activeAction).toBeNull()
  })
})
