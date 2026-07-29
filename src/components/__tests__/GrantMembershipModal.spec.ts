/**
 * GrantMembershipModal 单元测试 (Plan §Task 20)
 *
 * 覆盖 6 个 case：
 *   T1: hasUsedTrial=true → trial tab 内容置灰 + 提交按钮禁用
 *   T2: Pro tab 月数选择更新显示价格
 *   T3: 提交 trial 时带 Idempotency-Key header（UUID 格式）
 *   T4: event_type=trial_granted → 正确 toast 文案 via emit 'success'
 *   T5: event_type=sub_granted/sub_renewed → 正确 toast 文案
 *   T6: weekly 提交不带 months，toast 显示周度会员
 *   T7: weekly/trial 视觉结构与 Pro hero card 统一，trial 显示金额
 *
 * 注意：组件使用 <Teleport to="body">，需要 attachTo: document.body，
 * 并通过 document.querySelector 查找 teleport 内元素。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// --- Mocks ---
vi.mock('@/api/parent', () => ({
  grantMembership: vi.fn()
}))

vi.mock('@/utils/idempotency', () => ({
  generateIdempotencyKey: vi.fn(() => 'mock-uuid-1234-5678-abcd-efgh')
}))

vi.mock('@/utils/datetime', () => ({
  formatDate: vi.fn((iso: string | null | undefined) => {
    if (!iso) return '—'
    return iso.slice(0, 10) // simplified for tests
  })
}))

import GrantMembershipModal from '../GrantMembershipModal.vue'
import { grantMembership } from '@/api/parent'
import { generateIdempotencyKey } from '@/utils/idempotency'

const grantMock = grantMembership as unknown as ReturnType<typeof vi.fn>
const keyMock = generateIdempotencyKey as unknown as ReturnType<typeof vi.fn>

/** Helper: mount modal with Teleport support */
function mountModal(props: {
  open: boolean
  childId: number
  childName: string
  hasUsedTrial: boolean
}) {
  return mount(GrantMembershipModal, {
    props,
    attachTo: document.body
  })
}

function makeGrantResp(
  eventType: string,
  expiresAt = '2026-07-29T23:59:59Z',
  months = 3,
  productType?: 'trial' | 'weekly' | 'monthly'
) {
  return {
    data: {
      child_user_id: 42,
      product_type: productType ?? (eventType === 'trial_granted' ? 'trial' : 'monthly'),
      event_id: 1,
      event_type: eventType,
      expires_at: expiresAt,
      months
    }
  }
}

