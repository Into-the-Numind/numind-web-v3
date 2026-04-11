/**
 * stepNavState — StepNav 纯派生逻辑
 *
 * 提取为独立文件的理由：
 *   - `<script setup>` 内不支持 `export` 语句，但 spec 附录 B 的伪代码要求
 *     computeStepState 能被单测直接调用
 *   - 纯函数无副作用，放在独立 .ts 文件里最合理
 *
 * Spec 引用：附录 B computeStepState 伪代码
 */
import type { SopNodePublic } from '@/views/sop/types'

export type StepNavItemState = 'active' | 'done' | 'viewing' | 'pending-return' | 'disabled'

/**
 * 严格按 spec 附录 B 伪代码实现的纯函数。
 *
 * 判定顺序（互斥优先级，先命中先返回）：
 *   1) disabled（不可达 / 未来步骤 / trailing 未开启）
 *   2) streaming → 'active'（流式中等同 active + live）
 *   3) viewing 历史场景：
 *      - index === viewingStep 且 completed → 'viewing'
 *      - index === viewingStep 且未 completed → 'active'（兜底）
 *      - index === currentStep → 'pending-return'（虚线环提示）
 *   4) 已完成 → 'done'
 *   5) index === currentStep → 'active'
 *   6) 兜底 → 'disabled'
 *
 * @param index 1-based step 序号
 * @param isTrailingChat 该 item 是否为 trailing chat（而非 sop-node）
 * @param currentStep 当前任务指针
 * @param viewingStep 用户正在查看的步骤指针
 * @param completedIds 已完成节点 id 集合
 * @param nodes 所有 sop 节点（用于通过 index 取到 node.id）
 * @param streamingNodeId 当前正在流式执行的节点 id（无则 null）
 */
export function computeStepState(
  index: number,
  isTrailingChat: boolean,
  currentStep: number,
  viewingStep: number,
  completedIds: Set<number>,
  nodes: SopNodePublic[],
  streamingNodeId: number | null
): StepNavItemState {
  const node = isTrailingChat ? null : (nodes[index - 1] ?? null)

  // ---------- 1) disabled ----------
  if (!isTrailingChat && index > currentStep) return 'disabled'
  if (isTrailingChat && currentStep < nodes.length + 1) return 'disabled'

  // ---------- 2) streaming → active ----------
  if (node && streamingNodeId !== null && streamingNodeId === node.id) {
    return 'active'
  }

  // ---------- 3) viewing 历史 ----------
  if (viewingStep !== currentStep && index === viewingStep) {
    if (node && completedIds.has(node.id)) return 'viewing'
    return 'active'
  }
  if (viewingStep !== currentStep && index === currentStep) {
    return 'pending-return'
  }

  // ---------- 4) done ----------
  if (node && completedIds.has(node.id)) return 'done'

  // ---------- 5) active ----------
  if (index === currentStep) return 'active'

  // ---------- 6) fallback ----------
  return 'disabled'
}

/**
 * 计算状态行文案（纯展示，不参与 state 判定）。
 */
export function computeStatusLine(
  index: number,
  isTrailingChat: boolean,
  state: StepNavItemState
): string {
  if (isTrailingChat) {
    if (state === 'disabled') return '完成主流程后开启'
    return ''
  }
  switch (state) {
    case 'done':
      return '已完成'
    case 'active':
      return '等待输入'
    case 'viewing':
      return '正在查看'
    case 'pending-return':
      return '当前任务 · 点击返回'
    case 'disabled':
      return index > 1 ? '等待解锁' : ''
    default:
      return ''
  }
}
