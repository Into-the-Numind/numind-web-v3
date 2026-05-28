/**
 * request.ts 402 拦截器单元测试 — credits-system Track E.1
 *
 * 验证：
 *   1. 后端返回 402 + body `{ code: 'Credits.Insufficient' }` → 派发 `insufficient-credits`
 *      CustomEvent，detail 含 `{ message, reason }` 结构化 payload
 *   2. reject 的 value 是原 body（便于上层代码拿 code 分支处理）
 *   3. 其它 402（无 Credits.Insufficient code）不派发事件，reject 一个标准 Error
 *
 * 采用 vitest 的 `vi.mock` 拦截 axios adapter，模拟不同 response 形态直接进入
 * 拦截器，而非真起 MSW server——因为本测试的目标就是拦截器本身的分支，MSW
 * 层的验证另见 handlers 文件 jsdoc。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('request.ts — 402 Credits.Insufficient 拦截器', () => {
  const dispatchSpy = vi.fn()

  beforeEach(() => {
    dispatchSpy.mockClear()
    // 拦截 window.dispatchEvent 捕获 CustomEvent
    vi.spyOn(window, 'dispatchEvent').mockImplementation((evt: Event) => {
      dispatchSpy(evt)
      return true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('402 + body.code=Credits.Insufficient → 派发 CustomEvent 带结构化 detail', async () => {
    // 直接 import 拦截器处理函数需要经过模块副作用（axios.create 被挂一次）；
    // 因此用真实 axios instance + 构造一个 error 丢给 fulfilled path。
    const requestModule = await import('@/api/request')
    const instance = requestModule.default

    // Adapter mock — 让请求走到响应拦截器的 rejected 分支
    instance.defaults.adapter = () =>
      Promise.reject({
        config: {},
        response: {
          status: 402,
          data: {
            code: 'Credits.Insufficient',
            message: '积分不足，请购买加量包',
            reason: 'booster_empty'
          },
          headers: { 'content-type': 'application/json' }
        }
      })

    await expect(instance.get('/v1/credits/estimate')).rejects.toMatchObject({
      code: 'Credits.Insufficient',
      message: '积分不足，请购买加量包',
      reason: 'booster_empty'
    })

    expect(dispatchSpy).toHaveBeenCalledOnce()
    const evt = dispatchSpy.mock.calls[0]?.[0] as CustomEvent
    expect(evt).toBeInstanceOf(CustomEvent)
    expect(evt.type).toBe('insufficient-credits')
    // detail.message 走 friendlyErrorMessage(code='Credits.Insufficient') 统一文案，
    // 覆盖后端原始 message（参见 utils/errorMessage.ts ERRNO_FRIENDLY 表）
    expect(evt.detail).toEqual({
      message: '积分不足，请前往会员中心查看额度',
      reason: 'booster_empty'
    })
  })

  it('402 无 Credits.Insufficient code → 不派发事件，reject 标准 Error', async () => {
    const { default: instance } = await import('@/api/request')
    instance.defaults.adapter = () =>
      Promise.reject({
        config: {},
        response: {
          status: 402,
          data: { code: 'Other.Error', message: '支付异常' },
          headers: { 'content-type': 'application/json' }
        }
      })

    await expect(instance.get('/v1/credits/estimate')).rejects.toThrow('支付异常')

    // 不应派发 insufficient-credits 事件
    const insufficientCalls = dispatchSpy.mock.calls.filter(
      (args) => (args[0] as CustomEvent).type === 'insufficient-credits'
    )
    expect(insufficientCalls).toHaveLength(0)
  })

  it('402 但 detail.reason 可缺失（optional）', async () => {
    const { default: instance } = await import('@/api/request')
    instance.defaults.adapter = () =>
      Promise.reject({
        config: {},
        response: {
          status: 402,
          data: { code: 'Credits.Insufficient', message: '积分不足' },
          headers: { 'content-type': 'application/json' }
        }
      })

    await expect(instance.get('/v1/credits/estimate')).rejects.toMatchObject({
      code: 'Credits.Insufficient'
    })

    const evt = dispatchSpy.mock.calls[0]?.[0] as CustomEvent
    // detail.message 走 friendlyErrorMessage 统一文案；reason 可缺失
    expect(evt.detail).toEqual({
      message: '积分不足，请前往会员中心查看额度',
      reason: undefined
    })
  })
})
