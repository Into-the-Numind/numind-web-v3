import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import request from './request'
import {
  connectFeishu,
  getFeishuStatus,
  refreshFeishuAction,
  resumeFeishuOperation,
  unbindFeishuConnection
} from './feishu'

vi.mock('./request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}))

const mockedRequest = request as unknown as {
  get: Mock
  post: Mock
  delete: Mock
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('personal Feishu workspace API', () => {
  it('starts a manual connection without command data or scopes', async () => {
    mockedRequest.post.mockResolvedValue({
      data: {
        state: 'waiting_user_auth',
        action: {
          operation_id: 'op-1',
          session_id: 'session-1',
          phase: 'user_auth',
          url: 'https://safe.example/authorize',
          expires_at: '2026-07-15T00:00:00Z'
        }
      }
    })

    await expect(connectFeishu()).resolves.toMatchObject({ state: 'waiting_user_auth' })
    expect(mockedRequest.post).toHaveBeenCalledWith('/v1/feishu/connect', { intent: 'manual' })
  })

  it('resumes an operation without sending argv or scopes', async () => {
    mockedRequest.post.mockResolvedValue({
      data: { operation_id: 'op-1', state: 'succeeded' }
    })

    await resumeFeishuOperation('op-1')

    expect(mockedRequest.post).toHaveBeenCalledWith('/v1/feishu/operations/op-1/resume', {
      action: 'user_completed'
    })
  })

  it('allows only the fixed lifecycle actions', async () => {
    mockedRequest.post.mockResolvedValue({
      data: { operation_id: 'op-1', state: 'cancelled' }
    })

    await resumeFeishuOperation('op-1', 'cancelled')
    expect(mockedRequest.post).toHaveBeenCalledWith('/v1/feishu/operations/op-1/resume', {
      action: 'cancelled'
    })
  })

  it.each(['authorization_pending', 'authorization_processing'] as const)(
    'accepts %s without replacing the current live action',
    async (noticeCode) => {
      mockedRequest.post.mockResolvedValue({
        data: {
          operation_id: 'op-1',
          state: 'waiting_user_auth',
          notice_code: noticeCode
        }
      })

      await expect(resumeFeishuOperation('op-1')).resolves.toMatchObject({
        operation_id: 'op-1',
        notice_code: noticeCode
      })
    }
  )

  it.each(['authorization_rejected', 'authorization_expired', 'authorization_updated'] as const)(
    'accepts a complete official replacement action for %s',
    async (noticeCode) => {
      const url = 'https://open.feishu.cn/suite/passport/oauth/device?user_code=A%2FB+opaque'
      mockedRequest.post.mockResolvedValue({
        data: {
          operation_id: 'op-1',
          state: 'waiting_user_auth',
          notice_code: noticeCode,
          action: {
            operation_id: 'op-1',
            session_id: 'session-2',
            phase: 'user_auth',
            expires_at: '2026-07-18T00:00:00Z',
            url
          }
        }
      })

      await expect(resumeFeishuOperation('op-1')).resolves.toMatchObject({
        notice_code: noticeCode,
        action: { url }
      })
    }
  )

  it('accepts the real Feishu v1.0.68 accounts verification URL for a replacement action', async () => {
    const url =
      'https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=opaque-flow&user_code=SAFE-CODE'
    mockedRequest.post.mockResolvedValue({
      data: {
        operation_id: 'op-1',
        state: 'waiting_user_auth',
        notice_code: 'authorization_updated',
        action: {
          operation_id: 'op-1',
          session_id: 'session-2',
          phase: 'user_auth',
          expires_at: '2026-07-18T00:00:00Z',
          url
        }
      }
    })

    await expect(resumeFeishuOperation('op-1')).resolves.toMatchObject({
      action: { url }
    })
  })

  it('accepts a notice-free next external step when its state and phase agree', async () => {
    mockedRequest.post.mockResolvedValue({
      data: {
        operation_id: 'op-1',
        state: 'waiting_confirmation',
        action: {
          operation_id: 'op-1',
          session_id: 'session-confirmation',
          phase: 'confirmation',
          expires_at: '2026-07-18T00:00:00Z'
        }
      }
    })

    await expect(resumeFeishuOperation('op-1')).resolves.toMatchObject({
      state: 'waiting_confirmation',
      action: { phase: 'confirmation' }
    })
  })

  it.each([
    {
      label: 'an unknown notice',
      data: {
        operation_id: 'op-1',
        state: 'waiting_user_auth',
        notice_code: 'server_raw_denied',
        message: 'sensitive server detail'
      }
    },
    {
      label: 'an unexpected top-level secret field',
      data: {
        operation_id: 'op-1',
        state: 'waiting_user_auth',
        notice_code: 'authorization_pending',
        device_code: 'must-not-enter-browser-state'
      }
    },
    {
      label: 'a pending notice carrying an action',
      data: {
        operation_id: 'op-1',
        state: 'waiting_user_auth',
        notice_code: 'authorization_pending',
        action: {
          operation_id: 'op-1',
          session_id: 'session-2',
          phase: 'user_auth',
          expires_at: '2026-07-18T00:00:00Z',
          url: 'https://open.feishu.cn/authorize'
        }
      }
    },
    {
      label: 'a replacement notice outside the user-auth wait state',
      data: {
        operation_id: 'op-1',
        state: 'executing',
        notice_code: 'authorization_updated',
        action: {
          operation_id: 'op-1',
          session_id: 'session-2',
          phase: 'user_auth',
          expires_at: '2026-07-18T00:00:00Z',
          url: 'https://open.feishu.cn/authorize'
        }
      }
    },
    {
      label: 'a replacement notice for a non-user-auth phase',
      data: {
        operation_id: 'op-1',
        state: 'waiting_user_auth',
        notice_code: 'authorization_updated',
        action: {
          operation_id: 'op-1',
          session_id: 'session-2',
          phase: 'app_scope',
          expires_at: '2026-07-18T00:00:00Z',
          url: 'https://open.feishu.cn/authorize'
        }
      }
    },
    {
      label: 'a notice-free action whose state and phase disagree',
      data: {
        operation_id: 'op-1',
        state: 'executing',
        action: {
          operation_id: 'op-1',
          session_id: 'session-2',
          phase: 'user_auth',
          expires_at: '2026-07-18T00:00:00Z',
          url: 'https://open.feishu.cn/authorize'
        }
      }
    },
    {
      label: 'a replacement without a live URL',
      data: {
        operation_id: 'op-1',
        state: 'waiting_user_auth',
        notice_code: 'authorization_expired',
        action: {
          operation_id: 'op-1',
          session_id: 'session-2',
          phase: 'user_auth',
          expires_at: '2026-07-18T00:00:00Z'
        }
      }
    },
    {
      label: 'a non-official replacement URL',
      data: {
        operation_id: 'op-1',
        state: 'waiting_user_auth',
        notice_code: 'authorization_updated',
        action: {
          operation_id: 'op-1',
          session_id: 'session-2',
          phase: 'user_auth',
          expires_at: '2026-07-18T00:00:00Z',
          url: 'https://open.feishu.cn.evil.example/authorize'
        }
      }
    },
    {
      label: 'a terminal result carrying a notice',
      data: {
        operation_id: 'op-1',
        state: 'succeeded',
        notice_code: 'authorization_processing'
      }
    },
    {
      label: 'a replacement bound to another operation',
      data: {
        operation_id: 'op-1',
        state: 'waiting_user_auth',
        notice_code: 'authorization_expired',
        action: {
          operation_id: 'op-other',
          session_id: 'session-2',
          phase: 'user_auth',
          expires_at: '2026-07-18T00:00:00Z',
          url: 'https://open.feishu.cn/authorize'
        }
      }
    }
  ])('rejects $label with one fixed local error', async ({ data }) => {
    mockedRequest.post.mockResolvedValue({ data })

    const operation = resumeFeishuOperation('op-1')
    await expect(operation).rejects.toThrow('飞书授权状态无效，请稍后重试。')
    await expect(operation).rejects.not.toThrow('sensitive server detail')
  })

  it('refreshes an authorization action with the session ID in the path only', async () => {
    mockedRequest.post.mockResolvedValue({
      data: {
        action: {
          operation_id: 'op-1',
          session_id: 'session-1',
          phase: 'user_auth',
          url: 'https://safe.example/authorize',
          expires_at: '2026-07-15T00:00:00Z'
        }
      }
    })

    await expect(refreshFeishuAction('session-1')).resolves.toMatchObject({
      action: { operation_id: 'op-1', session_id: 'session-1' }
    })
    expect(mockedRequest.post).toHaveBeenCalledWith('/v1/feishu/actions/session-1/refresh')
  })

  it('returns a terminal refresh result without authorization fields', async () => {
    mockedRequest.post.mockResolvedValue({
      data: { terminal: { operation_id: 'op-terminal', state: 'failed' } }
    })

    await expect(refreshFeishuAction('session-stale')).resolves.toEqual({
      terminal: { operation_id: 'op-terminal', state: 'failed' }
    })
  })

  it('rejects a malformed refresh response before either branch can update UI state', async () => {
    mockedRequest.post.mockResolvedValue({
      data: {
        action: {
          operation_id: 'op-1',
          session_id: 'session-2',
          phase: 'user_auth',
          url: 'https://safe.example/refreshed',
          expires_at: '2026-07-15T01:00:00Z'
        },
        terminal: { operation_id: 'op-1', state: 'failed' }
      }
    })

    await expect(refreshFeishuAction('session-malformed')).rejects.toThrow(
      '飞书操作已更新，请使用对话中的最新步骤。'
    )
  })

  it('loads status and unbinds through the shared request client', async () => {
    mockedRequest.get.mockResolvedValue({
      data: {
        state: 'none',
        connected: false,
        capabilities: {
          docs: { state: 'unknown' },
          base: { state: 'unknown' },
          wiki: { state: 'unknown' }
        }
      }
    })
    mockedRequest.delete.mockResolvedValue({
      data: { state: 'none', connected: false, message: '有数侧连接已删除' }
    })

    await expect(getFeishuStatus()).resolves.toMatchObject({ state: 'none', connected: false })
    await unbindFeishuConnection()

    expect(mockedRequest.get).toHaveBeenCalledWith('/v1/feishu/status')
    expect(mockedRequest.delete).toHaveBeenCalledWith('/v1/feishu/connection')
  })
})
