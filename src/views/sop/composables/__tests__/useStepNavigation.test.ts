/**
 * useStepNavigation 单元测试
 *
 * 覆盖：
 *
 * canAccessStep 权限规则 (9)：
 *   1. 下一个待执行节点 → true
 *   2. 已完成节点 → true
 *   3. 已完成但被 is_accessible=false 禁用 → false
 *   4. 未完成且非下一个 → false
 *   5. trailing chat 启用且全部完成 → true
 *   6. trailing chat 启用但未全部完成 → false
 *   7. trailing chat 未启用 → false
 *   8. stepIndex 越界 → false
 *   9. 空 nodes 列表边界
 *
 * setActiveStep (3)：
 *   10. 可访问时更新 store.currentStep + 持久化
 *   11. 不可访问时 no-op 并返回 false
 *   12. 不传 scope 时仅更新 store 不持久化
 *
 * restoreFromSession (4)：
 *   13. 成功恢复到可访问步骤
 *   14. session 无记录返回 false 不改 store
 *   15. session 值不可访问时返回 false
 *   16. draft 和 run scope 使用不同 sessionStorage key
 *
 * 其他 (2)：
 *   17. clearSession
 *   18. sessionStorage 禁用时静默失败不抛异常
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { useStepNavigation, type StepNavigationStore } from '../useStepNavigation'

/**
 * 构造一个 fake store（符合 StepNavigationStore 接口），用于单测。
 *
 * 默认场景：3 个节点，trailing chat 启用，没有任何节点完成，
 * nextNodeId 指向第一个节点。
 */
function makeFakeStore(
  overrides: {
    nodes?: Array<{ id: number }>
    currentStep?: number
    totalSteps?: number
    completedNodeIds?: Set<number>
    nextNodeId?: number | null
    nodeAccessibility?: Record<number, boolean>
    trailingChatEnabled?: boolean
  } = {}
): StepNavigationStore {
  const nodes = overrides.nodes ?? [{ id: 1 }, { id: 2 }, { id: 3 }]
  return {
    nodes: ref(nodes),
    currentStep: ref(overrides.currentStep ?? 1),
    totalSteps: ref(
      overrides.totalSteps ?? nodes.length + (overrides.trailingChatEnabled !== false ? 1 : 0)
    ),
    completedNodeIds: ref(overrides.completedNodeIds ?? new Set<number>()),
    nextNodeId: ref(overrides.nextNodeId ?? nodes[0]?.id ?? null),
    nodeAccessibility: ref(overrides.nodeAccessibility ?? {}),
    trailingChatEnabled: ref(overrides.trailingChatEnabled ?? true)
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('useStepNavigation — canAccessStep', () => {
  it('下一个待执行节点可访问', () => {
    const store = makeFakeStore({ nextNodeId: 1 })
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(1)).toBe(true)
  })

  it('已完成节点默认可访问', () => {
    const store = makeFakeStore({
      completedNodeIds: new Set([1, 2]),
      nextNodeId: 3
    })
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(1)).toBe(true)
    expect(nav.canAccessStep(2)).toBe(true)
    expect(nav.canAccessStep(3)).toBe(true) // 下一个
  })

  it('已完成节点被 is_accessible=false 显式禁用', () => {
    const store = makeFakeStore({
      completedNodeIds: new Set([1, 2]),
      nodeAccessibility: { 2: false },
      nextNodeId: 3
    })
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(1)).toBe(true) // 已完成且未被禁用
    expect(nav.canAccessStep(2)).toBe(false) // 已完成但被禁用
    expect(nav.canAccessStep(3)).toBe(true) // 下一个
  })

  it('未完成且非下一个节点不可访问', () => {
    const store = makeFakeStore({
      completedNodeIds: new Set([1]),
      nextNodeId: 2
    })
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(3)).toBe(false) // 未完成且非下一个
  })

  it('trailing chat 启用且所有节点完成时可访问', () => {
    const store = makeFakeStore({
      completedNodeIds: new Set([1, 2, 3]),
      nextNodeId: null,
      trailingChatEnabled: true
    })
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(4)).toBe(true) // trailing chat = 第 4 步
  })

  it('trailing chat 启用但未全部完成时不可访问', () => {
    const store = makeFakeStore({
      completedNodeIds: new Set([1, 2]), // 还差第 3 个
      nextNodeId: 3,
      trailingChatEnabled: true
    })
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(4)).toBe(false)
  })

  it('trailing chat 未启用时即使全部完成也不可访问', () => {
    const store = makeFakeStore({
      completedNodeIds: new Set([1, 2, 3]),
      nextNodeId: null,
      trailingChatEnabled: false,
      totalSteps: 3 // 没有 trailing chat
    })
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(4)).toBe(false) // 越界
  })

  it('stepIndex 越界返回 false', () => {
    const store = makeFakeStore({})
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(0)).toBe(false)
    expect(nav.canAccessStep(-1)).toBe(false)
    expect(nav.canAccessStep(999)).toBe(false)
  })

  it('空 nodes 列表时所有步骤不可访问', () => {
    const store = makeFakeStore({
      nodes: [],
      nextNodeId: null,
      totalSteps: 1, // 只有 trailing chat
      trailingChatEnabled: true
    })
    const nav = useStepNavigation(store)
    expect(nav.canAccessStep(1)).toBe(false) // trailing chat 需要至少一个节点完成
  })
})

