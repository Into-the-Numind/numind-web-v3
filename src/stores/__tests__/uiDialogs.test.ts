/**
 * uiDialogs store 单元测试
 *
 * 覆盖：
 *   1. 初始状态 showCreditsDialog=false, creditsMessage=''
 *   2. openCreditsDialog 带 message 设置两个 ref
 *   3. openCreditsDialog 不带 message 使用空字符串
 *   4. closeCreditsDialog 重置 showCreditsDialog 但保留 message（可被下次 open 覆盖）
 *   5. 连续 open 更新 message
 *   6. 多实例独立（但 defineStore 内部 state 共享，应验证 store singleton 行为）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiDialogsStore } from '../uiDialogs'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('uiDialogs store', () => {
  it('初始状态', () => {
    const store = useUiDialogsStore()
    expect(store.showCreditsDialog).toBe(false)
    expect(store.creditsMessage).toBe('')
  })

  it('openCreditsDialog 带 message 同时设置 show 和 message', () => {
    const store = useUiDialogsStore()
    store.openCreditsDialog('积分不足，请充值')
    expect(store.showCreditsDialog).toBe(true)
    expect(store.creditsMessage).toBe('积分不足，请充值')
  })

  it('openCreditsDialog 不传 message 使用空字符串', () => {
    const store = useUiDialogsStore()
    store.openCreditsDialog()
    expect(store.showCreditsDialog).toBe(true)
    expect(store.creditsMessage).toBe('')
  })

  it('closeCreditsDialog 重置 showCreditsDialog', () => {
    const store = useUiDialogsStore()
    store.openCreditsDialog('test')
    expect(store.showCreditsDialog).toBe(true)

    store.closeCreditsDialog()
    expect(store.showCreditsDialog).toBe(false)
    // message 保留（不清理），允许 dialog 组件在消失动画期间读取
    expect(store.creditsMessage).toBe('test')
  })

  it('连续 open 正确更新 message', () => {
    const store = useUiDialogsStore()
    store.openCreditsDialog('第一条消息')
    store.closeCreditsDialog()
    store.openCreditsDialog('第二条消息')
    expect(store.showCreditsDialog).toBe(true)
    expect(store.creditsMessage).toBe('第二条消息')
  })

  it('在相同 Pinia 实例下 useUiDialogsStore 返回同一个 store（singleton）', () => {
    const store1 = useUiDialogsStore()
    const store2 = useUiDialogsStore()
    // Pinia store 在同一个 Pinia 实例下是 singleton
    store1.openCreditsDialog('shared')
    expect(store2.showCreditsDialog).toBe(true)
    expect(store2.creditsMessage).toBe('shared')
  })

  it('不同 Pinia 实例之间状态独立（beforeEach 清理）', () => {
    // beforeEach 已经在每个测试前创建新的 Pinia，这里验证
    const store = useUiDialogsStore()
    expect(store.showCreditsDialog).toBe(false) // 上一个测试的状态不会泄漏
  })
})
