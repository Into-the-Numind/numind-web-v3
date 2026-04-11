/**
 * ToolbarActions 组件单元测试
 *
 * 覆盖：
 *   1-4. 各按钮按 props 显示/隐藏
 *   5-8. 点击各按钮触发对应 emit
 *   9. regenerate 默认文案
 *  10. regenerate 脏状态 + 有书签 → "将删除书签"警告文案
 *  11. regenerate 脏状态但无书签 → 保持默认文案
 *  12. regenerate 有书签但未脏 → 保持默认文案
 *  13. nextLabel 自定义
 *  14. regenerate 警告态有 warning class
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolbarActions from '../ToolbarActions.vue'

function mountComponent(overrides: Record<string, unknown> = {}) {
  return mount(ToolbarActions, {
    props: {
      canRegenerate: false,
      canCopy: false,
      canGoPrev: false,
      canGoNext: false,
      isDirty: false,
      hasBookmark: false,
      ...overrides
    }
  })
}

describe('ToolbarActions — 显示/隐藏', () => {
  it('所有 can* 为 false 时无按钮显示', () => {
    const wrapper = mountComponent()
    expect(wrapper.findAll('button').length).toBe(0)
  })

  it('canGoPrev 控制上一步按钮', () => {
    const wrapper = mountComponent({ canGoPrev: true })
    expect(wrapper.text()).toContain('上一步')
  })

  it('canCopy 控制复制按钮', () => {
    const wrapper = mountComponent({ canCopy: true })
    expect(wrapper.text()).toContain('复制')
  })

  it('canRegenerate / canGoNext 分别控制按钮', () => {
    const wrapper = mountComponent({ canRegenerate: true, canGoNext: true })
    expect(wrapper.text()).toContain('重新生成')
    expect(wrapper.text()).toContain('下一步')
  })
})

describe('ToolbarActions — 点击事件', () => {
  it('点击上一步触发 prev emit', async () => {
    const wrapper = mountComponent({ canGoPrev: true })
    await wrapper.find('.toolbar-btn--secondary').trigger('click')
    expect(wrapper.emitted('prev')).toBeTruthy()
  })

  it('点击复制触发 copy emit', async () => {
    const wrapper = mountComponent({ canCopy: true })
    await wrapper.get('button[aria-label="复制输出到剪贴板"]').trigger('click')
    expect(wrapper.emitted('copy')).toBeTruthy()
  })

  it('点击重新生成触发 regenerate emit', async () => {
    const wrapper = mountComponent({ canRegenerate: true })
    const btns = wrapper.findAll('.toolbar-btn--ghost')
    await btns[0].trigger('click')
    expect(wrapper.emitted('regenerate')).toBeTruthy()
  })

  it('点击下一步触发 next emit', async () => {
    const wrapper = mountComponent({ canGoNext: true })
    await wrapper.find('.toolbar-btn--primary').trigger('click')
    expect(wrapper.emitted('next')).toBeTruthy()
  })
})

describe('ToolbarActions — Regenerate 文案', () => {
  it('默认文案"重新生成"', () => {
    const wrapper = mountComponent({ canRegenerate: true })
    expect(wrapper.text()).toContain('重新生成')
    expect(wrapper.text()).not.toContain('将删除书签')
  })

  it('脏状态 + 有书签 → "将删除书签"警告文案', () => {
    const wrapper = mountComponent({
      canRegenerate: true,
      isDirty: true,
      hasBookmark: true
    })
    expect(wrapper.text()).toContain('重新生成（将删除书签）')
  })

  it('脏状态但无书签 → 保持默认文案', () => {
    const wrapper = mountComponent({
      canRegenerate: true,
      isDirty: true,
      hasBookmark: false
    })
    expect(wrapper.text()).toContain('重新生成')
    expect(wrapper.text()).not.toContain('将删除书签')
  })

  it('有书签但未脏 → 保持默认文案', () => {
    const wrapper = mountComponent({
      canRegenerate: true,
      isDirty: false,
      hasBookmark: true
    })
    expect(wrapper.text()).toContain('重新生成')
    expect(wrapper.text()).not.toContain('将删除书签')
  })

  it('警告状态 regenerate 按钮有 warning class', () => {
    const wrapper = mountComponent({
      canRegenerate: true,
      isDirty: true,
      hasBookmark: true
    })
    const btns = wrapper.findAll('.toolbar-btn--ghost')
    // 第一个 ghost 按钮就是 regenerate（canCopy=false 时）
    expect(btns[0].classes()).toContain('toolbar-btn--warning')
  })
})

describe('ToolbarActions — nextLabel 自定义', () => {
  it('nextLabel 支持自定义文案', () => {
    const wrapper = mountComponent({
      canGoNext: true,
      nextLabel: '开始对话'
    })
    expect(wrapper.find('.toolbar-btn--primary').text()).toContain('开始对话')
  })
})