describe('useStepNavigation — setActiveStep', () => {
  it('可访问时更新 store.currentStep + 持久化', () => {
    const store = makeFakeStore({
      completedNodeIds: new Set([1]),
      nextNodeId: 2,
      currentStep: 1
    })
    const nav = useStepNavigation(store)

    const result = nav.setActiveStep(2, { kind: 'run', runId: 100 })

    expect(result).toBe(true)
    expect(store.currentStep.value).toBe(2)
    expect(sessionStorage.getItem('sop_step_100')).toBe('2')
  })

  it('不可访问时 no-op 并返回 false', () => {
    const store = makeFakeStore({
      nextNodeId: 1,
      currentStep: 1
    })
    const nav = useStepNavigation(store)

    const result = nav.setActiveStep(3, { kind: 'run', runId: 100 }) // 未完成且非下一个

    expect(result).toBe(false)
    expect(store.currentStep.value).toBe(1) // 保持原值
    expect(sessionStorage.getItem('sop_step_100')).toBe(null)
  })

  it('不传 scope 时仅更新 store 不持久化', () => {
    const store = makeFakeStore({
      nextNodeId: 1,
      currentStep: 1
    })
    const nav = useStepNavigation(store)

    nav.setActiveStep(1) // 不传 scope

    expect(store.currentStep.value).toBe(1)
    // 没有 sessionStorage 记录
    expect(sessionStorage.length).toBe(0)
  })
})

describe('useStepNavigation — restoreFromSession', () => {
  it('成功恢复到可访问步骤', () => {
    const store = makeFakeStore({
      completedNodeIds: new Set([1]),
      nextNodeId: 2,
      currentStep: 1
    })
    sessionStorage.setItem('sop_step_100', '2')

    const nav = useStepNavigation(store)
    const restored = nav.restoreFromSession({ kind: 'run', runId: 100 })

    expect(restored).toBe(true)
    expect(store.currentStep.value).toBe(2)
  })

  it('session 无记录返回 false，store 保持原值', () => {
    const store = makeFakeStore({ currentStep: 1 })
    const nav = useStepNavigation(store)

    const restored = nav.restoreFromSession({ kind: 'run', runId: 100 })

    expect(restored).toBe(false)
    expect(store.currentStep.value).toBe(1)
  })

  it('session 值不可访问时返回 false 不改 store', () => {
    const store = makeFakeStore({
      nextNodeId: 1, // 只允许第 1 步
      currentStep: 1
    })
    sessionStorage.setItem('sop_step_100', '3') // 不可访问

    const nav = useStepNavigation(store)
    const restored = nav.restoreFromSession({ kind: 'run', runId: 100 })

    expect(restored).toBe(false)
    expect(store.currentStep.value).toBe(1)
  })

  it('draft 和 run scope 使用不同 sessionStorage key', () => {
    const store1 = makeFakeStore({ nextNodeId: 1 })
    const store2 = makeFakeStore({ nextNodeId: 1 })
    const nav1 = useStepNavigation(store1)
    const nav2 = useStepNavigation(store2)

    nav1.setActiveStep(1, { kind: 'draft', templateId: 42 })
    nav2.setActiveStep(1, { kind: 'run', runId: 100 })

    expect(sessionStorage.getItem('sop_step_draft_42')).toBe('1')
    expect(sessionStorage.getItem('sop_step_100')).toBe('1')
  })

  it('session 值非数字时返回 false', () => {
    const store = makeFakeStore({ currentStep: 1 })
    sessionStorage.setItem('sop_step_100', 'not-a-number')

    const nav = useStepNavigation(store)
    const restored = nav.restoreFromSession({ kind: 'run', runId: 100 })

    expect(restored).toBe(false)
    expect(store.currentStep.value).toBe(1)
  })
})

describe('useStepNavigation — 其他', () => {
  it('clearSession 删除指定 scope 的记录', () => {
    sessionStorage.setItem('sop_step_100', '2')
    sessionStorage.setItem('sop_step_200', '3')

    const store = makeFakeStore({})
    const nav = useStepNavigation(store)
    nav.clearSession({ kind: 'run', runId: 100 })

    expect(sessionStorage.getItem('sop_step_100')).toBe(null)
    expect(sessionStorage.getItem('sop_step_200')).toBe('3') // 不受影响
  })

  it('sessionStorage 抛异常时静默失败不影响 store', () => {
    const store = makeFakeStore({ nextNodeId: 1 })
    const nav = useStepNavigation(store)

    // mock sessionStorage.setItem 抛异常（模拟隐私模式 / quota 超限）
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    // 不应抛异常
    expect(() => nav.setActiveStep(1, { kind: 'run', runId: 100 })).not.toThrow()
    // store 仍然被更新
    expect(store.currentStep.value).toBe(1)

    spy.mockRestore()
  })
})
