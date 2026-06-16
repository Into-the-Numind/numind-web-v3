/**
 * SettingsView 公司名称弹窗编辑交互测试（org-branding / company-name-edit-modal）
 *
 * 覆盖：
 *   1. 父账户看到「公司名称」展示行 + 「修改」按钮（只展示，不内联编辑）
 *   2. 点「修改」打开弹窗；点「取消」关闭且不调用接口
 *   3. 弹窗内改名 + 「确认」→ 调 updateProfile(company_name) + 刷新用户信息
 *   4. 改成与原值相同 + 「确认」→ 不发请求，直接关闭
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/api/auth', () => ({
  getUserInfo: vi.fn(),
  updateProfile: vi.fn()
}))
vi.mock('@/api/credits', () => ({
  getCreditBalance: vi.fn().mockResolvedValue({ data: {} })
}))

import SettingsView from '../SettingsView.vue'
import { getUserInfo, updateProfile } from '@/api/auth'
import { useUserStore } from '@/stores/user'

const stubs = {
  MainLayout: { template: '<div><slot /></div>' },
  CreditBalanceCard: true,
  BoosterPurchaseCard: true,
  BoosterPurchaseDialog: true,
  CreditConsumptionLogModal: true,
  // Teleport stub 让弹窗内容内联渲染，便于断言
  teleport: true
}

function mountSettings() {
  return mount(SettingsView, { global: { stubs } })
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('SettingsView 公司名称弹窗编辑', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // 默认：父账户，已设公司名"老机构"
    ;(getUserInfo as any).mockResolvedValue({
      code: 0,
      data: { id: 1, nickname: '管理员', parent_user_id: null, company_name: '老机构' }
    })
    // 让 isParentUser 为 true（store.userInfo.parent_user_id == null）
    const userStore = useUserStore()
    userStore.userInfo = {
      id: 1,
      username: 'admin',
      parent_user_id: null,
      company_name: '老机构'
    } as any
    userStore.fetchUserInfo = vi.fn().mockImplementation(async () => {
      userStore.userInfo = {
        id: 1,
        username: 'admin',
        parent_user_id: null,
        company_name: '新机构'
      } as any
      return true
    })
  })

  it('父账户看到公司名展示 + 修改按钮，初始无弹窗', async () => {
    const wrapper = mountSettings()
    await flush()
    const editBtn = wrapper.find('.row-edit-btn')
    expect(editBtn.exists()).toBe(true)
    expect(editBtn.text()).toBe('修改')
    // 展示当前值
    expect(wrapper.find('.company-display-value').text()).toBe('老机构')
    // 没有内联输入框（只展示，不直接点击编辑）
    expect(wrapper.find('.company-input').exists()).toBe(false)
    // 初始弹窗不存在
    expect(wrapper.find('.company-edit-input').exists()).toBe(false)
  })

  it('点修改打开弹窗，取消关闭且不调接口', async () => {
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.row-edit-btn').trigger('click')
    expect(wrapper.find('.company-edit-input').exists()).toBe(true)
    // 取消
    await wrapper.find('.confirm-btn-cancel').trigger('click')
    expect(wrapper.find('.company-edit-input').exists()).toBe(false)
    expect(updateProfile as any).not.toHaveBeenCalled()
  })

  it('改名 + 确认 → 调 updateProfile 并刷新', async () => {
    ;(updateProfile as any).mockResolvedValue({ code: 0 })
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.row-edit-btn').trigger('click')
    const input = wrapper.find('.company-edit-input')
    await input.setValue('新机构')
    await wrapper.find('.confirm-btn-save').trigger('click')
    await flush()
    expect(updateProfile as any).toHaveBeenCalledWith({ company_name: '新机构' })
    const userStore = useUserStore()
    expect(userStore.fetchUserInfo).toHaveBeenCalled()
    // 弹窗关闭
    expect(wrapper.find('.company-edit-input').exists()).toBe(false)
  })

  it('值未变 + 确认 → 不发请求', async () => {
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.row-edit-btn').trigger('click')
    // 不改值（仍是"老机构"），直接确认
    await wrapper.find('.confirm-btn-save').trigger('click')
    await flush()
    expect(updateProfile as any).not.toHaveBeenCalled()
    expect(wrapper.find('.company-edit-input').exists()).toBe(false)
  })
})
