/**
 * ChildMembershipGrantView 单元测试（credits-system Q2.2）
 *
 * 覆盖：
 *   1. 挂载时拉取 listChildren，渲染表格
 *   2. 空列表状态
 *   3. 打开 modal 并填表：trial 类型提交 → 正确 API payload
 *   4. monthly 类型提交 → 带 months 到 payload
 *   5. 表单校验：reason 必填，monthly months 1-12
 *   6. 成功后 toast + 关闭 modal + 刷新列表
 *   7. 失败显示 error 文案
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

// vi.mock 会被 hoist，闭包变量用 vi.hoisted 声明
const mocks = vi.hoisted(() => ({
  listChildrenMock: vi.fn(),
  grantChildMembershipMock: vi.fn()
}))

vi.mock('@/api/parent', () => ({
  listChildren: mocks.listChildrenMock,
  grantChildMembership: mocks.grantChildMembershipMock
}))

// MainLayout 简化为 slot 透传
vi.mock('@/components/layout/MainLayout.vue', () => ({
  default: {
    name: 'MainLayoutStub',
    template: '<div class="main-layout-stub"><slot /></div>'
  }
}))

import ChildMembershipGrantView from '@/views/parent/ChildMembershipGrantView.vue'
import { useNotificationsStore } from '@/stores/notifications'

const { listChildrenMock, grantChildMembershipMock } = mocks

const sampleChildren = [
  { id: 11, username: 'child-a', nickname: '小A', user_tier: 'free' },
  {
    id: 12,
    username: 'child-b',
    nickname: '小B',
    user_tier: 'trial',
    tier_expires: '2026-05-01T00:00:00Z'
  }
]

beforeEach(() => {
  setActivePinia(createPinia())
  listChildrenMock.mockReset()
  grantChildMembershipMock.mockReset()
  // Teleport 挂到 body，测试间清理避免跨测试 DOM 污染
  document.body.innerHTML = ''
})

async function mountView() {
  const wrapper = mount(ChildMembershipGrantView, {
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}

describe('ChildMembershipGrantView — 列表加载', () => {
  it('挂载时调用 listChildren 并渲染表格行', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    const wrapper = await mountView()

    expect(listChildrenMock).toHaveBeenCalledTimes(1)
    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(2)
    expect(wrapper.text()).toContain('小A')
    expect(wrapper.text()).toContain('child-b')
  })

  it('空列表 → 渲染空状态', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: [] })
    const wrapper = await mountView()

    expect(wrapper.find('tbody').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂无子账户')
  })

  it('加载失败 → 渲染 error + 重试按钮', async () => {
    listChildrenMock.mockRejectedValue(new Error('网络错误'))
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('网络错误')
    const retry = wrapper.find('.retry-btn')
    expect(retry.exists()).toBe(true)

    // 点击重试再次调用 API
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: [] })
    await retry.trigger('click')
    await flushPromises()
    expect(listChildrenMock).toHaveBeenCalledTimes(2)
  })
})

describe('ChildMembershipGrantView — 开通会员 modal', () => {
  it('点击"开通会员"打开 modal，默认 trial 类型', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    const wrapper = await mountView()

    await wrapper.findAll('.grant-btn')[0].trigger('click')
    await flushPromises()

    const dialog = document.querySelector('.modal-dialog')
    expect(dialog).toBeTruthy()
    expect(dialog?.textContent).toContain('为 小A 开通会员')

    // trial 激活时月数选择器不显示
    const select = document.querySelector('#grant-months')
    expect(select).toBeNull()

    wrapper.unmount()
  })

  it('切换到 monthly 后显示月数下拉', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    const wrapper = await mountView()

    await wrapper.findAll('.grant-btn')[0].trigger('click')
    await flushPromises()

    const monthlyRadio = document.querySelector(
      'input[name="product-type"][value="monthly"]'
    ) as HTMLInputElement
    expect(monthlyRadio).toBeTruthy()
    monthlyRadio.checked = true
    monthlyRadio.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const select = document.querySelector('#grant-months')
    expect(select).toBeTruthy()

    wrapper.unmount()
  })

  it('trial 类型提交：POST 带 product_type + reason，不带 months', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    grantChildMembershipMock.mockResolvedValue({ code: 0, message: 'ok', data: {} })
    const wrapper = await mountView()

    await wrapper.findAll('.grant-btn')[0].trigger('click')
    await flushPromises()

    // 填写 reason
    const reasonEl = document.querySelector('#grant-reason') as HTMLTextAreaElement
    reasonEl.value = '新员工试用'
    reasonEl.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const submitBtn = document.querySelector('.btn-primary[type="submit"]') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(false)

    // 触发 form submit
    const form = document.querySelector('#grant-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(grantChildMembershipMock).toHaveBeenCalledWith(11, {
      product_type: 'trial',
      reason: '新员工试用'
    })

    wrapper.unmount()
  })

  it('monthly 类型提交：POST 带 months', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    grantChildMembershipMock.mockResolvedValue({ code: 0, message: 'ok', data: {} })
    const wrapper = await mountView()

    await wrapper.findAll('.grant-btn')[1].trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 切 monthly：先尝试 wrapper.find，不行就用 document.querySelector
    // Vue 3 的 Teleport 内容仍会被 @vue/test-utils v2 的 find 找到（通过 wrapper.findAll）
    const monthlyRadio = document.querySelector(
      'input[name="product-type"][value="monthly"]'
    ) as HTMLInputElement
    expect(monthlyRadio).toBeTruthy()

    // 手动同步 v-model：设置 checked + 派发 change
    monthlyRadio.checked = true
    monthlyRadio.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await wrapper.vm.$nextTick()
    await flushPromises()

    // 选 3 个月
    const select = document.querySelector('#grant-months') as HTMLSelectElement
    expect(select).toBeTruthy()
    select.value = '3'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const reasonEl = document.querySelector('#grant-reason') as HTMLTextAreaElement
    reasonEl.value = '季度会员'
    reasonEl.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const form = document.querySelector('#grant-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(grantChildMembershipMock).toHaveBeenCalledWith(12, {
      product_type: 'monthly',
      months: 3,
      reason: '季度会员'
    })

    wrapper.unmount()
  })

  it('reason 为空时 submit 按钮禁用', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    const wrapper = await mountView()

    await wrapper.findAll('.grant-btn')[0].trigger('click')
    await flushPromises()

    const submitBtn = document.querySelector('.btn-primary[type="submit"]') as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    wrapper.unmount()
  })

  it('成功后：触发 notifications.success + 刷新列表 + 关闭 modal', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    grantChildMembershipMock.mockResolvedValue({ code: 0, message: 'ok', data: {} })
    const wrapper = await mountView()

    const notifications = useNotificationsStore()
    const successSpy = vi.spyOn(notifications, 'success')

    await wrapper.findAll('.grant-btn')[0].trigger('click')
    await flushPromises()

    const reasonEl = document.querySelector('#grant-reason') as HTMLTextAreaElement
    reasonEl.value = '测试'
    reasonEl.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const form = document.querySelector('#grant-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(successSpy).toHaveBeenCalled()
    // modal 关闭
    expect(document.querySelector('.modal-dialog')).toBeNull()
    // listChildren 被重新调用（挂载 1 次 + 成功刷新 1 次）
    expect(listChildrenMock).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('API 失败：modal 内显示错误文案，modal 不关闭', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    grantChildMembershipMock.mockRejectedValue(new Error('后端拒绝：权限不足'))
    const wrapper = await mountView()

    await wrapper.findAll('.grant-btn')[0].trigger('click')
    await flushPromises()

    const reasonEl = document.querySelector('#grant-reason') as HTMLTextAreaElement
    reasonEl.value = '测试'
    reasonEl.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const form = document.querySelector('#grant-form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(document.querySelector('.modal-dialog')).toBeTruthy()
    expect(document.querySelector('.form-error')?.textContent).toContain('权限不足')

    wrapper.unmount()
  })

  it('取消按钮关闭 modal', async () => {
    listChildrenMock.mockResolvedValue({ code: 0, message: 'ok', data: sampleChildren })
    const wrapper = await mountView()

    await wrapper.findAll('.grant-btn')[0].trigger('click')
    await flushPromises()

    expect(document.querySelector('.modal-dialog')).toBeTruthy()

    const cancelBtn = document.querySelector('.btn-cancel') as HTMLButtonElement
    cancelBtn.click()
    await flushPromises()

    expect(document.querySelector('.modal-dialog')).toBeNull()
    wrapper.unmount()
  })
})
