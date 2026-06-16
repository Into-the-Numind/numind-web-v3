/**
 * SettingsView 昵称弹窗编辑交互测试（nickname-edit）
 *
 * 覆盖：
 *   1. 昵称展示行 + 「修改」按钮（对所有账户可用，含子账户）
 *   2. 点「修改」打开弹窗；点「取消」关闭且不调用接口
 *   3. 弹窗内改昵称 + 「确认」→ 调 updateProfile(nickname) + 刷新用户信息 + 展示同步
 *   4. 改成与原值相同 + 「确认」→ 不发请求，直接关闭
 *   5. 清空昵称 + 「确认」→ 必填守卫，不发请求
 *   6. IME 组合中回车不提交；普通回车才确认
 *   7. 字符计数与 maxlength 上限为 10
 *
 * 用子账户(parent_user_id != null)挂载：isParentUser=false → 公司名行隐藏，
 * 页面上只剩昵称行的 .nickname-edit-btn，断言无歧义，同时印证「每个用户都能改昵称」。
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

describe('SettingsView 昵称弹窗编辑', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // 默认：子账户(parent_user_id != null → isParentUser=false)，已设昵称"小明"
    ;(getUserInfo as any).mockResolvedValue({
      code: 0,
      data: { id: 2, nickname: '小明', username: 'xiaoming', parent_user_id: 5, company_name: '' }
    })
    const userStore = useUserStore()
    userStore.userInfo = {
      id: 2,
      username: 'xiaoming',
      nickname: '小明',
      parent_user_id: 5
    } as any
    // 保存成功后 fetchUserInfo 把昵称刷成"小红"
    userStore.fetchUserInfo = vi.fn().mockImplementation(async () => {
      userStore.userInfo = {
        id: 2,
        username: 'xiaoming',
        nickname: '小红',
        parent_user_id: 5
      } as any
      return true
    })
  })

  it('展示昵称 + 修改按钮（子账户也可见），初始无弹窗', async () => {
    const wrapper = mountSettings()
    await flush()
    const editBtn = wrapper.find('.nickname-edit-btn')
    expect(editBtn.exists()).toBe(true)
    expect(editBtn.text()).toBe('修改')
    // 展示当前昵称
    expect(wrapper.find('.nickname-display-value').text()).toBe('小明')
    // 子账户：公司名行不渲染 → 仅一个编辑按钮
    expect(wrapper.findAll('.nickname-edit-btn').length).toBe(1)
    // 初始弹窗不存在
    expect(wrapper.find('.nickname-edit-input').exists()).toBe(false)
  })

  it('未设昵称时展示回退到用户名', async () => {
    // getUserInfo 与 store 都无昵称 → displayName 回退到 userStore.nickname(=username)
    ;(getUserInfo as any).mockResolvedValue({
      code: 0,
      data: { id: 9, nickname: '', username: 'xiaoming', parent_user_id: 5, company_name: '' }
    })
    const userStore = useUserStore()
    userStore.userInfo = { id: 9, username: 'xiaoming', parent_user_id: 5 } as any
    const wrapper = mountSettings()
    await flush()
    expect(wrapper.find('.nickname-display-value').text()).toBe('xiaoming')
    // 打开弹窗预填为空（无已存昵称）
    await wrapper.find('.nickname-edit-btn').trigger('click')
    expect((wrapper.find('.nickname-edit-input').element as HTMLInputElement).value).toBe('')
  })

  it('点修改打开弹窗，取消关闭且不调接口', async () => {
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.nickname-edit-btn').trigger('click')
    expect(wrapper.find('.nickname-edit-input').exists()).toBe(true)
    await wrapper.find('.confirm-btn-cancel').trigger('click')
    expect(wrapper.find('.nickname-edit-input').exists()).toBe(false)
    expect(updateProfile as any).not.toHaveBeenCalled()
  })

  it('改昵称 + 确认 → 调 updateProfile 并刷新 + 展示同步', async () => {
    ;(updateProfile as any).mockResolvedValue({ code: 0 })
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.nickname-edit-btn').trigger('click')
    const input = wrapper.find('.nickname-edit-input')
    await input.setValue('小红')
    await wrapper.find('.confirm-btn-save').trigger('click')
    // confirm 路径两段 await（updateProfile → fetchUserInfo），多 flush 几次 drain
    await flush()
    await flush()
    expect(updateProfile as any).toHaveBeenCalledWith({ nickname: '小红' })
    const userStore = useUserStore()
    expect(userStore.fetchUserInfo).toHaveBeenCalled()
    // 弹窗关闭 + 展示更新为新昵称
    expect(wrapper.find('.nickname-edit-input').exists()).toBe(false)
    expect(wrapper.find('.nickname-display-value').text()).toBe('小红')
  })

  it('值未变 + 确认 → 不发请求', async () => {
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.nickname-edit-btn').trigger('click')
    // 不改值（仍是"小明"），直接确认
    await wrapper.find('.confirm-btn-save').trigger('click')
    await flush()
    expect(updateProfile as any).not.toHaveBeenCalled()
    expect(wrapper.find('.nickname-edit-input').exists()).toBe(false)
  })

  it('清空昵称 + 确认 → 必填守卫，不发请求', async () => {
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.nickname-edit-btn').trigger('click')
    const input = wrapper.find('.nickname-edit-input')
    await input.setValue('   ') // 仅空白 → trim 后为空
    await wrapper.find('.confirm-btn-save').trigger('click')
    await flush()
    expect(updateProfile as any).not.toHaveBeenCalled()
    // 弹窗仍开着（未通过校验）
    expect(wrapper.find('.nickname-edit-input').exists()).toBe(true)
  })

  it('IME 组合中回车不提交；普通回车才确认', async () => {
    ;(updateProfile as any).mockResolvedValue({ code: 0 })
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.nickname-edit-btn').trigger('click')
    const input = wrapper.find('.nickname-edit-input')
    await input.setValue('小红')

    // 1a) compositionstart 置 nicknameImeComposing=true → 即便 keydown 不带 isComposing
    //     也不提交（独立验证 ref 守卫分支，不只是 event.isComposing）
    await input.trigger('compositionstart')
    await input.trigger('keydown.enter')
    await flush()
    expect(updateProfile as any).not.toHaveBeenCalled()
    expect(wrapper.find('.nickname-edit-input').exists()).toBe(true) // 弹窗仍开着

    // 1b) 事件自带 isComposing=true 也不提交
    await input.trigger('keydown.enter', { isComposing: true })
    await flush()
    expect(updateProfile as any).not.toHaveBeenCalled()

    // 2) compositionend 复位 + 普通回车（非组合）→ 确认提交
    await input.trigger('compositionend')
    await input.trigger('keydown.enter')
    await flush()
    await flush()
    expect(updateProfile as any).toHaveBeenCalledWith({ nickname: '小红' })
  })

  it('字符计数与 maxlength 上限为 10', async () => {
    const wrapper = mountSettings()
    await flush()
    await wrapper.find('.nickname-edit-btn').trigger('click')
    // 用结尾匹配区分 /10 与 /100
    expect(wrapper.find('.nickname-edit-counter').text()).toMatch(/\/10$/)
    expect(wrapper.find('.nickname-edit-input').attributes('maxlength')).toBe('10')
  })
})
