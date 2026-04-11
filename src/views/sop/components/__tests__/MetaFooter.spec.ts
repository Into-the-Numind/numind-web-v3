/**
 * MetaFooter 组件单元测试（F6）
 *
 * 覆盖：
 *   1. 全字段渲染：4 segments 按顺序出现（clock → cpu → coins → timestamp）
 *   2. modelName === '' → 整段不渲染
 *   3. modelName === undefined → 整段不渲染
 *   4. latencyMs === 0 → 整段不渲染
 *   5. latencyMs === undefined → 整段不渲染
 *   6. 全字段顺序严格：耗时 在最前
 *   7. totalTokens === 0 → tokens 段不渲染但其他照常
 *   8. totalTokens === undefined → tokens 段不渲染
 *   9. completedAt === '' → 时间段不渲染
 *  10. 耗时格式：7400ms → "7.4s"
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MetaFooter from '../MetaFooter.vue'

describe('MetaFooter', () => {
  it('renders all segments in order when fully populated', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        latencyMs: 7400,
        modelName: 'glm-4-7',
        totalTokens: 586,
        completedAt: '14:33:12'
      }
    })
    const text = wrapper.text()
    expect(text).toContain('耗时 7.4s')
    expect(text).toContain('glm-4-7')
    expect(text).toContain('586 tokens')
    expect(text).toContain('14:33:12 完成')

    // 顺序：耗时 < 模型 < tokens < 时间戳
    const iLatency = text.indexOf('耗时')
    const iModel = text.indexOf('glm-4-7')
    const iTokens = text.indexOf('586')
    const iTime = text.indexOf('14:33:12')
    expect(iLatency).toBeGreaterThanOrEqual(0)
    expect(iLatency).toBeLessThan(iModel)
    expect(iModel).toBeLessThan(iTokens)
    expect(iTokens).toBeLessThan(iTime)
  })

  it('hides entire row when modelName is empty string (R7 fallback)', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        latencyMs: 7400,
        modelName: '',
        totalTokens: 586,
        completedAt: '14:33:12'
      }
    })
    expect(wrapper.find('.meta-footer').exists()).toBe(false)
  })

  it('hides entire row when modelName is undefined', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        latencyMs: 7400,
        totalTokens: 586,
        completedAt: '14:33:12'
      }
    })
    expect(wrapper.find('.meta-footer').exists()).toBe(false)
  })

  it('hides entire row when latencyMs is 0 (R7 fallback)', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        latencyMs: 0,
        modelName: 'glm-4-7',
        totalTokens: 586,
        completedAt: '14:33:12'
      }
    })
    expect(wrapper.find('.meta-footer').exists()).toBe(false)
  })

  it('hides entire row when latencyMs is undefined', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        modelName: 'glm-4-7',
        totalTokens: 586,
        completedAt: '14:33:12'
      }
    })
    expect(wrapper.find('.meta-footer').exists()).toBe(false)
  })

  it('renders row but hides tokens segment when totalTokens is 0', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        latencyMs: 7400,
        modelName: 'glm-4-7',
        totalTokens: 0,
        completedAt: '14:33:12'
      }
    })
    expect(wrapper.find('.meta-footer').exists()).toBe(true)
    const text = wrapper.text()
    expect(text).toContain('耗时 7.4s')
    expect(text).toContain('glm-4-7')
    expect(text).not.toContain('tokens')
    expect(text).toContain('14:33:12 完成')
  })

  it('hides tokens segment when totalTokens is undefined', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        latencyMs: 7400,
        modelName: 'glm-4-7',
        completedAt: '14:33:12'
      }
    })
    expect(wrapper.find('.meta-footer').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('tokens')
  })

  it('hides completed timestamp when completedAt is empty', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        latencyMs: 7400,
        modelName: 'glm-4-7',
        totalTokens: 586,
        completedAt: ''
      }
    })
    expect(wrapper.find('.meta-footer').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('完成')
  })

  it('formats latency correctly (1500ms → 1.5s)', () => {
    const wrapper = mount(MetaFooter, {
      props: {
        latencyMs: 1500,
        modelName: 'qwen-plus'
      }
    })
    expect(wrapper.text()).toContain('耗时 1.5s')
  })
})
