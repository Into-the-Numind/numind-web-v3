/**
 * useInputPersistence — 步骤输入的 localStorage 持久化 + dirty 检测
 *
 * ## 两个独立关注点
 *
 * 1. **localStorage 持久化**：用户在 textarea 输入时实时写入 localStorage，
 *    刷新页面后恢复。key 命名与 useDraftLifecycle 的迁移逻辑对齐。
 *
 * 2. **Dirty 检测**：等价复刻 legacy `originalInputValues` 机制。
 *    - 用户加载节点时，snapshot 当前值作为"原始"
 *    - 用户编辑后，isDirty(value) 返回 true
 *    - 配合 ConfirmModal："您修改了输入，重新生成将删除该节点的书签，确认？"
 *    （书签语义见 spec §7.2）
 *
 * ## localStorage key 命名
 *
 * - Draft 模式：`sop_input_draft_<templateId>_<inputId>`
 * - Run 模式：`sop_input_<runId>_<inputId>`
 *
 * 两种模式由 `scope` 参数区分：
 *   - `{ kind: 'draft', templateId: 42 }`
 *   - `{ kind: 'run', runId: 100 }`
 *
 * useDraftLifecycle 的 `migrateLocalStorageKeys` 会在 draft → run 升级时
 * 迁移所有相关 key，本 composable 无需感知迁移。
 *
 * ## 状态所有权
 *
 * - localStorage 操作是**无状态**的（直接读写浏览器 API）
 * - Dirty 检测有状态（originalValues Map）—— 由本 composable 的实例持有
 * - 每次 `useInputPersistence()` 调用返回独立的 dirty 状态
 *
 * 详见 spec §7.2
 */
import { ref } from 'vue'

/** 持久化作用域：要么是某个 templateId 的 draft，要么是某个 runId 的 run */
export type PersistenceScope =
  | { kind: 'draft'; templateId: number }
  | { kind: 'run'; runId: number }

/**
 * 构造 localStorage key。
 *
 * 与 useDraftLifecycle 的 key 前缀约定严格一致：
 *   - sop_input_draft_<templateId>_<inputId>
 *   - sop_input_<runId>_<inputId>
 */
function buildKey(scope: PersistenceScope, inputId: string): string {
  if (scope.kind === 'draft') {
    return `sop_input_draft_${scope.templateId}_${inputId}`
  }
  return `sop_input_${scope.runId}_${inputId}`
}

/**
 * 构造某个 scope 下所有输入的 key 前缀（用于 clearInputsForScope 遍历）。
 */
function buildKeyPrefix(scope: PersistenceScope): string {
  if (scope.kind === 'draft') {
    return `sop_input_draft_${scope.templateId}_`
  }
  return `sop_input_${scope.runId}_`
}

export interface UseInputPersistenceReturn {
  /** 从 localStorage 读取某个输入（未设置时返回空字符串） */
  loadInput: (scope: PersistenceScope, inputId: string) => string
  /** 写入某个输入到 localStorage */
  saveInput: (scope: PersistenceScope, inputId: string, value: string) => void
  /** 删除某个输入 */
  removeInput: (scope: PersistenceScope, inputId: string) => void
  /**
   * 清空某个 scope 下的所有输入。
   *
   * 注意：这会遍历整个 localStorage，对于有几十个 key 的场景可接受，
   * 但不要在高频路径调用。
   */
  clearInputsForScope: (scope: PersistenceScope) => void
  /**
   * 快照某个 inputId 的"原始值"用于 dirty 检测。
   *
   * 通常在从后端加载已完成节点的输入时调用一次，后续 isDirty 才有参照。
   * 如果已经 snapshot 过，会被覆盖（调用方可以显式 resetSnapshot）。
   */
  snapshot: (inputId: string, value: string) => void
  /**
   * 检查 inputId 当前值是否与快照不同。
   *
   * 从未 snapshot 的 inputId 永远返回 false（无参照）。
   * 比较时使用 trim() 规范化，避免尾部空白差异误报 dirty。
   */
  isDirty: (inputId: string, currentValue: string) => boolean
  /** 清除指定 inputId 的快照（或全部，不传参数时） */
  resetSnapshot: (inputId?: string) => void
}

export function useInputPersistence(): UseInputPersistenceReturn {
  /** inputId → 原始值（已 trim） */
  const originalValues = ref<Map<string, string>>(new Map())

  function loadInput(scope: PersistenceScope, inputId: string): string {
    return localStorage.getItem(buildKey(scope, inputId)) ?? ''
  }

  function saveInput(scope: PersistenceScope, inputId: string, value: string): void {
    localStorage.setItem(buildKey(scope, inputId), value)
  }

  function removeInput(scope: PersistenceScope, inputId: string): void {
    localStorage.removeItem(buildKey(scope, inputId))
  }

  function clearInputsForScope(scope: PersistenceScope): void {
    const prefix = buildKeyPrefix(scope)
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  }

  function snapshot(inputId: string, value: string): void {
    originalValues.value.set(inputId, value.trim())
  }

  function isDirty(inputId: string, currentValue: string): boolean {
    const original = originalValues.value.get(inputId)
    if (original === undefined) return false
    return original !== currentValue.trim()
  }

  function resetSnapshot(inputId?: string): void {
    if (inputId === undefined) {
      originalValues.value.clear()
    } else {
      originalValues.value.delete(inputId)
    }
  }

  return {
    loadInput,
    saveInput,
    removeInput,
    clearInputsForScope,
    snapshot,
    isDirty,
    resetSnapshot
  }
}
