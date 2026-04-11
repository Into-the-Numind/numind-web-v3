/**
 * useStepNavigation — 步骤切换 + 权限检查 + sessionStorage 恢复
 *
 * ## 职责
 *
 * 1. **canAccessStep(stepIndex)** — 判断某步骤是否可访问
 * 2. **setActiveStep(step)** — 切换当前步骤（含权限检查 + sessionStorage 持久化）
 * 3. **restoreFromSession(scope)** — 页面刷新后从 sessionStorage 恢复上次停留的步骤
 *
 * ## 权限规则（等价复刻 legacy canAccessStep，spec §5.3）
 *
 * 步骤索引是 **1-based**（第一步 = 1）。
 *
 * 以下三种情况可访问：
 *   1. **trailing chat 步骤**（stepIndex = nodes.length + 1）：
 *      仅当 trailingChatEnabled === true 且**所有**节点已完成
 *   2. **已完成的节点**（completedNodeIds 含此 node.id）：
 *      默认可访问，除非 nodeAccessibility[node.id] === false（后端显式禁用）
 *   3. **下一个待执行节点**（node.id === nextNodeId）：
 *      可访问，允许向后推进
 *
 * 其他情况（未完成且非下一个）不可访问。
 *
 * ## sessionStorage key
 *
 * - Run 模式：`sop_step_<runId>`
 * - Draft 模式：`sop_step_draft_<templateId>`
 *
 * key 格式与 legacy 的 `sop_step_${runId}` 兼容（legacy 只支持 run 模式，
 * 本 composable 扩展到 draft 模式）。
 *
 * ## 与 store 解耦
 *
 * 本 composable 不直接 import useSopRunStore。相反，接受一个"store-like"
 * 接口作为参数，好处：
 *   - 测试时可注入 mock store，无需 Pinia 测试环境
 *   - 职责单一：只做导航逻辑，不管理状态
 *
 * 详见 spec §5.3
 */
import { type Ref } from 'vue'

/**
 * 步骤导航所需的 store 状态接口（ducktype）。
 *
 * 在 task 21 主集成阶段，useSopRunStore() 的返回对象可以直接作为参数传入，
 * 因为它的属性名正好匹配此接口。
 */
export interface StepNavigationStore {
  /** 当前模板的节点数组（必须按 sort 排序） */
  nodes: Ref<Array<{ id: number }>>
  /** 当前 step 的 Ref（1-based） */
  currentStep: Ref<number>
  /** 总步骤数（含 trailing chat） */
  totalSteps: Ref<number>
  /** 已完成的节点 ID 集合 */
  completedNodeIds: Ref<Set<number>>
  /** 下一个待执行的节点 ID */
  nextNodeId: Ref<number | null>
  /** 每个节点的 is_accessible 标志（默认 true，false 才显式禁用） */
  nodeAccessibility: Ref<Record<number, boolean>>
  /** 模板是否启用末尾 AI 聊天步骤 */
  trailingChatEnabled: Ref<boolean>
}

/**
 * sessionStorage 作用域（与 useInputPersistence 的 PersistenceScope 同类型）
 */
export type StepSessionScope =
  | { kind: 'draft'; templateId: number }
  | { kind: 'run'; runId: number }

function buildSessionKey(scope: StepSessionScope): string {
  if (scope.kind === 'draft') {
    return `sop_step_draft_${scope.templateId}`
  }
  return `sop_step_${scope.runId}`
}

export interface UseStepNavigationReturn {
  /**
   * 判断某步骤是否可访问。
   *
   * stepIndex 是 1-based。返回 false 表示不应允许切换。
   */
  canAccessStep: (stepIndex: number) => boolean

  /**
   * 切换当前步骤。会先检查权限，不可访问则 no-op 并返回 false。
   *
   * 成功切换会：
   *   1. 更新 store.currentStep
   *   2. 持久化到 sessionStorage（如果 scope 提供）
   */
  setActiveStep: (step: number, scope?: StepSessionScope) => boolean

  /**
   * 从 sessionStorage 读取上次停留的步骤并恢复。
   *
   * 仅在可访问的情况下恢复（防止 URL 外链 / 状态不一致时跳到禁用步骤）。
   * 找不到记录或无法访问时返回 false，保持 store.currentStep 原值。
   */
  restoreFromSession: (scope: StepSessionScope) => boolean

  /**
   * 清除某 scope 的 session 记录（切换 run / 完成清理时调用）。
   */
  clearSession: (scope: StepSessionScope) => void
}

export function useStepNavigation(store: StepNavigationStore): UseStepNavigationReturn {
  function canAccessStep(stepIndex: number): boolean {
    if (stepIndex < 1 || stepIndex > store.totalSteps.value) return false

    const nodeCount = store.nodes.value.length
    const isTrailingChat = stepIndex === nodeCount + 1

    if (isTrailingChat) {
      // trailing chat 步骤：必须启用 + 所有节点都完成
      if (!store.trailingChatEnabled.value) return false
      if (nodeCount === 0) return false // 没有节点时 trailing chat 也不可用
      return store.completedNodeIds.value.size >= nodeCount
    }

    // 常规节点步骤
    const node = store.nodes.value[stepIndex - 1]
    if (!node) return false

    // 已完成的节点：默认可访问，显式 false 才禁
    if (store.completedNodeIds.value.has(node.id)) {
      return store.nodeAccessibility.value[node.id] !== false
    }

    // 未完成：仅允许访问 nextNodeId 指定的那个
    return node.id === store.nextNodeId.value
  }

  function setActiveStep(step: number, scope?: StepSessionScope): boolean {
    if (!canAccessStep(step)) return false

    store.currentStep.value = step

    if (scope) {
      try {
        sessionStorage.setItem(buildSessionKey(scope), String(step))
      } catch {
        // sessionStorage 可能被禁用（隐私模式），静默忽略
      }
    }

    return true
  }

  function restoreFromSession(scope: StepSessionScope): boolean {
    try {
      const raw = sessionStorage.getItem(buildSessionKey(scope))
      if (raw === null) return false
      const step = parseInt(raw, 10)
      if (Number.isNaN(step) || step < 1) return false
      if (!canAccessStep(step)) return false
      store.currentStep.value = step
      return true
    } catch {
      return false
    }
  }

  function clearSession(scope: StepSessionScope): void {
    try {
      sessionStorage.removeItem(buildSessionKey(scope))
    } catch {
      // 静默忽略
    }
  }

  return {
    canAccessStep,
    setActiveStep,
    restoreFromSession,
    clearSession
  }
}
