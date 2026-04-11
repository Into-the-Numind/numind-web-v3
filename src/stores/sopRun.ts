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
  /**
   * 当前任务指针（1-based）。
   *
   * 语义（F1 重定义）：用户当前"应该在做"的步骤。
   * 由后端执行进度推进（onDone → advanceCurrentStep）。
   * 不变量：`viewingStep <= currentStep`（不能看未来）。
   */
  const currentStep = ref<number>(1)

  /**
   * 正在查看的步骤指针（1-based）。F1 新增。
   *
   * 语义：用户点 StepNav 时切换此值；`currentStep` 不动。
   * 默认等于 `currentStep`（刚进来聚焦当前任务）。
   * 约束：`viewingStep <= currentStep`，违反守卫 no-op + warn。
   *
   * 详见 spec §3.3（双指针模型）。
   */
  const viewingStep = ref<number>(1)

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

  // ===== F1：viewingStep 双指针 getters =====

  /**
   * 当前正在查看的步骤是否为 trailing chat。
   *
   * trailing chat 固定为最后一个步骤（index = nodes.length + 1，当启用时）。
   */
  const isViewingTrailingChat = computed(
    () => trailingChatEnabled.value && viewingStep.value === nodes.value.length + 1
  )

  /**
   * 当前正在查看的步骤对应的 node（trailing chat 时为 null）。
   */
  const viewingNode = computed<SopNodePublic | null>(() => {
    if (isViewingTrailingChat.value) return null
    const idx = viewingStep.value - 1
    return nodes.value[idx] ?? null
  })

  /**
   * 是否正在查看历史步骤。等同于 viewingStepStatus === 'done-history'。
   *
   * 实现委托给 viewingStepStatus 以避免逻辑分叉（F1 review P2 fix）。
   * 当为 true 时，SopStepView 顶部应渲染 HistoryViewStrip
   * + 禁止编辑输入（spec D5 硬约束）。
   */
  const isViewingHistory = computed(() => viewingStepStatus.value === 'done-history')

  /**
   * 视图状态机：6 个状态之一。严格对应 spec §3.3。
   *
   * 状态定义：
   * - `'trailing'`     ：正在看 trailing chat（状态 F）
   * - `'done-history'` ：看的是历史步骤（viewingStep < currentStep），已完成
   * - `'done-current'` ：看的是当前步骤，且当前节点已完成（状态 E）
   * - `'executing'`    ：当前步骤正在流式执行（streamingNodeId 匹配）（状态 D）
   * - `'draft-first'`  ：draft run + viewingStep=1 + 尚未执行任何节点（状态 C）
   * - `'active'`       ：当前步骤待执行（状态 A，默认兜底）
   *
   * 判定顺序（互斥优先级）：
   *   1. trailing chat → 'trailing'
   *   2. viewingStep < currentStep → 'done-history'
   *   3. 当前 viewingNode 已 complete → 'done-current'
   *   4. 当前 viewingNode 正在 streaming → 'executing'
   *   5. draft 且 viewingStep === 1 且无已完成节点 → 'draft-first'
   *   6. 否则 → 'active'
   */
  const viewingStepStatus = computed<
    'draft-first' | 'active' | 'executing' | 'done-current' | 'done-history' | 'trailing'
  >(() => {
    if (isViewingTrailingChat.value) return 'trailing'
    if (viewingStep.value < currentStep.value) return 'done-history'

    const node = viewingNode.value
    if (node) {
      if (completedNodeIds.value.has(node.id)) return 'done-current'
      if (streamingNodeId.value === node.id) return 'executing'
    }

    if (
      isDraftRun.value &&
      viewingStep.value === 1 &&
      completedNodeIds.value.size === 0 &&
      streamingNodeId.value === null
    ) {
      return 'draft-first'
    }

    return 'active'
  })

  // ===== Actions =====
  //
  // **设计决策**：store 只管纯状态 mutation。复杂流程（SSE 流、localStorage
  // 持久化、ConfirmModal 弹窗、路由跳转）放在 SOPRunView 或 composables。
  // 这样 store 可以被单独单测，不依赖 fetch/DOM。

  /**
   * 加载 template + nodes（task 21 SOPRunView 从 api 调用后注入到 store）
   */
  async function loadTemplate(templateId: number): Promise<void> {
    loading.value = true
    lastError.value = ''
    try {
      const { fetchTemplateNodes } = await import('@/api/sop')
      const data = await fetchTemplateNodes(templateId)
      template.value = data.template as SopTemplatePublic
      nodes.value = (data.nodes as SopNodePublic[]).slice().sort((a, b) => a.sort - b.sort)
    } catch (err) {
      lastError.value = (err as Error)?.message || '加载模板失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 加载现有 run（GET /v1/sop/runs/:id + /status）
   *
   * 先调 GetRun 拿到 run 基本信息，再调 GetRunStatus 拉取已完成节点 + 下一节点。
   */
  async function loadRun(runId: number): Promise<void> {
    loading.value = true
    lastError.value = ''
    try {
      const { fetchRun, fetchRunStatusDetail } = await import('@/api/sop')
      const [run, status] = await Promise.all([fetchRun(runId), fetchRunStatusDetail(runId)])
      // 后端 SopRun 直接序列化，gorm.Model.ID 序列化为 "ID"（大写）
      currentRun.value = {
        id: run.ID,
        template_id: run.template_id,
        user_id: run.user_id,
        status: run.status as SopRun['status'],
        conversation_id: run.conversation_id,
        counted: run.counted,
        started_at: run.started_at,
        finished_at: run.finished_at,
        created_at: run.created_at,
        updated_at: run.updated_at,
        error_message: run.error_message ?? '',
        final_note_id: null
      }
      // 已完成节点集合
      const newCompleted = new Set<number>()
      const newAccessibility: Record<number, boolean> = {}
      for (const cn of status.completed_nodes) {
        newCompleted.add(cn.node_id)
        newAccessibility[cn.node_id] = cn.is_accessible
      }
      completedNodeIds.value = newCompleted
      nodeAccessibility.value = newAccessibility
      nextNodeId.value = status.next_node?.node_id ?? null
    } catch (err) {
      lastError.value = (err as Error)?.message || '加载运行记录失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 进入纯前端 draft 模式（不创建后端记录）。
   *
   * 实际 lazyCreateRun 由 useDraftLifecycle composable 在 SOPRunView 中处理。
   * 这里清空 run 相关状态，并把 nextNodeId 指向第一个节点，让 canExecute
   * 在首次进入时就能判定第一步为"可执行"，从而渲染出"执行"按钮。
   *
   * 调用顺序：loadTemplate → enterDraftMode，所以此时 nodes 已经有值。
   */
  function enterDraftMode(_templateId: number): void {
    void _templateId
    currentRun.value = null
    completedNodeIds.value = new Set()
    nodeAccessibility.value = {}
    // draft 模式首步永远可执行：把 nextNodeId 设为第一个节点 id
    nextNodeId.value = nodes.value[0]?.id ?? null
  }

  /**
   * lazyCreateRun 的 store 侧逻辑：把新创建的 run 赋值到 store。
   *
   * 实际 POST /v1/sop/runs 调用由 useDraftLifecycle.lazyCreateRun 完成，
   * 成功后调用本方法注入 store。
   */
  async function lazyCreateRun(_text: string): Promise<void> {
    // Store 侧不调用 API。SOPRunView 通过 useDraftLifecycle 调用 API 后，
    // 用 setCurrentRun 注入。这个方法保留签名但不使用，防止破坏 return type。
    void _text
  }

  /**
   * 由 composables 调用，注入新创建或切换后的 run。
   */
  function setCurrentRun(run: SopRun | null): void {
    currentRun.value = run
  }

  /**
   * 标记节点完成（由 executeNode 的 onDone 回调调用）
   */
  function markNodeComplete(nodeId: number): void {
    completedNodeIds.value = new Set([...completedNodeIds.value, nodeId])
  }

  /**
   * 标记节点为未完成（regenerate 流程：从 completedNodeIds 移除并设为 nextNodeId）
   */
  function markNodeIncomplete(nodeId: number): void {
    const next = new Set(completedNodeIds.value)
    next.delete(nodeId)
    completedNodeIds.value = next
    nextNodeId.value = nodeId
  }

  /**
   * 设置下一个待执行节点 ID（由 executeNode onDone 推进时调用）
   */
  function setNextNodeId(id: number | null): void {
    nextNodeId.value = id
  }

  /**
   * 把 node 执行结果持久化到 nodeRuns（由 executeNode onDone 回调调用）
   */
  function setNodeRun(nodeId: number, nodeRun: SopNodeRun): void {
    nodeRuns.value = { ...nodeRuns.value, [nodeId]: nodeRun }
  }

  /**
   * 更新 streaming 状态（由 executeNode 的 onThinking/onMessage 调用）
   */
  function setStreamingState(nodeId: number | null, thinking: string, content: string): void {
    streamingNodeId.value = nodeId
    streamingThinking.value = thinking
    streamingContent.value = content
  }

  function appendStreamingThinking(chunk: string): void {
    streamingThinking.value += chunk
  }

  function appendStreamingContent(chunk: string): void {
    streamingContent.value += chunk
  }

  function clearStreamingState(): void {
    streamingNodeId.value = null
    streamingThinking.value = ''
    streamingContent.value = ''
  }

  /**
   * 执行节点 —— stub，实际 SSE 流由 SOPRunView 中通过 useSSEStream 直接调用。
   * 保留签名避免破坏 Pinia return 类型。
   */
  async function executeNode(_nodeId: number, _input: string, _files: File[]): Promise<void> {
    void _nodeId
    void _input
    void _files
  }

  /**
   * 切换当前活跃步骤（不做权限检查，权限检查由 useStepNavigation 处理）
   */
  function setActiveStep(step: number): void {
    if (step < 1 || step > totalSteps.value) return
    currentStep.value = step
  }

  // ===== F1：viewingStep 相关 actions =====

  /**
   * 切换正在查看的步骤（用户点 StepNav 时调用）。
   *
   * 守不变量 `viewingStep <= currentStep`，越界 no-op + warn。
   * 下界同样守 `step >= 1`。
   */
  function setViewingStep(step: number): void {
    if (step < 1 || step > totalSteps.value) {
      console.warn(`[sopRun] setViewingStep: out of range step=${step}`)
      return
    }
    if (step > currentStep.value) {
      console.warn(
        `[sopRun] setViewingStep: cannot view future step=${step} currentStep=${currentStep.value}`
      )
      return
    }
    viewingStep.value = step
  }

  /**
   * 从历史视图返回到当前任务（HistoryViewStrip 的"返回当前步骤"按钮）。
   */
  function returnToCurrentTask(): void {
    viewingStep.value = currentStep.value
  }

  /**
   * 推进 currentStep 到下一步，并同步 viewingStep（节点执行完成后 onDone 调用）。
   *
   * 行为：如果已到最后一步则不动；否则 currentStep += 1 且 viewingStep 同步。
   * 这保证"执行完自动 focus 下一步"的流程。
   */
  function advanceCurrentStep(): void {
    if (currentStep.value >= totalSteps.value) return
    currentStep.value += 1
    viewingStep.value = currentStep.value
  }

  /**
   * **P0-2 修复**：SSE done 事件不含 model_name / latency_ms / total_tokens，
   * 必须在节点完成后调 /runs/:id/status 补齐这些字段。
   *
   * 从响应 `completed_nodes[]` 里找到对应 nodeId，把 meta 字段合并进
   * `nodeRuns[nodeId]`。供 F11 的 onDone 回调使用。
   *
   * 失败或未找到节点时静默 no-op，不抛错（保证主流程不被 meta 拉取失败打断）。
   */
  async function refreshNodeRun(nodeId: number): Promise<void> {
    if (!currentRun.value) return
    try {
      const { fetchRunStatusDetail } = await import('@/api/sop')
      const detail = await fetchRunStatusDetail(currentRun.value.id)
      const info = detail.completed_nodes?.find((n) => n.node_id === nodeId)
      if (!info) return
      const prev = nodeRuns.value[nodeId]
      if (!prev) return
      nodeRuns.value = {
        ...nodeRuns.value,
        [nodeId]: {
          ...prev,
          model_name: info.model_name ?? '',
          latency_ms: info.latency_ms ?? 0,
          total_tokens: info.total_tokens ?? 0
        }
      }
    } catch (err) {
      console.warn('[sopRun] refreshNodeRun failed:', (err as Error)?.message)
    }
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
    viewingStep.value = 1
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
    viewingStep,
    loading,
    lastError,
    // computed
    isDraftRun,
    trailingChatEnabled,
    totalSteps,
    isOnTrailingChatStep,
    currentNode,
    viewingNode,
    isViewingTrailingChat,
    isViewingHistory,
    viewingStepStatus,
    // actions
    loadTemplate,
    loadRun,
    enterDraftMode,
    lazyCreateRun,
    setCurrentRun,
    markNodeComplete,
    markNodeIncomplete,
    setNextNodeId,
    setNodeRun,
    setStreamingState,
    appendStreamingThinking,
    appendStreamingContent,
    clearStreamingState,
    executeNode,
    setActiveStep,
    setViewingStep,
    returnToCurrentTask,
    advanceCurrentStep,
    refreshNodeRun,
    reset
  }
})
