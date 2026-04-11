/**
 * StepperPanel 组件单元测试
 *
 * 覆盖：
 *
 * 渲染 (5)：
 *   1. 渲染正确数量的步骤（nodes.length + trailing chat）
 *   2. trailingChatEnabled=false 时不渲染第 N+1 步
 *   3. 节点 name 为空时 fallback 到 "步骤 N"
 *   4. 长 label 截断（max-width + ellipsis 通过 class 验证）
 *   5. 空 nodes 数组时列表为空（即使 trailingChatEnabled=true）
 *
 * 状态类 (4)：
 *   6. is-active 标记当前步骤
 *   7. is-completed 标记已完成节点
 *   8. is-disabled 标记不可访问节点
 *   9. is-chat 标记 trailing chat 步骤
 *
 * 可访问性计算 (4)：
 *  10. 已完成节点默认 accessible
 *  11. 已完成节点被 accessibility[id]=false 显式禁用
 *  12. 未完成但 id === nextNodeId 的节点 accessible
 *  13. 未完成且非 nextNodeId 的节点不 accessible
 *
 * trailing chat 可访问性 (3)：
 *  14. 所有节点完成时 chat 可访问
 *  15. 部分完成时 chat 不可访问
 *  16. 空 nodes 时 chat 不显示
 *
 * 交互 (3)：
 *  17. 点击可访问步骤触发 navigate emit
 *  18. 点击不可访问步骤不触发 emit
 *  19. 点击 active 步骤也触发 emit（让父组件决定）
 *
 * ARIA (2)：
 *  20. current step 有 aria-current="step"
 *  21. aria-label 包含步骤编号 + 标题
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import StepperPanel from '../StepperPanel.vue'
import type { SopNodePublic } from '@/views/sop/types'

function makeNode(overrides: Partial<SopNodePublic> = {}): SopNodePublic {
  return {
    id: 1,
    template_id: 1,
    name: 'Step 1',
    description: '',
    sort: 0,
    status: 'active',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides
  }
}

function makeSteps(count: number): SopNodePublic[] {
  return Array.from({ length: count }, (_, i) =>
    makeNode({ id: i + 1, name: `Step ${i + 1}`, sort: i })
  )
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    steps: makeSteps(3),
    trailingChatEnabled: true,
    currentStep: 1,
    completedIds: new Set<number>(),
    accessibility: {} as Record<number, boolean>,
    nextNodeId: 1 as number | null,
    ...overrides
  }
}

beforeEach(() => {
  // 每个测试独立，无需清理
})

describe('StepperPanel — 渲染', () => {
  it('渲染 nodes.length + trailing chat 个步骤', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(4),
        trailingChatEnabled: true
      })
    })
    const items = wrapper.findAll('.stepper-item')
    expect(items.length).toBe(5) // 4 nodes + 1 chat
  })

  it('trailingChatEnabled=false 时不渲染 trailing chat', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(4),
        trailingChatEnabled: false
      })
    })
    expect(wrapper.findAll('.stepper-item').length).toBe(4)
    expect(wrapper.find('.is-chat').exists()).toBe(false)
  })

  it('节点 name 为空时 fallback 到 "步骤 N"', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: [makeNode({ id: 1, name: '' })],
        trailingChatEnabled: false,
        nextNodeId: 1
      })
    })
    const label = wrapper.find('.stepper-label').text()
    expect(label).toBe('步骤 1')
  })

  it('长 label 截断通过 ellipsis CSS 实现（DOM 中保留完整文本）', () => {
    const longName = 'A'.repeat(100)
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: [makeNode({ id: 1, name: longName })],
        trailingChatEnabled: false,
        nextNodeId: 1
      })
    })
    // 完整文本保留在 DOM，CSS max-width + ellipsis 处理截断
    expect(wrapper.find('.stepper-label').text()).toBe(longName)
  })

  it('空 nodes 数组时不显示 trailing chat（即使启用）', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: [],
        trailingChatEnabled: true,
        currentStep: 1,
        completedIds: new Set(),
        accessibility: {},
        nextNodeId: null
      })
    })
    expect(wrapper.findAll('.stepper-item').length).toBe(0)
  })
})

describe('StepperPanel — 状态类', () => {
  it('is-active 标记当前步骤', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        currentStep: 2,
        completedIds: new Set([1]),
        nextNodeId: 2
      })
    })
    const items = wrapper.findAll('.stepper-item')
    expect(items[0].classes()).not.toContain('is-active')
    expect(items[1].classes()).toContain('is-active')
    expect(items[2].classes()).not.toContain('is-active')
  })

  it('is-completed 标记已完成节点', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set([1, 2]),
        nextNodeId: 3
      })
    })
    const items = wrapper.findAll('.stepper-item')
    expect(items[0].classes()).toContain('is-completed')
    expect(items[1].classes()).toContain('is-completed')
    expect(items[2].classes()).not.toContain('is-completed')
  })

  it('is-disabled 标记不可访问节点', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set(),
        nextNodeId: 1
      })
    })
    const items = wrapper.findAll('.stepper-item')
    // 第 1 个 = nextNodeId，可访问
    expect(items[0].classes()).not.toContain('is-disabled')
    // 第 2、3 个 = 未完成且非 nextNodeId，不可访问
    expect(items[1].classes()).toContain('is-disabled')
    expect(items[2].classes()).toContain('is-disabled')
  })

  it('is-chat 标记 trailing chat 步骤', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(2),
        trailingChatEnabled: true
      })
    })
    const items = wrapper.findAll('.stepper-item')
    expect(items.length).toBe(3) // 2 nodes + 1 chat
    expect(items[2].classes()).toContain('is-chat')
  })
})

describe('StepperPanel — 可访问性计算', () => {
  it('已完成节点默认 accessible（button 未 disabled）', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set([1, 2]),
        accessibility: {},
        nextNodeId: 3
      })
    })
    const buttons = wrapper.findAll('.stepper-button')
    expect((buttons[0].element as HTMLButtonElement).disabled).toBe(false)
    expect((buttons[1].element as HTMLButtonElement).disabled).toBe(false)
  })

  it('已完成节点被 accessibility[id]=false 显式禁用', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set([1, 2]),
        accessibility: { 2: false },
        nextNodeId: 3
      })
    })
    const buttons = wrapper.findAll('.stepper-button')
    expect((buttons[0].element as HTMLButtonElement).disabled).toBe(false)
    expect((buttons[1].element as HTMLButtonElement).disabled).toBe(true)
  })

  it('未完成但 id === nextNodeId 的节点 accessible', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set(),
        nextNodeId: 2 // 第二个节点是 next
      })
    })
    const buttons = wrapper.findAll('.stepper-button')
    expect((buttons[0].element as HTMLButtonElement).disabled).toBe(true)
    expect((buttons[1].element as HTMLButtonElement).disabled).toBe(false) // nextNodeId
    expect((buttons[2].element as HTMLButtonElement).disabled).toBe(true)
  })

  it('未完成且非 nextNodeId 的节点不 accessible', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set(),
        nextNodeId: 1
      })
    })
    const buttons = wrapper.findAll('.stepper-button')
    expect((buttons[1].element as HTMLButtonElement).disabled).toBe(true)
    expect((buttons[2].element as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('StepperPanel — trailing chat 可访问性', () => {
  it('所有节点完成时 chat 可访问', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set([1, 2, 3]),
        nextNodeId: null
      })
    })
    const chatButton = wrapper.findAll('.stepper-button')[3]
    expect((chatButton.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('部分完成时 chat 不可访问', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set([1, 2]), // 缺第 3 个
        nextNodeId: 3
      })
    })
    const chatButton = wrapper.findAll('.stepper-button')[3]
    expect((chatButton.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('空 nodes 时 chat 不显示（即使启用）', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: [],
        trailingChatEnabled: true,
        nextNodeId: null
      })
    })
    expect(wrapper.find('.is-chat').exists()).toBe(false)
  })
})

describe('StepperPanel — 交互', () => {
  it('点击可访问步骤触发 navigate emit', async () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set([1]),
        nextNodeId: 2
      })
    })
    // 点击第 2 步（nextNodeId，可访问）
    await wrapper.findAll('.stepper-button')[1].trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')?.[0]).toEqual([2])
  })

  it('点击不可访问步骤不触发 emit', async () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        completedIds: new Set(),
        nextNodeId: 1
      })
    })
    // 第 3 步不可访问
    await wrapper.findAll('.stepper-button')[2].trigger('click')
    expect(wrapper.emitted('navigate')).toBeFalsy()
  })

  it('点击 active 步骤也触发 emit（父组件决定是否处理）', async () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        currentStep: 1,
        completedIds: new Set(),
        nextNodeId: 1
      })
    })
    await wrapper.findAll('.stepper-button')[0].trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual([1])
  })
})

describe('StepperPanel — ARIA', () => {
  it('current step 有 aria-current="step"', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: makeSteps(3),
        currentStep: 2,
        completedIds: new Set([1]),
        nextNodeId: 2
      })
    })
    const buttons = wrapper.findAll('.stepper-button')
    expect(buttons[0].attributes('aria-current')).toBeUndefined()
    expect(buttons[1].attributes('aria-current')).toBe('step')
    expect(buttons[2].attributes('aria-current')).toBeUndefined()
  })

  it('aria-label 包含步骤编号和标题', () => {
    const wrapper = mount(StepperPanel, {
      props: defaultProps({
        steps: [makeNode({ id: 1, name: 'AI拆解产品' })],
        trailingChatEnabled: false,
        nextNodeId: 1
      })
    })
    const button = wrapper.find('.stepper-button')
    expect(button.attributes('aria-label')).toBe('步骤 1：AI拆解产品')
  })
})
