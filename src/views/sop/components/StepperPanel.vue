<!--
  StepperPanel — SOP 运行页步骤指示器

  职责：横向显示所有步骤，含可访问性控制和当前步骤高亮。

  ## Props

  - `steps: SopNodePublic[]` — 按 sort 排序的节点数组
  - `trailingChatEnabled: boolean` — 是否在末尾追加 AI 聊天步骤
  - `currentStep: number` — 当前激活步骤（1-based）
  - `completedIds: Set<number>` — 已完成的节点 ID 集合
  - `accessibility: Record<number, boolean>` — 节点可访问性（default true, false 才禁）
  - `nextNodeId: number | null` — 下一个待执行节点 ID

  ## Emits

  - `navigate(step: number)` — 用户点击某可访问步骤，父组件决定是否实际切换

  ## 关键设计

  - **零硬编码步骤数**：步骤数量 = steps.length + (trailingChatEnabled ? 1 : 0)
  - **可访问性检查**：内部 `canAccessStep()` 与 useStepNavigation 语义一致
    （但不 import 那个 composable，避免组件与 store 耦合）
  - **DESIGN.md 对齐**：颜色、间距、圆角全部使用 CSS 变量
  - **响应式**：nodes 多时横向滚动，移动端同样可滚
  - **可访问性**：button 元素 + aria-current + tabindex

  详见 spec §3.3 + §5.3
-->
<template>
  <nav class="stepper-panel" role="navigation" aria-label="SOP 步骤">
    <ol class="stepper-list">
      <li
        v-for="(item, index) in items"
        :key="item.key"
        class="stepper-item"
        :class="{
          'is-active': item.stepIndex === currentStep,
          'is-completed': item.completed,
          'is-disabled': !item.accessible,
          'is-chat': item.kind === 'chat'
        }"
      >
        <button
          type="button"
          class="stepper-button"
          :disabled="!item.accessible"
          :aria-current="item.stepIndex === currentStep ? 'step' : undefined"
          :aria-label="`步骤 ${item.stepIndex}：${item.title}`"
          @click="handleNavigate(item.stepIndex, item.accessible)"
        >
          <span class="stepper-circle">
            <span v-if="item.completed" class="stepper-check">✓</span>
            <span v-else class="stepper-number">{{ item.stepIndex }}</span>
          </span>
          <span class="stepper-label">{{ item.title }}</span>
        </button>
        <span
          v-if="index < items.length - 1"
          class="stepper-connector"
          :class="{ 'is-filled': item.completed }"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SopNodePublic } from '@/views/sop/types'

interface Props {
  steps: SopNodePublic[]
  trailingChatEnabled: boolean
  currentStep: number
  completedIds: Set<number>
  accessibility: Record<number, boolean>
  nextNodeId: number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  navigate: [step: number]
}>()

/**
 * 展平为 stepper 条目数组：nodes + 可选 trailing chat。
 *
 * 每项含：
 *   - stepIndex（1-based）
 *   - kind: 'node' | 'chat'
 *   - title
 *   - completed：是否已完成
 *   - accessible：是否可访问（参考 useStepNavigation 的 canAccessStep 语义）
 *   - key：v-for 的唯一 key
 */
interface StepperItem {
  key: string
  stepIndex: number
  kind: 'node' | 'chat'
  title: string
  completed: boolean
  accessible: boolean
}

const items = computed<StepperItem[]>(() => {
  const result: StepperItem[] = []
  const nodeCount = props.steps.length

  // 节点步骤
  props.steps.forEach((node, i) => {
    const stepIndex = i + 1
    const isCompleted = props.completedIds.has(node.id)
    // 可访问性规则（与 useStepNavigation.canAccessStep 语义一致）：
    //   1. 已完成：默认可，accessibility[id]===false 显式禁
    //   2. 下一个待执行：可
    //   3. 其他：不可
    let accessible: boolean
    if (isCompleted) {
      accessible = props.accessibility[node.id] !== false
    } else {
      accessible = node.id === props.nextNodeId
    }

    result.push({
      key: `node-${node.id}`,
      stepIndex,
      kind: 'node',
      title: node.name || `步骤 ${stepIndex}`,
      completed: isCompleted,
      accessible
    })
  })

  // Trailing chat 步骤
  if (props.trailingChatEnabled && nodeCount > 0) {
    const allCompleted = props.completedIds.size >= nodeCount
    result.push({
      key: 'trailing-chat',
      stepIndex: nodeCount + 1,
      kind: 'chat',
      title: '继续问 AI',
      completed: false,
      accessible: allCompleted
    })
  }

  return result
})

function handleNavigate(step: number, accessible: boolean): void {
  if (!accessible) return
  emit('navigate', step)
}
</script>

<style scoped>
.stepper-panel {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--space-md) var(--space-lg);
  /* 隐藏滚动条但保留滚动能力 */
  scrollbar-width: none;
}

.stepper-panel::-webkit-scrollbar {
  display: none;
}

.stepper-list {
  display: flex;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
  gap: 0;
  /* 宽度 fit-content 允许内容溢出触发 overflow-x: auto */
  min-width: fit-content;
}

.stepper-item {
  display: flex;
  align-items: center;
  gap: 0;
  /* 每一步自身不收缩，保证小屏幕横向滚动而非挤压 */
  flex-shrink: 0;
}

.stepper-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.stepper-button:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.stepper-button:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.stepper-button:disabled {
  cursor: not-allowed;
}

.stepper-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-surface-hover);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
  border: 2px solid var(--color-border-light);
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.stepper-label {
  font-weight: 500;
  /* 防止长 label 破坏 stepper 布局 */
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 连接线（每个 step 右侧） */
.stepper-connector {
  display: inline-block;
  width: 40px;
  height: 2px;
  background: var(--color-border-light);
  transition: background-color var(--transition-base);
  flex-shrink: 0;
  margin: 0 var(--space-xs);
}

.stepper-connector.is-filled {
  background: var(--primary);
}

/* ==================== 状态样式 ==================== */

/* Active（当前步骤） */
.stepper-item.is-active .stepper-button {
  color: var(--color-text);
  background: var(--color-accent-soft);
}

.stepper-item.is-active .stepper-circle {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

/* Completed（已完成，未激活） */
.stepper-item.is-completed:not(.is-active) .stepper-circle {
  background: var(--color-accent-soft);
  color: var(--primary);
  border-color: var(--primary);
}

.stepper-item.is-completed .stepper-check {
  font-size: 14px;
  line-height: 1;
}

/* Disabled（不可访问） */
.stepper-item.is-disabled .stepper-button {
  opacity: 0.45;
}

.stepper-item.is-disabled .stepper-button:hover {
  background: transparent;
}

/* Chat 类型（特殊视觉标记） */
.stepper-item.is-chat .stepper-circle {
  border-style: dashed;
}

.stepper-item.is-chat.is-active .stepper-circle {
  border-style: solid;
}
</style>
