/**
 * StepNav 组件 + computeStepState 纯函数单测（F3 task）
 *
 * 覆盖：
 *   A. computeStepState 纯函数（10+ 用例）：
 *      1. 初始: currentStep=1, viewingStep=1, 无 completed → step1='active', step2='disabled'
 *      2. 已执行 step1 中的状态: currentStep=2, viewingStep=2, completed=[1]
 *         → step1='done', step2='active', step3='disabled'
 *      3. viewing 历史: currentStep=2, viewingStep=1, completed=[1]
 *         → step1='viewing', step2='pending-return', step3='disabled'
 *      4. trailing active: currentStep=4 (trailing), viewingStep=4, completed=[1,2,3]
 *         → step1-3='done', trailing='active'
 *      5. streaming: currentStep=2, viewingStep=2, streamingNodeId=节点2
 *         → step2='active'（streaming 视为 active）
 *      6. trailing disabled（主流程未完）: currentStep=2, trailing='disabled'
 *      7. step beyond currentStep 一律 disabled
 *      8. viewing 未完成的历史步骤（理论上不会发生，但防御）→ 'active'
 *      9. done + currentStep 超前 + viewing 命中自身 currentStep
 *     10. viewing history → pending-return 命中 currentStep
 *     11. active 态的默认 fallback
 *
 *   B. StepNav.vue 渲染 + emit：
 *      12. 渲染主流程 + trailing chat（主 3 节点 + 追问 1）
 *      13. 点击非 disabled item 触发 'navigate' 携带正确 step
 *      14. disabled item 不触发 emit
 *      15. 5 态齐全渲染（data-step-state 属性）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import StepNav from '../StepNav.vue'
import { computeStepState } from '../stepNavState'
import type { SopNodePublic } from '@/views/sop/types'

function makeNode(id: number, name = `Step ${id}`): SopNodePublic {
  return {
    id,
    template_id: 1,
    name,
    description: `desc ${id}`,
    sort: id,
    status: 'active',
    created_at: '',
    updated_at: ''
  }
}

const THREE_NODES: SopNodePublic[] = [makeNode(1), makeNode(2), makeNode(3)]

describe('computeStepState (pure fn, spec 附录 B)', () => {
  it('case 1 — 初始 draft: step1=active, step2/3=disabled', () => {
    const completed = new Set<number>()
    expect(computeStepState(1, false, 1, 1, completed, THREE_NODES, null)).toBe('active')
    expect(computeStepState(2, false, 1, 1, completed, THREE_NODES, null)).toBe('disabled')
    expect(computeStepState(3, false, 1, 1, completed, THREE_NODES, null)).toBe('disabled')
  })

  it('case 2 — 执行完 step1: step1=done, step2=active, step3=disabled', () => {
    const completed = new Set<number>([1])
    expect(computeStepState(1, false, 2, 2, completed, THREE_NODES, null)).toBe('done')
    expect(computeStepState(2, false, 2, 2, completed, THREE_NODES, null)).toBe('active')
    expect(computeStepState(3, false, 2, 2, completed, THREE_NODES, null)).toBe('disabled')
  })

  it('case 3 — viewing 历史 step1: step1=viewing, step2=pending-return, step3=disabled', () => {
    const completed = new Set<number>([1])
    expect(computeStepState(1, false, 2, 1, completed, THREE_NODES, null)).toBe('viewing')
    expect(computeStepState(2, false, 2, 1, completed, THREE_NODES, null)).toBe('pending-return')
    expect(computeStepState(3, false, 2, 1, completed, THREE_NODES, null)).toBe('disabled')
  })

  it('case 4 — trailing chat active: nodes 全完, trailing=active', () => {
    const completed = new Set<number>([1, 2, 3])
    // currentStep=4 即 trailing 位置（nodes.length + 1）
    expect(computeStepState(1, false, 4, 4, completed, THREE_NODES, null)).toBe('done')
    expect(computeStepState(2, false, 4, 4, completed, THREE_NODES, null)).toBe('done')
    expect(computeStepState(3, false, 4, 4, completed, THREE_NODES, null)).toBe('done')
    expect(computeStepState(4, true, 4, 4, completed, THREE_NODES, null)).toBe('active')
  })

  it('case 5 — streaming 中的节点判为 active', () => {
    const completed = new Set<number>([])
    // node id = 2，currentStep 2, streamingNodeId 指向 node 2
    expect(computeStepState(2, false, 2, 2, completed, THREE_NODES, 2)).toBe('active')
  })

  it('case 6 — trailing chat disabled（主流程未完）', () => {
    const completed = new Set<number>([1])
    // currentStep=2, trailing 位置是 4, 未到
    expect(computeStepState(4, true, 2, 2, completed, THREE_NODES, null)).toBe('disabled')
  })

  it('case 7 — step beyond currentStep 一律 disabled', () => {
    const completed = new Set<number>([1])
    expect(computeStepState(3, false, 2, 2, completed, THREE_NODES, null)).toBe('disabled')
  })

  it('case 8 — viewing 未完成步骤（防御）→ active', () => {
    const completed = new Set<number>([]) // 空，未完成
    // currentStep=3, viewingStep=2, step2 未 complete → fallback active
    expect(computeStepState(2, false, 3, 2, completed, THREE_NODES, null)).toBe('active')
  })

  it('case 9 — 全部 done 后某步 done 命中', () => {
    const completed = new Set<number>([1, 2])
    // currentStep=3 viewing=3, step1/2 都是 done
    expect(computeStepState(1, false, 3, 3, completed, THREE_NODES, null)).toBe('done')
    expect(computeStepState(2, false, 3, 3, completed, THREE_NODES, null)).toBe('done')
    expect(computeStepState(3, false, 3, 3, completed, THREE_NODES, null)).toBe('active')
  })

  it('case 10 — viewing === currentStep 不出现 pending-return', () => {
    const completed = new Set<number>([1])
    // 常态：viewingStep === currentStep，无 pending-return
    expect(computeStepState(2, false, 2, 2, completed, THREE_NODES, null)).toBe('active')
  })

  it('case 11 — 完成当前步后查看历史：current 本身是完成态的 pending-return', () => {
    // 执行完 step1、step2，currentStep 推进到 3（假设最多 3 步且不继续推进）
    // viewing step1 → step1 viewing, step2 disabled??? 不，step2 在当前视角是 done
    const completed = new Set<number>([1, 2])
    expect(computeStepState(1, false, 3, 1, completed, THREE_NODES, null)).toBe('viewing')
    // step2 既不是 viewingStep 也不是 currentStep，但 completed → done
    expect(computeStepState(2, false, 3, 1, completed, THREE_NODES, null)).toBe('done')
    // step3 是 currentStep 且 viewing!=current → pending-return
    expect(computeStepState(3, false, 3, 1, completed, THREE_NODES, null)).toBe('pending-return')
  })

  it('case 11b — accessibility[node.id] === false → disabled (spec 附录 B)', () => {
    // step 2 本来会是 active（currentStep=3, completed=[1]），
    // 但服务端显式标记 node id=2 不可达 → 必须返回 disabled
    const completed = new Set<number>([1])
    const accessibility = { 2: false }
    expect(computeStepState(2, false, 3, 2, completed, THREE_NODES, null, accessibility)).toBe(
      'disabled'
    )
    // 对照组：没有 accessibility 参数时应为 active
    expect(computeStepState(2, false, 3, 2, completed, THREE_NODES, null)).toBe('active')
  })

  it('case 12 — 5 态全部覆盖校验（来自上述用例的聚合检查）', () => {
    const seen = new Set<string>()
    const completed1 = new Set<number>([1])
    seen.add(computeStepState(2, false, 2, 2, completed1, THREE_NODES, null)) // active
    seen.add(computeStepState(1, false, 2, 2, completed1, THREE_NODES, null)) // done
    seen.add(computeStepState(1, false, 2, 1, completed1, THREE_NODES, null)) // viewing
    seen.add(computeStepState(2, false, 2, 1, completed1, THREE_NODES, null)) // pending-return
    seen.add(computeStepState(3, false, 2, 2, completed1, THREE_NODES, null)) // disabled
    expect(seen).toEqual(new Set(['active', 'done', 'viewing', 'pending-return', 'disabled']))
  })
})

describe('StepNav.vue (component)', () => {
  function mountNav(
    opts: Partial<{
      currentStep: number
      viewingStep: number
      completedNodeIds: number[]
      trailingChatEnabled: boolean
      streamingNodeId: number | null
    }> = {}
  ) {
    return mount(StepNav, {
      props: {
        nodes: THREE_NODES,
        currentStep: opts.currentStep ?? 1,
        viewingStep: opts.viewingStep ?? 1,
        completedNodeIds: opts.completedNodeIds ?? [],
        trailingChatEnabled: opts.trailingChatEnabled ?? false,
        streamingNodeId: opts.streamingNodeId ?? null
      }
    })
  }

  it('渲染 3 个主节点 item', () => {
    const wrapper = mountNav()
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    expect(items.length).toBe(3)
  })

  it('trailingChatEnabled=true 时渲染第 4 个 trailing item', () => {
    const wrapper = mountNav({ trailingChatEnabled: true })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    expect(items.length).toBe(4)
  })

  it('点击 active item → emit navigate 携带正确 step', async () => {
    const wrapper = mountNav({
      currentStep: 2,
      viewingStep: 2,
      completedNodeIds: [1]
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    // step1 done → 可点
    await items[0].trigger('click')
    const emits = wrapper.emitted('navigate')
    expect(emits).toBeTruthy()
    expect(emits?.[0]).toEqual([1])
  })

  it('点击 disabled item 不 emit', async () => {
    const wrapper = mountNav({
      currentStep: 1,
      viewingStep: 1,
      completedNodeIds: []
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    // step2 初始 disabled
    expect(items[1].attributes('data-step-state')).toBe('disabled')
    await items[1].trigger('click')
    expect(wrapper.emitted('navigate')).toBeUndefined()
  })

  it('5 态在同一棵树上齐全：active, done, viewing, pending-return, disabled', () => {
    // currentStep=3, viewing=1, completed=[1,2] → step1=viewing, step2=done, step3=pending-return
    // 再加 trailing chat disabled（主流程未到 trailing）
    const wrapper = mount(StepNav, {
      props: {
        nodes: THREE_NODES,
        currentStep: 3,
        viewingStep: 1,
        completedNodeIds: [1, 2],
        trailingChatEnabled: true,
        streamingNodeId: null
      }
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    const states = items.map((i) => i.attributes('data-step-state'))
    expect(states[0]).toBe('viewing')
    expect(states[1]).toBe('done')
    expect(states[2]).toBe('pending-return')
    expect(states[3]).toBe('disabled')
    // 需要补一个 active 态：单独再 mount 一棵
    const active = mountNav({
      currentStep: 2,
      viewingStep: 2,
      completedNodeIds: [1]
    })
    const activeStates = active
      .findAll('[data-testid="sop-nav-item"]')
      .map((i) => i.attributes('data-step-state'))
    expect(activeStates).toContain('active')
  })

  it('description 为空时不渲染描述行（R4 graceful fallback）', () => {
    const nodesNoDesc: SopNodePublic[] = [{ ...makeNode(1), description: '' }]
    const wrapper = mount(StepNav, {
      props: {
        nodes: nodesNoDesc,
        currentStep: 1,
        viewingStep: 1,
        completedNodeIds: [],
        trailingChatEnabled: false,
        streamingNodeId: null
      }
    })
    expect(wrapper.find('.step__desc').exists()).toBe(false)
  })
})

describe('StepNav.vue — ⭐ 书签星标 (hotfix sop-stepnav-bookmark-star)', () => {
  /**
   * useBookmarks 是模块级单例。每个测试前必须 clear() 避免上一个测试污染。
   * 通过对 listBookmarksByTemplate mock + loadBookmarks 注入"有书签"的 state。
   */
  beforeEach(async () => {
    const { useBookmarks } = await import('@/views/sop/composables/useBookmarks')
    useBookmarks().clear()
  })

  function makeBookmarkRow(nodeId: number) {
    return {
      id: nodeId * 10,
      node_id: nodeId,
      node_sort: nodeId,
      node_name: `Step ${nodeId}`,
      bookmark_name: '',
      output_preview: 'preview',
      has_thinking: false,
      total_tokens: 100,
      created_at: '2026-05-22T00:00:00Z'
    }
  }

  it('已完成的节点 + 有书签 → ⭐ saved 态渲染', async () => {
    // useBookmarks 是 singleton，直接注入 state 比 mock API 更可靠
    const { useBookmarks } = await import('@/views/sop/composables/useBookmarks')
    const bm = useBookmarks()
    bm.bookmarks.value = [makeBookmarkRow(1)]

    const wrapper = mount(StepNav, {
      props: {
        nodes: THREE_NODES,
        currentStep: 2,
        viewingStep: 2,
        completedNodeIds: [1],
        trailingChatEnabled: false,
        streamingNodeId: null
      }
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    expect(items[0].attributes('data-bookmark-state')).toBe('saved')
    expect(items[0].find('[data-testid="step-bookmark-toggle"]').exists()).toBe(true)
  })

  it('已完成的节点 + 无书签 → ⭐ savable 态（outline）', () => {
    const wrapper = mount(StepNav, {
      props: {
        nodes: THREE_NODES,
        currentStep: 2,
        viewingStep: 2,
        completedNodeIds: [1],
        trailingChatEnabled: false,
        streamingNodeId: null
      }
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    expect(items[0].attributes('data-bookmark-state')).toBe('savable')
    expect(items[0].find('[data-testid="step-bookmark-toggle"]').exists()).toBe(true)
  })

  it('未完成的节点 → ⭐ unavailable，不渲染星按钮', () => {
    const wrapper = mount(StepNav, {
      props: {
        nodes: THREE_NODES,
        currentStep: 1,
        viewingStep: 1,
        completedNodeIds: [],
        trailingChatEnabled: false,
        streamingNodeId: null
      }
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    expect(items[0].attributes('data-bookmark-state')).toBe('unavailable')
    expect(items[0].find('[data-testid="step-bookmark-toggle"]').exists()).toBe(false)
  })

  it('streaming 中的节点 → ⭐ unavailable（即使在 completedNodeIds 里也屏蔽）', () => {
    // 防御性：streaming + 已完成同时出现（state 异常态）应优先 streaming
    const wrapper = mount(StepNav, {
      props: {
        nodes: THREE_NODES,
        currentStep: 1,
        viewingStep: 1,
        completedNodeIds: [1],
        trailingChatEnabled: false,
        streamingNodeId: 1
      }
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    expect(items[0].attributes('data-bookmark-state')).toBe('unavailable')
  })

  it('点击 ⭐ 触发 toggle-bookmark 携带 nodeId，且不触发行 navigate', async () => {
    const wrapper = mount(StepNav, {
      props: {
        nodes: THREE_NODES,
        currentStep: 2,
        viewingStep: 2,
        completedNodeIds: [1],
        trailingChatEnabled: false,
        streamingNodeId: null
      }
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    const star = items[0].find('[data-testid="step-bookmark-toggle"]')
    expect(star.exists()).toBe(true)
    await star.trigger('click')

    expect(wrapper.emitted('toggle-bookmark')).toBeTruthy()
    expect(wrapper.emitted('toggle-bookmark')?.[0]).toEqual([1]) // node.id=1
    // 关键：行 click 不应被 stopPropagation 后冒泡到 navigate
    expect(wrapper.emitted('navigate')).toBeUndefined()
  })

  it('trailing chat 项不渲染 ⭐ 按钮', () => {
    const wrapper = mount(StepNav, {
      props: {
        nodes: THREE_NODES,
        currentStep: 4,
        viewingStep: 4,
        completedNodeIds: [1, 2, 3],
        trailingChatEnabled: true,
        streamingNodeId: null
      }
    })
    const items = wrapper.findAll('[data-testid="sop-nav-item"]')
    // 第 4 项是 trailing
    const trailing = items[3]
    expect(trailing.find('[data-testid="step-bookmark-toggle"]').exists()).toBe(false)
  })
})
