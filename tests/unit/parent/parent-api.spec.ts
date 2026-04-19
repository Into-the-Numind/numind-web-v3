/**
 * src/api/parent.ts 单元测试（credits-system Q2）
 *
 * 验证：
 *   1. listChildren 打正确的 GET /v1/users/children
 *   2. grantChildMembership 打正确的 POST，URL 带 child_id，body 是 req
 *   3. trial 不传 months 也被序列化到 body
 *   4. monthly 带 months=1..12
 *
 * 采用 vi.mock('@/api/request') 的方式拦截 axios 调用，验证请求参数。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 被 hoist 到文件顶部，闭包里的变量必须用 vi.hoisted 声明
const mocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn()
}))

vi.mock('@/api/request', () => ({
  default: {
    get: mocks.getMock,
    post: mocks.postMock
  }
}))

const { getMock, postMock } = mocks

import { listChildren, grantChildMembership } from '@/api/parent'

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('listChildren', () => {
  it('打 GET /v1/users/children', async () => {
    getMock.mockResolvedValue({ code: 0, message: 'ok', data: [] })
    await listChildren()
    expect(getMock).toHaveBeenCalledWith('/v1/users/children')
  })

  it('透传后端响应', async () => {
    const children = [
      { id: 1, username: 'child1', user_tier: 'free' },
      { id: 2, username: 'child2', user_tier: 'trial' }
    ]
    getMock.mockResolvedValue({ code: 0, message: 'ok', data: children })
    const res = await listChildren()
    expect(res.data).toEqual(children)
  })
})

describe('grantChildMembership', () => {
  it('trial 类型：POST 带 product_type + reason，不带 months', async () => {
    postMock.mockResolvedValue({ code: 0, message: 'ok', data: {} })
    await grantChildMembership(42, {
      product_type: 'trial',
      reason: '新员工试用'
    })
    expect(postMock).toHaveBeenCalledWith('/v1/users/children/42/grant-membership', {
      product_type: 'trial',
      reason: '新员工试用'
    })
  })

  it('monthly 类型：POST 带 months', async () => {
    postMock.mockResolvedValue({ code: 0, message: 'ok', data: {} })
    await grantChildMembership(7, {
      product_type: 'monthly',
      months: 3,
      reason: '季度会员'
    })
    expect(postMock).toHaveBeenCalledWith('/v1/users/children/7/grant-membership', {
      product_type: 'monthly',
      months: 3,
      reason: '季度会员'
    })
  })

  it('字符串 id 也能正确拼 URL', async () => {
    postMock.mockResolvedValue({ code: 0, message: 'ok', data: {} })
    await grantChildMembership('abc-123', {
      product_type: 'trial',
      reason: 'ok'
    })
    expect(postMock).toHaveBeenCalledWith(
      '/v1/users/children/abc-123/grant-membership',
      expect.objectContaining({ product_type: 'trial' })
    )
  })

  it('透传后端响应', async () => {
    postMock.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: { user_tier: 'standard', tier_expires: '2026-07-18T00:00:00Z' }
    })
    const res = await grantChildMembership(1, {
      product_type: 'monthly',
      months: 1,
      reason: 'test'
    })
    expect(res.data.user_tier).toBe('standard')
    expect(res.data.tier_expires).toBe('2026-07-18T00:00:00Z')
  })

  it('拒绝 reject 时抛出错误', async () => {
    postMock.mockRejectedValue(new Error('权限不足'))
    await expect(grantChildMembership(1, { product_type: 'trial', reason: 'x' })).rejects.toThrow(
      '权限不足'
    )
  })
})