describe('GrantMembershipModal', () => {
  beforeEach(() => {
    grantMock.mockReset()
    keyMock.mockReturnValue('mock-uuid-1234-5678-abcd-efgh')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // T1: hasUsedTrial=true → trial tab 置灰 + 提交禁用（须先切到 trial tab，默认是 Pro）
  it('T1: hasUsedTrial=true grays trial tab content and disables submit button', async () => {
    const wrapper = mountModal({
      open: true,
      childId: 42,
      childName: '张三',
      hasUsedTrial: true
    })
    await wrapper.vm.$nextTick()

    // 默认 Pro tab，需切到 trial tab（last-child）
    const trialTab = document.querySelector('[role="tab"]:last-child') as HTMLButtonElement
    trialTab.click()
    await wrapper.vm.$nextTick()

    // Warning banner visible
    const warning = document.querySelector('[data-testid="trial-used-warning"]')
    expect(warning).not.toBeNull()
    expect(warning!.textContent).toContain('已使用过体验会员')

    // Tab content should have .disabled class
    const tabContent = document.querySelector('.grant-tab-content')
    expect(tabContent!.classList.contains('disabled')).toBe(true)

    // Submit button should be disabled
    const submitBtn = document.querySelector(
      '[data-testid="grant-submit-btn"]'
    ) as HTMLButtonElement
    expect(submitBtn).not.toBeNull()
    expect(submitBtn.disabled).toBe(true)

    wrapper.unmount()
  })

  // T2: Pro tab 月数选择更新价格（默认即 Pro tab，默认 1 年选中）
  it('T2: Pro tab selecting months updates displayed price', async () => {
    const wrapper = mountModal({
      open: true,
      childId: 42,
      childName: '李四',
      hasUsedTrial: false
    })
    await wrapper.vm.$nextTick()

    // 默认 1 年选中，hero 卡显示，价格 ¥949 可见
    const hero = document.querySelector('[data-testid="hero-yearly"]') as HTMLButtonElement
    expect(hero).not.toBeNull()
    expect(hero.classList.contains('selected')).toBe(true)
    expect(hero.textContent ?? '').toContain('1 年')
    expect(document.body.textContent ?? '').toContain('949')

    // 展开自定义面板才能看到 1/3/6 quick picks
    const toggle = document.querySelector('[data-testid="toggle-custom"]') as HTMLButtonElement
    expect(toggle).not.toBeNull()
    toggle.click()
    await wrapper.vm.$nextTick()

    // 点 3 个月 quick pick → ¥297
    const btn3 = document.querySelector('[data-testid="month-btn-3"]') as HTMLButtonElement
    expect(btn3).not.toBeNull()
    btn3.click()
    await wrapper.vm.$nextTick()
    expect(btn3.classList.contains('selected')).toBe(true)
    expect(document.body.textContent ?? '').toContain('297')

    // hero 卡此时变为未选中
    expect(hero.classList.contains('selected')).toBe(false)

    // 点 hero 卡切回 1 年 → ¥949
    hero.click()
    await wrapper.vm.$nextTick()
    expect(hero.classList.contains('selected')).toBe(true)
    expect(document.body.textContent ?? '').toContain('949')

    wrapper.unmount()
  })

  // T3: 提交时带 Idempotency-Key UUID（须切到 trial tab，默认是 Pro）
  it('T3: submit sends grantMembership with idempotency key UUID', async () => {
    grantMock.mockResolvedValue(makeGrantResp('trial_granted'))

    const wrapper = mountModal({
      open: true,
      childId: 42,
      childName: '王五',
      hasUsedTrial: false
    })
    await wrapper.vm.$nextTick()

    // 切到 trial tab（last-child）
    const trialTab = document.querySelector('[role="tab"]:last-child') as HTMLButtonElement
    trialTab.click()
    await wrapper.vm.$nextTick()

    const submitBtn = document.querySelector(
      '[data-testid="grant-submit-btn"]'
    ) as HTMLButtonElement
    submitBtn.click()
    await flushPromises()

    expect(grantMock).toHaveBeenCalledOnce()
    const [childId, body, idempotencyKey] = grantMock.mock.calls[0]
    expect(childId).toBe(42)
    expect(body.product_type).toBe('trial')
    expect(typeof idempotencyKey).toBe('string')
    // UUID format: 8-4-4-4-12
    expect(idempotencyKey).toBe('mock-uuid-1234-5678-abcd-efgh')

    wrapper.unmount()
  })

  // T4: event_type=trial_granted → emit 'success' with correct _toastMsg
  it('T4: trial_granted emits success with correct toast message', async () => {
    grantMock.mockResolvedValue(makeGrantResp('trial_granted'))

    const wrapper = mountModal({
      open: true,
      childId: 42,
      childName: '赵六',
      hasUsedTrial: false
    })
    await wrapper.vm.$nextTick()

    // 切到 trial tab（last-child）
    const trialTab = document.querySelector('[role="tab"]:last-child') as HTMLButtonElement
    trialTab.click()
    await wrapper.vm.$nextTick()

    const submitBtn = document.querySelector(
      '[data-testid="grant-submit-btn"]'
    ) as HTMLButtonElement
    submitBtn.click()
    await flushPromises()

    const successEmits = wrapper.emitted('success')
    expect(successEmits).toBeTruthy()
    expect(successEmits!.length).toBeGreaterThan(0)
    const emittedResp = (successEmits![0] as [Record<string, unknown>])[0]
    expect((emittedResp as { _toastMsg: string })._toastMsg).toContain('赵六')
    expect((emittedResp as { _toastMsg: string })._toastMsg).toContain('体验包')
    expect((emittedResp as { _toastMsg: string })._toastMsg).toContain('3 天有效期')

    wrapper.unmount()
  })

  // T5: event_type=sub_granted and sub_renewed → correct toast messages
  it('T5: sub_granted emits success with correct toast including expiry date', async () => {
    grantMock.mockResolvedValue(makeGrantResp('sub_granted', '2026-10-29T23:59:59Z', 3))

    const wrapper = mountModal({
      open: true,
      childId: 42,
      childName: '钱七',
      hasUsedTrial: false
    })
    await wrapper.vm.$nextTick()

    // 默认即 Pro tab，无需切换

    const submitBtn = document.querySelector(
      '[data-testid="grant-submit-btn"]'
    ) as HTMLButtonElement
    submitBtn.click()
    await flushPromises()

    const successEmits = wrapper.emitted('success')
    expect(successEmits).toBeTruthy()
    const emittedResp = (successEmits![0] as [Record<string, unknown>])[0]
    const toastMsg = (emittedResp as { _toastMsg: string })._toastMsg
    expect(toastMsg).toContain('钱七')
    expect(toastMsg).toContain('Pro')
    // formatDate is mocked to return ISO slice, so should contain '2026-10-29'
    expect(toastMsg).toContain('2026-10-29')

    wrapper.unmount()
  })

  it('T5b: sub_renewed emits correct toast message', async () => {
    grantMock.mockResolvedValue(makeGrantResp('sub_renewed', '2027-01-29T23:59:59Z', 6))

    const wrapper = mountModal({
      open: true,
      childId: 42,
      childName: '孙八',
      hasUsedTrial: false
    })
    await wrapper.vm.$nextTick()

    // 默认即 Pro tab，无需切换

    const submitBtn = document.querySelector(
      '[data-testid="grant-submit-btn"]'
    ) as HTMLButtonElement
    submitBtn.click()
    await flushPromises()

    const successEmits = wrapper.emitted('success')
    expect(successEmits).toBeTruthy()
    const emittedResp = (successEmits![0] as [Record<string, unknown>])[0]
    const toastMsg = (emittedResp as { _toastMsg: string })._toastMsg
    expect(toastMsg).toContain('孙八')
    expect(toastMsg).toContain('续费')
    expect(toastMsg).toContain('2027-01-29')

    wrapper.unmount()
  })

  it('T6: weekly submit sends product_type only and emits weekly toast', async () => {
    grantMock.mockResolvedValue(
      makeGrantResp('sub_granted', '2026-08-05T23:59:59Z', 0, 'weekly')
    )

    const wrapper = mountModal({
      open: true,
      childId: 42,
      childName: '周九',
      hasUsedTrial: false
    })
    await wrapper.vm.$nextTick()

    const weeklyTab = Array.from(document.querySelectorAll('[role="tab"]')).find((el) =>
      (el.textContent ?? '').includes('周度会员')
    ) as HTMLButtonElement
    expect(weeklyTab).not.toBeNull()
    weeklyTab.click()
    await wrapper.vm.$nextTick()

    const submitBtn = document.querySelector(
      '[data-testid="grant-submit-btn"]'
    ) as HTMLButtonElement
    submitBtn.click()
    await flushPromises()

    expect(grantMock).toHaveBeenCalledOnce()
    const [, body] = grantMock.mock.calls[0]
    expect(body).toEqual({ product_type: 'weekly' })

    const successEmits = wrapper.emitted('success')
    expect(successEmits).toBeTruthy()
    const emittedResp = (successEmits![0] as [Record<string, unknown>])[0]
    const toastMsg = (emittedResp as { _toastMsg: string })._toastMsg
    expect(toastMsg).toContain('周九')
    expect(toastMsg).toContain('周度会员')
    expect(toastMsg).toContain('2026-08-05')

    wrapper.unmount()
  })

  it('T7: weekly and trial tabs use hero card layout and trial shows price', async () => {
    const wrapper = mountModal({
      open: true,
      childId: 42,
      childName: '吴十',
      hasUsedTrial: false
    })
    await wrapper.vm.$nextTick()

    const tabs = Array.from(document.querySelectorAll('[role="tab"]')) as HTMLButtonElement[]
    const weeklyTab = tabs.find((el) => (el.textContent ?? '').includes('周度会员'))
    expect(weeklyTab).toBeTruthy()
    weeklyTab!.click()
    await wrapper.vm.$nextTick()

    let card = document.querySelector('.hero-card.simple-plan-card')
    expect(card).not.toBeNull()
    expect(document.querySelector('.grant-product-card')).toBeNull()
    expect(card!.textContent ?? '').toContain('周度会员')
    expect(card!.textContent ?? '').toContain('¥25')
    expect(document.body.textContent ?? '').toContain('合计¥25')

    const trialTab = tabs.find((el) => (el.textContent ?? '').includes('体验会员'))
    expect(trialTab).toBeTruthy()
    trialTab!.click()
    await wrapper.vm.$nextTick()

    card = document.querySelector('.hero-card.simple-plan-card')
    expect(card).not.toBeNull()
    expect(document.querySelector('.grant-product-card')).toBeNull()
    expect(card!.textContent ?? '').toContain('体验会员')
    expect(card!.textContent ?? '').toContain('¥9.9')
    expect(document.body.textContent ?? '').toContain('合计¥9.9')

    wrapper.unmount()
  })
})
