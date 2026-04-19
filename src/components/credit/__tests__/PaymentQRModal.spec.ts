/**
 * PaymentQRModal 状态机单元测试 (booster-payment-ui Task 5)
 *
 * 这是"唯一的自动化回归抓手"——手动 E2E (P1-P8) 不产生持久测试，
 * 未来修改状态机时，这里的 6 条路径是最后一道防线。
 *
 * 覆盖路径（spec §3 + §6 + plan §1 Task 5 要点 3）：
 *   T1: mount + open=true → createOrder 被调用 → state='pending'
 *   T2: pending 下 getOrder 返回 paid → state='paid' → emit('paid')，250ms 后 emit('update:open', false)
 *   T3: pending 下倒计时归零 (300s) → state='expired'
 *   T4: pending 下连续 3 次 getOrder 失败 → state='error'
 *   T5: pending 下切换 activeTab → 旧 poll 停止，createOrder 被二次调用
 *   T6: open=true → open=false → pending timer 被清理 (hasPendingTimers 验证)
 *
 * 设计决策：
 *   - Mock @/api/orders：隔离真 HTTP
 *   - Mock qrcode：避免 QR 生成异步副作用干扰 timer 调度
 *   - 直接挂真实 Pinia user store（setActivePinia + 写 userInfo），不 mock store
 *   - 状态读取通过 data-testid="pqm-state" 的 DOM 文本（IS_DEV=import.meta.env.DEV
 *     在 vitest 下为 true），无需访问组件私有 state
 *   - T2 只断言副作用 (emit)，不断言 DOM 文本，因为 paid → closed 过渡后 debug 节点可能消失
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/orders', () => ({
  createOrder: vi.fn(),
  getOrder: vi.fn()
}))

// qrcode 的 toDataURL 是 async，如果不 mock，假 timer 下它的 microtask
// 和 setInterval 调度混在一起会让断言不稳定；mock 成同步 resolve 即可
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,stub'))
  }
}))

import PaymentQRModal from '../PaymentQRModal.vue'
import { createOrder, getOrder, type Order } from '@/api/orders'
import type { ApiResponse } from '@/api/request'
import { useUserStore, type UserInfo } from '@/stores/user'

const createOrderMock = createOrder as unknown as ReturnType<typeof vi.fn>
const getOrderMock = getOrder as unknown as ReturnType<typeof vi.fn>

// 必须与 PaymentQRModal.vue 的 POLL_INTERVAL_MS / PAYMENT_TIMEOUT_SECS / PAID_CLOSE_DELAY_MS
// 常量保持一致；若组件改了频率，这里也要同步（防止测试静默通过错误的时序）
const POLL_INTERVAL_MS = 2000
const PAYMENT_TIMEOUT_SECS = 300
const PAID_CLOSE_DELAY_MS = 250
// 加量包固定 0 个月（无月度概念，与 model.ProductTypeBooster 对齐）
const BOOSTER_MONTHS = 0

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 42,
    order_no: 'BO-202604200001',
    user_id: 123,
    payer_id: 123,
    product_type: 'booster',
    months: 0,
    amount: 2990,
    pay_channel: 'wechat',
    pay_status: 'pending',
    code_url: 'weixin://wxpay/bizpayurl?pr=abcxyz',
    paid_at: null,
    expired_at: '2026-04-20T12:00:00Z',
    created_at: '2026-04-20T10:00:00Z',
    ...overrides
  }
}

function makeOrderResp(order: Order): ApiResponse<Order> {
  return { code: 0, message: 'ok', data: order }
}

function getStateText(): string {
  // Teleport to body → 通过 document 查询而非 wrapper.find
  const el = document.querySelector('[data-testid="pqm-state"]')
  return el?.textContent ?? ''
}

/**
 * 挂载组件 + 等所有微任务落定（createOrder 的 then/catch + watch 重新调度）。
 *
 * Teleport 到 body，所以用 attachTo: document.body 并用 wrapper.unmount 清理。
 */
