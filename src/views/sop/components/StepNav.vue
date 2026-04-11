<!--
  StepNav.vue — 左 264px vertical nav（F3 task）

  两组：
    - 主流程：SopNodePublic[] → StepNavItem × N（sop-node 类型）
    - 追问：trailing chat（若 template.trailing_chat_enabled）→ StepNavItem × 1

  纯函数 `computeStepState()` 在独立文件 `./stepNavState.ts` 中导出（`<script setup>`
  不支持 `export`，且分离出来便于单测）。本组件通过 computed 预计算每个 item 的
  state + status line 一次性传给 StepNavItem。

  props 从父容器传入（不直接读 store，便于单测和组合复用）。
  emit `navigate(step)` 仅在非 disabled item 上触发。

  Spec 引用：§3.2 状态机 + §5.2 StepNav.vue + 附录 B computeStepState
  Mockup 引用：01-active-and-history.html 行 733-785 / 850-900
-->
<template>
  <aside class="nav" data-testid="sop-step-nav">
    <div class="nav__group-label">主流程</div>
    <StepNavItem
      v-for="item in mainItems"
      :key="`node-${item.step}`"
      :step="item.step"
      :name="item.name"
      :description="item.description"
      :state="item.state"
      :status-line="item.statusLine"
      @click="handleItemClick(item.step)"
    />

    <template v-if="trailingChatEnabled">
      <div class="nav__group-label">追问</div>
      <StepNavItem
        v-if="trailingItem"
        :step="trailingItem.step"
        :name="trailingItem.name"
        :description="trailingItem.description"
        :is-trailing-chat="true"
        :state="trailingItem.state"
        :status-line="trailingItem.statusLine"
        @click="handleItemClick(trailingItem.step)"
      />
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import StepNavItem from './StepNavItem.vue'
import { computeStepState, computeStatusLine, type StepNavItemState } from './stepNavState'
import type { SopNodePublic } from '@/views/sop/types'

interface Props {
  nodes: SopNodePublic[]
  currentStep: number
  viewingStep: number
  completedNodeIds: number[] | Set<number>
  trailingChatEnabled?: boolean
  streamingNodeId?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  trailingChatEnabled: false,
  streamingNodeId: null
})

const emit = defineEmits<{
  (e: 'navigate', step: number): void
}>()

interface ItemVm {
  step: number
  name: string
  description: string | null
  state: StepNavItemState
  statusLine: string
}

const completedNodeIdsSet = computed<Set<number>>(() =>
  props.completedNodeIds instanceof Set ? props.completedNodeIds : new Set(props.completedNodeIds)
)

const mainItems = computed<ItemVm[]>(() =>
  props.nodes.map((node, idx) => {
    const step = idx + 1
    const state = computeStepState(
      step,
      false,
      props.currentStep,
      props.viewingStep,
      completedNodeIdsSet.value,
      props.nodes,
      props.streamingNodeId ?? null
    )
    return {
      step,
      name: node.name || `步骤 ${step}`,
      description: node.description || null,
      state,
      statusLine: computeStatusLine(step, false, state)
    }
  })
)

const trailingItem = computed<ItemVm | null>(() => {
  if (!props.trailingChatEnabled) return null
  const step = props.nodes.length + 1
  const state = computeStepState(
    step,
    true,
    props.currentStep,
    props.viewingStep,
    completedNodeIdsSet.value,
    props.nodes,
    props.streamingNodeId ?? null
  )
  return {
    step,
    name: '继续问 AI',
    description: '针对结果继续追问',
    state,
    statusLine: computeStatusLine(step, true, state)
  }
})

function handleItemClick(step: number): void {
  // StepNavItem 内部已守 disabled，这里信任 emit。
  emit('navigate', step)
}
</script>

<style scoped>
.nav {
  width: 264px;
  border-right: 1px solid var(--border-light);
  background: var(--surface);
  padding: var(--space-xl) 14px var(--space-lg);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
}

.nav__group-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 6px 10px 8px;
}
.nav__group-label:not(:first-child) {
  padding-top: 18px;
}
</style>
