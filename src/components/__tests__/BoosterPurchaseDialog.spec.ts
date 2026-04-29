/**
 * BoosterPurchaseDialog 单元测试 (Plan §Task 19)
 *
 * 注意：组件使用 <Teleport to="body">，元素挂载在 document.body，
 * 需要 attachTo: document.body 并通过 document.querySelector 查找元素。
 *
 * 覆盖 5 个 case：
 *   T1: 1/5/10 快捷按钮点击同步 input + 高亮 active
 *   T2: quantity > 10000 显示错误 + 禁用提交
 *   T3: 总价格式化（quantity=1000 → "¥29,900.00"）
 *   T4: 提交调 placeOrder 带 Idempotency-Key（每次点击新 key）
 *   T5: paid → fetchBalance + emit 'success'
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// --- Mocks ---
vi.mock('@/api/credits', () => ({
  placeOrder: vi.fn(),
  getOrderStatus: vi.fn(),
  getCreditBalance: vi.fn(),
  estimateCredits: vi.fn(),
  listPackages: vi.fn(),
  getBalance: vi.fn()
}))

vi.mock('@/utils/idempotency', () => ({
  generateIdempotencyKey: vi.fn(() => 'test-uuid-1234-5678-abcd-efgh')
}))

import BoosterPurchaseDialog from '../BoosterPurchaseDialog.vue'
import { placeOrder, getOrderStatus } from '@/api/credits'
import { useCreditsStore } from '@/stores/credits'

const placeOrderMock = placeOrder as unknown as ReturnType<typeof vi.fn>
const getOrderStatusMock = getOrderStatus as unknown as ReturnType<typeof vi.fn>

function makePlaceOrderResp(orderId = 99) {
  return {
    data: {
      order_id: orderId,
      out_trade_no: 'OUT-001',
      status: 'pending',
      pay_params: {}
    }
  }
}

function makeOrderStatusResp(status: string) {
  return {
    data: {
      order_id: 99,
      status,
      amount_cents: 2990,
      product_type: 'booster'
    }
  }
}

describe('BoosterPurchaseDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    placeOrderMock.mockReset()
    getOrderStatusMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    // Clean up any leftover teleport content
    document.body.innerHTML = ''
  })

  // T1: 1/5/10 快捷按钮点击同步 input + 高亮
  it('T1: quick-select buttons sync quantity input and highlight active', async () => {
    const wrapper = mount(BoosterPurchaseDialog, {
      props: { open: true, userId: 123 },
      attachTo: document.body
    })
    await wrapper.vm.$nextTick()

    // Click "5" button (find via data-testid in document since Teleport renders to body)
    const btn5 = document.querySelector('[data-testid="quick-btn-5"]') as HTMLButtonElement
    expect(btn5).not.toBeNull()
    btn5.click()
    await wrapper.vm.$nextTick()

    const input = document.querySelector('input[type="number"]') as HTMLInputElement
    expect(input.value).toBe('5')
    expect(btn5.classList.contains('active')).toBe(true)

    // Click "10" button
    const btn10 = document.querySelector('[data-testid="quick-btn-10"]') as HTMLButtonElement
    btn10.click()
    await wrapper.vm.$nextTick()

    expect(input.value).toBe('10')
    expect(btn10.classList.contains('active')).toBe(true)
    expect(btn5.classList.contains('active')).toBe(false)

    // Click "1" button
    const btn1 = document.querySelector('[data-testid="quick-btn-1"]') as HTMLButtonElement
    btn1.click()
    await wrapper.vm.$nextTick()

    expect(input.value).toBe('1')
    expect(btn1.classList.contains('active')).toBe(true)
    expect(btn10.classList.contains('active')).toBe(false)

    wrapper.unmount()
  })

  // T2: quantity > 10000 显示错误 + 禁用提交
  it('T2: quantity > 10000 shows error message and disables submit', async () => {
    const wrapper = mount(BoosterPurchaseDialog, {
      props: { open: true, userId: 123 },
      attachTo: document.body
    })
    await wrapper.vm.$nextTick()

    const input = document.querySelector('input[type="number"]') as HTMLInputElement
    input.value = '10001'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new Event('blur'))
    await wrapper.vm.$nextTick()

    // Error message should be visible (MAX_QUANTITY displayed with locale formatting, e.g. "10,000" or "10000")
    const errorEl = document.querySelector('[data-testid="quantity-error"]')
    expect(errorEl).not.toBeNull()
    // The error message contains the max quantity value (formatted or plain)
    expect(errorEl!.textContent).toMatch(/10[,.]?000/)

    // Submit button should be disabled
    const submitBtn = document.querySelector('[data-testid="submit-btn"]') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    wrapper.unmount()
  })

  // T3: 总价格式化（quantity=1000 → "¥29,900.00"）
  it('T3: formats total price with Intl.NumberFormat (1000 → ¥29,900.00)', async () => {
    const wrapper = mount(BoosterPurchaseDialog, {
      props: { open: true, userId: 123 },
      attachTo: document.body
    })
    await wrapper.vm.$nextTick()

    const input = document.querySelector('input[type="number"]') as HTMLInputElement
    input.value = '1000'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()

    const priceEl = document.querySelector('[data-testid="total-price"]')
    expect(priceEl).not.toBeNull()
    expect(priceEl!.textContent).toContain('29,900.00')

    wrapper.unmount()
  })

  // T4: 提交调 placeOrder 带 Idempotency-Key
  it('T4: submit calls placeOrder with Idempotency-Key header', async () => {
    placeOrderMock.mockResolvedValue(makePlaceOrderResp(99))
    // Keep getOrderStatus pending so polling doesn't resolve in this test
    getOrderStatusMock.mockResolvedValue(makeOrderStatusResp('pending'))

    const wrapper = mount(BoosterPurchaseDialog, {
      props: { open: true, userId: 123 },
      attachTo: document.body
    })
    await wrapper.vm.$nextTick()

    const submitBtn = document.querySelector('[data-testid="submit-btn"]') as HTMLButtonElement
    submitBtn.click()
    await flushPromises()

    expect(placeOrderMock).toHaveBeenCalledOnce()
    const [params, idempotencyKey] = placeOrderMock.mock.calls[0]
    expect(params).toMatchObject({
      user_id: 123,
      product_type: 'booster',
      quantity: 1,
      pay_channel: 'wechat'
    })
    expect(idempotencyKey).toBe('test-uuid-1234-5678-abcd-efgh')

    wrapper.unmount()
  })

  // T5: paid → fetchBalance + emit 'success'
  it('T5: paid status triggers fetchBalance and emits success', async () => {
    placeOrderMock.mockResolvedValue(makePlaceOrderResp(99))
    getOrderStatusMock.mockResolvedValue(makeOrderStatusResp('paid'))

    const creditsStore = useCreditsStore()
    const fetchBalanceSpy = vi.spyOn(creditsStore, 'fetchBalance').mockResolvedValue()

    const wrapper = mount(BoosterPurchaseDialog, {
      props: { open: true, userId: 123 },
      attachTo: document.body
    })
    await wrapper.vm.$nextTick()

    const submitBtn = document.querySelector('[data-testid="submit-btn"]') as HTMLButtonElement
    submitBtn.click()
    await flushPromises()

    // Advance timer by 2s to trigger first poll
    vi.advanceTimersByTime(2000)
    await flushPromises()

    expect(fetchBalanceSpy).toHaveBeenCalled()
    expect(wrapper.emitted('success')).toBeTruthy()
    expect(wrapper.emitted('update:open')).toBeTruthy()
    const updateOpenEmits = wrapper.emitted('update:open') as boolean[][]
    expect(updateOpenEmits[updateOpenEmits.length - 1][0]).toBe(false)

    wrapper.unmount()
  })
})