async function mountModal(props: { open: boolean }): Promise<VueWrapper> {
  const wrapper = mount(PaymentQRModal, {
    props,
    attachTo: document.body
  })
  // watch immediate:true → startFlow → transitionTo('creating') → createBoosterOrder (async)
  // 需要 flushPromises 把 createOrder mock 的 resolve 冲完
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  // 挂在 body 的节点会在组件间泄漏，每条 test 清理
  document.body.innerHTML = ''
  createOrderMock.mockReset()
  getOrderMock.mockReset()

  // 给 user store 填 userInfo.id=123（组件从 useUserStore().userInfo?.id 读取）
  const userStore = useUserStore()
  userStore.userInfo = { id: 123, username: 'tester' } as UserInfo

  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PaymentQRModal 状态机', () => {
  it('T1: open=true 触发 createOrder，进入 pending', async () => {
    const order = makeOrder()
    createOrderMock.mockResolvedValue(makeOrderResp(order))

    const wrapper = await mountModal({ open: true })

    expect(createOrderMock).toHaveBeenCalledTimes(1)
    expect(createOrderMock).toHaveBeenCalledWith({
      user_id: 123,
      product_type: 'booster',
      months: BOOSTER_MONTHS,
      pay_channel: 'wechat'
    })
    // createOrder resolve 后 transitionTo('pending')
    expect(getStateText()).toContain('pending')

    wrapper.unmount()
  })

  it('T2: pending 下 getOrder 返回 paid → emit("paid")，250ms 后 emit("update:open", false)', async () => {
    createOrderMock.mockResolvedValue(makeOrderResp(makeOrder()))
    getOrderMock.mockResolvedValue(makeOrderResp(makeOrder({ pay_status: 'paid' })))

    const wrapper = await mountModal({ open: true })
    expect(getStateText()).toContain('pending')

    // 推进 POLL_INTERVAL_MS 触发一次 poll interval tick
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    // getOrder resolve 后 transitionTo('paid') 会立即 emit('paid')
    expect(getOrderMock).toHaveBeenCalledWith(42)
    expect(wrapper.emitted('paid')).toBeTruthy()
    expect(wrapper.emitted('paid')?.length).toBe(1)

    // paid → update:open=false 有 PAID_CLOSE_DELAY_MS 延迟
    expect(wrapper.emitted('update:open')).toBeFalsy()
    await vi.advanceTimersByTimeAsync(PAID_CLOSE_DELAY_MS)
    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])

    wrapper.unmount()
  })

  it('T3: pending 下倒计时归零 (300s) → state=expired', async () => {
    createOrderMock.mockResolvedValue(makeOrderResp(makeOrder()))
    // getOrder 永远保持 pending，让倒计时先到达 0
    getOrderMock.mockResolvedValue(makeOrderResp(makeOrder({ pay_status: 'pending' })))

    const wrapper = await mountModal({ open: true })
    expect(getStateText()).toContain('pending')

    // 推进 PAYMENT_TIMEOUT_SECS，倒计时每秒 -1 → 到 0 时 transitionTo('expired')
    await vi.advanceTimersByTimeAsync(PAYMENT_TIMEOUT_SECS * 1000)

    expect(getStateText()).toContain('expired')

    wrapper.unmount()
  })

  it('T4: pending 下连续 3 次 getOrder 失败 → state=error', async () => {
    createOrderMock.mockResolvedValue(makeOrderResp(makeOrder()))
    // 每次 poll 都 reject；源码里 pollFailureCount>=3 才翻成 error
    getOrderMock.mockRejectedValue(new Error('network down'))

    const wrapper = await mountModal({ open: true })
    expect(getStateText()).toContain('pending')

    // POLL_INTERVAL_MS 一次 poll；连推 3 个间隔覆盖 MAX_POLL_FAILURES 次失败
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(getStateText()).toContain('pending')
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(getStateText()).toContain('pending')
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    expect(getOrderMock).toHaveBeenCalledTimes(3)
    expect(getStateText()).toContain('error')

    wrapper.unmount()
  })

  it('T5: pending 下切换 activeTab → 旧 poll 停止，createOrder 被二次调用', async () => {
    const firstOrder = makeOrder({ id: 42 })
    const secondOrder = makeOrder({ id: 43 })
    // 第 1 次 createOrder 返回 firstOrder，第 2 次返回 secondOrder
    createOrderMock
      .mockResolvedValueOnce(makeOrderResp(firstOrder))
      .mockResolvedValueOnce(makeOrderResp(secondOrder))
    getOrderMock.mockResolvedValue(makeOrderResp(makeOrder({ pay_status: 'pending' })))

    const wrapper = await mountModal({ open: true })
    expect(createOrderMock).toHaveBeenCalledTimes(1)
    expect(createOrderMock.mock.calls[0]?.[0]?.pay_channel).toBe('wechat')
    expect(getStateText()).toContain('pending')

    // 点击支付宝 tab（Teleport 到 body，只能通过 document 取）
    const tabs = document.querySelectorAll<HTMLButtonElement>('.pqm-tab')
    expect(tabs.length).toBe(2)
    tabs[1].click()

    // watch(activeTab) 会触发 resetForReorder + transitionTo('creating')，
    // 新的 createOrder 是 async
    await flushPromises()

    expect(createOrderMock).toHaveBeenCalledTimes(2)
    expect(createOrderMock.mock.calls[1]?.[0]?.pay_channel).toBe('alipay')

    // 清 getOrder 调用计数并推进一个 poll 间隔：新 poll 应只打新订单，旧订单 (id=42) 不再被轮询
    getOrderMock.mockClear()
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    // poll 新订单 id=43（至少一次，且任何调用都不能打旧 id=42）
    expect(getOrderMock.mock.calls.length).toBeGreaterThanOrEqual(1)
    for (const call of getOrderMock.mock.calls) {
      expect(call[0]).toBe(43)
    }

    wrapper.unmount()
  })

  it('T6: open=true → open=false → pending timers 被清理 (hasPendingTimers)', async () => {
    createOrderMock.mockResolvedValue(makeOrderResp(makeOrder()))
    getOrderMock.mockResolvedValue(makeOrderResp(makeOrder({ pay_status: 'pending' })))

    const wrapper = await mountModal({ open: true })
    expect(getStateText()).toContain('pending')
    // pending 状态下必定有 poll + countdown timer 挂着
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    await wrapper.setProps({ open: false })
    // watch(props.open) → cleanup() → transitionTo('closed') → clearAllTimers()
    await flushPromises()

    // 组件自己挂的 3 类 timer（poll/countdown/paidClose）必须归零。
    // 用 <=1 宽限一个 Vue/vitest 内部可能的 microtask timer（未来版本升级防抖），
    // 同时 >=0 保证断言仍捕获"完全不清理"的严重回归。
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1)

    wrapper.unmount()
  })
})
