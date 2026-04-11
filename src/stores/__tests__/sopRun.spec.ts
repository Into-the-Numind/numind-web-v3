/**
 * sopRun store 单元测试（F1）
 *
 * 覆盖 viewingStep 双指针改造：
 *   1. viewingStepStatus 的 6 种状态（draft-first / active / executing /
 *      done-current / done-history / trailing）
 *   2. setViewingStep 守不变量（viewingStep <= currentStep）
 *   3. returnToCurrentTask 行为
 *   4. advanceCurrentStep 同步 viewingStep
 *   5. refreshNodeRun 合并 meta 字段（mock fetchRunStatusDetail）
 *
 * 对应 plan F1 + spec §3.3
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSopRunStore } from '../sopRun'
import type { SopTemplatePublic, SopNodePublic, SopRun, SopNodeRun } from '@/views/sop/types'

// Mock the api module; refreshNodeRun dynamically imports it.
vi.mock('@/api/sop', () => ({
  fetchRunStatusDetail: vi.fn()
}))
import { fetchRunStatusDetail } from '@/api/sop'

// -------- fixtures --------

function makeTemplate(trailingChatEnabled = false): SopTemplatePublic {
  return {
    id: 1,
    name: 'T',
    description: '',
    status: 'active',
    publish_status: 'published',
    trailing_chat_enabled: trailingChatEnabled,
    created_at: '',
    updated_at: ''
  }
}

function makeNodes(count = 3): SopNodePublic[] {
  return Array.from({ length: count }, (_, i) => ({
    id: 100 + i,
    template_id: 1,
    name: `Node ${i + 1}`,
    description: '',
    sort: i,
    status: 'active',
    created_at: '',
    updated_at: ''
  }))
}

function makeDraftRun(): SopRun {
  return {
    id: 55,
    template_id: 1,
    user_id: 1,
    status: 'draft',
    conversation_id: '',
    counted: false,
    started_at: null,
    finished_at: null,
    error_message: '',
    final_note_id: null,
    created_at: '',
    updated_at: ''
  }
}

function makeRunningRun(): SopRun {
  return { ...makeDraftRun(), status: 'running' }
}

function makeNodeRun(nodeId: number): SopNodeRun {
  return {
    id: 9000 + nodeId,
    run_id: 55,
    node_id: nodeId,
    status: 'succeeded',
    input: '',
    output: '',
    thinking: '',
    latency_ms: 0,
    started_at: null,
    finished_at: null
  }
}

// -------- tests --------

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('sopRun store — viewingStep 双指针', () => {
  // ---- viewingStepStatus: 6 种状态 ----

  it('viewingStepStatus = draft-first：draft run + viewingStep=1 + 无已完成节点', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentRun = makeDraftRun()
    s.currentStep = 1
    s.viewingStep = 1
    expect(s.viewingStepStatus).toBe('draft-first')
  })

  it('viewingStepStatus = active：非 draft + viewingStep=currentStep + 未完成未 streaming', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentRun = makeRunningRun()
    s.currentStep = 2
    s.viewingStep = 2
    expect(s.viewingStepStatus).toBe('active')
  })

  it('viewingStepStatus = executing：当前 viewingNode 正在 streaming', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentRun = makeRunningRun()
    s.currentStep = 1
    s.viewingStep = 1
    s.streamingNodeId = 100 // 第一个节点 id
    expect(s.viewingStepStatus).toBe('executing')
  })

  it('viewingStepStatus = done-current：viewing 当前步骤且节点已完成', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentRun = makeRunningRun()
    s.currentStep = 1
    s.viewingStep = 1
    s.completedNodeIds = new Set([100])
    expect(s.viewingStepStatus).toBe('done-current')
  })

  it('viewingStepStatus = done-history：viewingStep < currentStep', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentRun = makeRunningRun()
    s.currentStep = 2
    s.viewingStep = 1
    s.completedNodeIds = new Set([100])
    expect(s.viewingStepStatus).toBe('done-history')
    expect(s.isViewingHistory).toBe(true)
  })

  it('viewingStepStatus = trailing：viewing trailing chat 步骤', () => {
    const s = useSopRunStore()
    s.template = makeTemplate(true) // trailing enabled
    s.nodes = makeNodes(3)
    s.currentRun = makeRunningRun()
    s.currentStep = 4 // nodes.length + 1 = trailing chat
    s.viewingStep = 4
    expect(s.isViewingTrailingChat).toBe(true)
    expect(s.viewingStepStatus).toBe('trailing')
    expect(s.viewingNode).toBeNull()
  })

  // ---- setViewingStep 守不变量 ----

  it('setViewingStep(step > currentStep) → no-op + warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentStep = 2
    s.viewingStep = 2

    s.setViewingStep(3) // 3 > currentStep=2 → 拒绝
    expect(s.viewingStep).toBe(2)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('setViewingStep(step <= currentStep) → 正常切换', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentStep = 3
    s.viewingStep = 3

    s.setViewingStep(1)
    expect(s.viewingStep).toBe(1)
    s.setViewingStep(2)
    expect(s.viewingStep).toBe(2)
  })

  it('setViewingStep(0) 或超 totalSteps → no-op + warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentStep = 3
    s.viewingStep = 3

    s.setViewingStep(0)
    expect(s.viewingStep).toBe(3)
    s.setViewingStep(999)
    expect(s.viewingStep).toBe(3)
    expect(warnSpy).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })

  // ---- returnToCurrentTask ----

  it('returnToCurrentTask：viewingStep 恢复为 currentStep', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentStep = 3
    s.viewingStep = 1
    s.returnToCurrentTask()
    expect(s.viewingStep).toBe(3)
  })

  // ---- advanceCurrentStep ----

  it('advanceCurrentStep：currentStep + 1，viewingStep 同步', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentStep = 1
    s.viewingStep = 1
    s.advanceCurrentStep()
    expect(s.currentStep).toBe(2)
    expect(s.viewingStep).toBe(2)
  })

  it('advanceCurrentStep：已到最后步则 no-op', () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentStep = 3 // totalSteps = 3
    s.viewingStep = 3
    s.advanceCurrentStep()
    expect(s.currentStep).toBe(3)
    expect(s.viewingStep).toBe(3)
  })

  // ---- refreshNodeRun ----

  it('refreshNodeRun：合并 model_name / latency_ms / total_tokens 到 nodeRuns', async () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentRun = makeRunningRun()
    s.nodeRuns = { 100: makeNodeRun(100) }

    vi.mocked(fetchRunStatusDetail).mockResolvedValueOnce({
      status: 'running',
      current_node_sort: 0,
      completed_nodes: [
        {
          node_run_id: 9100,
          node_id: 100,
          node_name: 'Node 1',
          sort: 0,
          input: '',
          output: '',
          from_bookmark: false,
          is_accessible: true,
          model_name: 'deepseek-v3',
          latency_ms: 1234,
          total_tokens: 567
        }
      ],
      next_node: null,
      total_nodes: 3,
      completed_count: 1,
      auto_applied_count: 0
    })

    await s.refreshNodeRun(100)

    expect(s.nodeRuns[100].model_name).toBe('deepseek-v3')
    expect(s.nodeRuns[100].latency_ms).toBe(1234)
    expect(s.nodeRuns[100].total_tokens).toBe(567)
  })

  it('refreshNodeRun：currentRun 为 null 时静默 no-op', async () => {
    const s = useSopRunStore()
    s.currentRun = null
    await s.refreshNodeRun(100)
    expect(fetchRunStatusDetail).not.toHaveBeenCalled()
  })

  it('refreshNodeRun：未找到 nodeId 时不改 nodeRuns', async () => {
    const s = useSopRunStore()
    s.template = makeTemplate()
    s.nodes = makeNodes(3)
    s.currentRun = makeRunningRun()
    s.nodeRuns = { 100: makeNodeRun(100) }

    vi.mocked(fetchRunStatusDetail).mockResolvedValueOnce({
      status: 'running',
      current_node_sort: 0,
      completed_nodes: [],
      next_node: null,
      total_nodes: 3,
      completed_count: 0,
      auto_applied_count: 0
    })

    await s.refreshNodeRun(100)
    expect(s.nodeRuns[100].model_name).toBeUndefined()
  })

  it('refreshNodeRun：API 抛错时静默 warn 不抛出', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = useSopRunStore()
    s.currentRun = makeRunningRun()
    s.nodeRuns = { 100: makeNodeRun(100) }

    vi.mocked(fetchRunStatusDetail).mockRejectedValueOnce(new Error('network down'))

    await expect(s.refreshNodeRun(100)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
