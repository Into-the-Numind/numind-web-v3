/**
 * SOP 运行页 Pinia store
 *
 * 持有当前 SOP run 的全局状态：template / nodes / currentRun / 节点执行进度 / UI 状态。
 *
 * **设计原则**：
 *   - 数据库 = 唯一真相源。所有字段从后端 API 读取，前端不硬编码任何 SOP 业务数据。
 *   - actions 在本 task 5 阶段只声明签名 + 空实现，后续 task 6-21 逐步填充。
 *   - 单一 store 持有整个 SOP run 状态（不拆多个 store，避免跨 store 同步噪音）。
 *
 * 关键决策：
 *   - isDraftRun = currentRun.status === 'draft'（后端独立常量 SopStatusDraft，
 *     不是 pending+counted=false 组合）
 *   - totalSteps = nodes.length + (trailing_chat_enabled ? 1 : 0)
 *   - currentStep 是 1-based（第一步 = 1）
 *
 * 详见 spec §3.2 + task 1 research §5.1
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SopTemplatePublic, SopNodePublic, SopRun, SopNodeRun } from '@/views/sop/types'

export const useSopRunStore = defineStore('sopRun', () => {
  // ===== 核心 state（template + nodes + run） =====
  const template = ref<SopTemplatePublic | null>(null)
  const nodes = ref<SopNodePublic[]>([])
  const currentRun = ref<SopRun | null>(null)

  // ===== 节点执行状态 =====
  /** nodeId → 最新一次执行记录 */
  const nodeRuns = ref<Record<number, SopNodeRun>>({})
  /** 已完成的节点 ID 集合 */
  const completedNodeIds = ref<Set<number>>(new Set())
  /** 下一个待执行的节点 ID */
  const nextNodeId = ref<number | null>(null)
  /**
   * nodeId → is_accessible 标志
   *
   * 默认 true。后端在某些情况（如配额耗尽）会标记为 false，
   * 前端 canAccessStep() 必须检查此字段。
   */
  const nodeAccessibility = ref<Record<number, boolean>>({})

  // ===== 流式输出实时状态 =====
  /** 当前节点正在流式生成的 thinking + content */
  const streamingNodeId = ref<number | null>(null)
  const streamingThinking = ref<string>('')
  const streamingContent = ref<string>('')

  // ===== UI state =====
  /** 当前显示的步骤索引（1-based） */
  const currentStep = ref<number>(1)

  // ===== 加载与错误状态 =====
  const loading = ref(false)
  const lastError = ref<string>('')

  // ===== Computed =====
  /**
   * 是否为 Draft run 状态。
   *
   * 直接读 currentRun.status === 'draft'（后端 SopStatusDraft 常量）。
   * 不要写成 `status === 'pending' && !counted` —— 那是错误的语义，
   * task 1 reviewer 已抓出该失误。
   */
  const isDraftRun = computed(() => currentRun.value?.status === 'draft')

  /** 是否启用末尾 AI 聊天步骤（来自模板配置） */
  const trailingChatEnabled = computed(() => template.value?.trailing_chat_enabled ?? false)

  /**
   * 步骤总数 = 节点数 + (trailing chat ? 1 : 0)
   *
   * 不再硬编码为 5。spec §10.2 row 5 要求 nodes.length > 10 时
   * StepperPanel 横向滚动 / collapsed 视图。
   */
  const totalSteps = computed(() => nodes.value.length + (trailingChatEnabled.value ? 1 : 0))

  /** 当前是否在 trailing chat 步骤上 */
  const isOnTrailingChatStep = computed(
    () => trailingChatEnabled.value && currentStep.value === nodes.value.length + 1
  )

  /** 当前步骤对应的 node（trailing chat 步骤时为 null） */
  const currentNode = computed<SopNodePublic | null>(() => {
    if (isOnTrailingChatStep.value) return null
    const idx = currentStep.value - 1 // 1-based → 0-based
    return nodes.value[idx] ?? null
  })

  // ===== Actions（task 5 仅声明签名，后续 task 填充实现）=====
  //
  // 下方所有 stub action 的参数命名以 _ 前缀标记"暂未使用"，但 eslint
  // 默认仍会警告。整段 disable no-unused-vars 直到 actions 实现完成。
  // 这些 stub 会在 task 6/8/11/17/21 期间逐个填充实现。

  /* eslint-disable @typescript-eslint/no-unused-vars */

  /**
   * 加载 template + nodes（GET /v1/sop/templates/:id/nodes）
   *
   * task 21 (SOPRunView 主集成) 阶段填充实现。
   */
  async function loadTemplate(_templateId: number): Promise<void> {
    // TODO: task 21 — 调用 GET /v1/sop/templates/:id/nodes，
    //   解析 SopTemplateNodesResponse，赋值 template + nodes
  }

  /**
   * 加载现有 run（GET /v1/sop/runs/:id），同时拉取 status 和 chat-messages。
   *
   * task 21 阶段填充。
   */
  async function loadRun(_runId: number): Promise<void> {
    // TODO: task 21 — 调用 GET /v1/sop/runs/:id 并赋值 currentRun
  }

  /**
   * 进入纯前端 draft 模式（不创建后端记录）。
   *
   * task 8 (useDraftLifecycle) 阶段填充。
   */
  function enterDraftMode(_templateId: number): void {
    // TODO: task 8 — 设置 currentRun=null，激活 localStorage draft key
  }

  /**
   * Lazy 创建 run（首次执行节点时调用）。
   *
   * task 8 阶段填充。
   */
  async function lazyCreateRun(_text: string): Promise<void> {
    // TODO: task 8 — 调用 POST /v1/sop/runs，迁移 localStorage key
  }

  /**
   * 执行节点（流式）。
   *
   * task 17 (StepOutput + 主流程) 阶段填充。
   */
  async function executeNode(_nodeId: number, _input: string, _files: File[]): Promise<void> {
    // TODO: task 6+17 — 通过 useSSEStream 调用 POST /v1/sop/runs/:id/nodes/:node_id/execute
  }

  /* eslint-enable @typescript-eslint/no-unused-vars */

  /**
   * 切换当前活跃步骤（含权限检查）。
   *
   * task 11 (useStepNavigation) 阶段填充。
   */
  function setActiveStep(step: number): void {
    if (step < 1 || step > totalSteps.value) return
    currentStep.value = step
    // TODO: task 11 — 持久化到 sessionStorage
  }

  /**
   * 重置 store（切换 run / 离开页面时调用）。
   *
   * 已经实现：清空所有 state。
   */
  function reset(): void {
    template.value = null
    nodes.value = []
    currentRun.value = null
    nodeRuns.value = {}
    completedNodeIds.value = new Set()
    nextNodeId.value = null
    nodeAccessibility.value = {}
    streamingNodeId.value = null
    streamingThinking.value = ''
    streamingContent.value = ''
    currentStep.value = 1
    loading.value = false
    lastError.value = ''
  }

  return {
    // state
    template,
    nodes,
    currentRun,
    nodeRuns,
    completedNodeIds,
    nextNodeId,
    nodeAccessibility,
    streamingNodeId,
    streamingThinking,
    streamingContent,
    currentStep,
    loading,
    lastError,
    // computed
    isDraftRun,
    trailingChatEnabled,
    totalSteps,
    isOnTrailingChatStep,
    currentNode,
    // actions
    loadTemplate,
    loadRun,
    enterDraftMode,
    lazyCreateRun,
    executeNode,
    setActiveStep,
    reset
  }
})
