/**
 * EmptyStateCard 组件单元测试
 *
 * 覆盖：
 *   1. 必填 title 渲染
 *   2. 可选 message 渲染
 *   3. 无 message 不渲染 <p>
 *   4. 默认 variant='empty' icon '○'
 *   5. variant='error' icon '⚠' + 错误样式类
 *   6. 自定义 icon 覆盖 variant 默认
 *   7. actionLabel 渲染 CTA 按钮
 *   8. 无 actionLabel 不渲染按钮
 *   9. 点击 CTA 触发 action emit
 *  10. actionDisabled 禁用按钮
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyStateCard from '../EmptyStateCard.vue'

describe('EmptyStateCard — 基础渲染', () => {
  it('渲染必填 title', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '暂无数据' }
    })
    expect(wrapper.find('.empty-state-title').text()).toBe('暂无数据')
  })

  it('可选 message 渲染', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '标题', message: '描述文字' }
    })
    expect(wrapper.find('.empty-state-message').text()).toBe('描述文字')
  })

  it('无 message 时不渲染 <p>', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '只有标题' }
    })
    expect(wrapper.find('.empty-state-message').exists()).toBe(false)
  })
})

describe('EmptyStateCard — variant', () => {
  it('默认 variant="empty"，icon 为 "○"', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '暂无' }
    })
    expect(wrapper.classes()).toContain('empty-state-card--empty')
    expect(wrapper.find('.empty-state-icon').text()).toBe('○')
  })

  it('variant="error"，icon 为 "⚠" + error 样式类', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '加载失败', variant: 'error' }
    })
    expect(wrapper.classes()).toContain('empty-state-card--error')
    expect(wrapper.find('.empty-state-icon').text()).toBe('⚠')
  })

  it('自定义 icon 覆盖 variant 默认', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '自定义', icon: '🎉' }
    })
    expect(wrapper.find('.empty-state-icon').text()).toBe('🎉')
  })
})

describe('EmptyStateCard — CTA 按钮', () => {
  it('actionLabel 渲染 CTA 按钮', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '失败', actionLabel: '重试' }
    })
    expect(wrapper.find('.empty-state-action').exists()).toBe(true)
    expect(wrapper.find('.empty-state-action').text()).toBe('重试')
  })

  it('无 actionLabel 不渲染按钮', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '无按钮' }
    })
    expect(wrapper.find('.empty-state-action').exists()).toBe(false)
  })

  it('点击 CTA 按钮触发 action emit', async () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '失败', actionLabel: '重试' }
    })
    await wrapper.find('.empty-state-action').trigger('click')
    expect(wrapper.emitted('action')).toBeTruthy()
  })

  it('actionDisabled 禁用按钮', () => {
    const wrapper = mount(EmptyStateCard, {
      props: { title: '失败', actionLabel: '重试', actionDisabled: true }
    })
    const btn = wrapper.find('.empty-state-action').element as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
