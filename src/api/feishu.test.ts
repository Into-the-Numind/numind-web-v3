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

  it('refreshes an authorization action with the session ID in the path only', async () => {
    mockedRequest.post.mockResolvedValue({
      data: {
        operation_id: 'op-1',
        session_id: 'session-1',
        phase: 'user_auth',
        url: 'https://safe.example/authorize',
        expires_at: '2026-07-15T00:00:00Z'
      }
    })

    await refreshFeishuAction('session-1')
    expect(mockedRequest.post).toHaveBeenCalledWith('/v1/feishu/actions/session-1/refresh')
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
