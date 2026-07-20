import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFeishuStore } from '../feishu'

vi.mock('@/api/feishu', () => ({
  connectFeishu: vi.fn(),
  continueFeishuConnection: vi.fn(),
  getFeishuStatus: vi.fn(),
  refreshFeishuAction: vi.fn(),
  resumeFeishuOperation: vi.fn(),
  unbindFeishuConnection: vi.fn()
}))

import * as api from '@/api/feishu'

const unknownCapabilitiesFixture = () => ({
  docs: { state: 'unknown' as const },
  base: { state: 'unknown' as const },
  wiki: { state: 'unknown' as const }
})

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

  it('keeps the current live URL when an early completion is still processing', async () => {
    vi.mocked(api.connectFeishu).mockResolvedValue({
      state: 'waiting_user_auth',
      action: {
        session_id: 'session-1',
        phase: 'user_auth',
        url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=opaque',
        expires_at: '2026-07-15T00:00:00Z'
      }
    })
    vi.mocked(api.continueFeishuConnection).mockResolvedValue({ state: 'waiting_user_auth' })
    const store = useFeishuStore()

    await store.connect()
    await store.continueConnection('session-1')

    expect(store.activeAction?.url).toContain('open.feishu.cn')
    expect(api.continueFeishuConnection).toHaveBeenCalledWith('session-1')
  })

  it('keeps the create-app URL when completion is clicked before its worker finishes', async () => {
	vi.mocked(api.connectFeishu).mockResolvedValue({
	  state: 'creating_app',
	  action: {
		operation_id: '',
		session_id: 'create-session-1',
		phase: 'create_app',
		url: 'https://open.feishu.cn/page/cli/create?state=opaque',
		expires_at: '2026-07-15T00:00:00Z'
	  }
	})
	vi.mocked(api.continueFeishuConnection).mockResolvedValue({ state: 'creating_app' })
	const store = useFeishuStore()

	await store.connect()
	await store.continueConnection('create-session-1')

	expect(store.activeAction?.session_id).toBe('create-session-1')
	expect(store.activeAction?.url).toContain('/page/cli/')
  })

  it('settles an operation-bound explicit connection without starting a manual flow', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue({
      state: 'waiting_user_auth',
      connected: false,
      capabilities: unknownCapabilitiesFixture(),
      active_action: {
        operation_id: 'connection-op-1',
        session_id: 'connection-session-1',
        phase: 'user_auth',
        expires_at: '2026-07-15T00:00:00Z',
        link_available: false
      }
    })
    vi.mocked(api.resumeFeishuOperation).mockResolvedValue({
      operation_id: 'connection-op-1',
      state: 'succeeded'
    })
    const store = useFeishuStore()
    await store.fetchStatus()

    await store.resumeConnectionAction('connection-op-1', 'connection-session-1')

    expect(store.connected).toBe(true)
    expect(store.activeAction).toBeNull()
    expect(api.connectFeishu).not.toHaveBeenCalled()
  })

  it('clears an exact operation card after a stale bootstrap was cancelled', async () => {
	vi.mocked(api.getFeishuStatus).mockResolvedValue({
	  state: 'waiting_user_auth',
	  connected: false,
	  capabilities: unknownCapabilitiesFixture(),
	  active_action: {
		operation_id: 'stale-connection-op',
		session_id: 'stale-connection-session',
		phase: 'user_auth',
		expires_at: '2026-07-15T00:00:00Z',
		link_available: false
	  }
	})
	vi.mocked(api.resumeFeishuOperation).mockResolvedValue({
	  operation_id: 'stale-connection-op',
	  state: 'cancelled'
	})
	const store = useFeishuStore()
	await store.fetchStatus()

	await store.resumeConnectionAction('stale-connection-op', 'stale-connection-session')

	expect(store.activeAction).toBeNull()
	expect(store.state).toBe('error')
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
