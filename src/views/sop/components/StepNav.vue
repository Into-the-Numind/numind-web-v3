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
    <!-- 返回首页按钮 -->
    <button type="button" class="nav__back" @click="emit('back')">
      <ArrowLeft :size="16" aria-hidden="true" />
      <span>返回首页</span>
    </button>

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
import { ArrowLeft } from 'lucide-vue-next'
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
  accessibility?: Record<number, boolean>
}

const props = withDefaults(defineProps<Props>(), {
  trailingChatEnabled: false,
  streamingNodeId: null,
  accessibility: () => ({})
})

const emit = defineEmits<{
  (e: 'navigate', step: number): void
  (e: 'back'): void
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
      props.streamingNodeId ?? null,
      props.accessibility ?? {}
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
    props.streamingNodeId ?? null,
    props.accessibility ?? {}
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
  border-right: 1px solid hsla(160, 20%, 88%, 0.5);
  background: hsla(160, 30%, 96%, 0.65);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  padding: var(--space-lg) 14px var(--space-lg);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
  flex-shrink: 0;
}

.nav__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 11px 16px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: hsl(160, 18%, 52%);
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition:
    color 200ms ease,
    background 200ms ease;
  margin-bottom: var(--space-lg);
}

.nav__back:hover {
  color: hsl(160, 40%, 36%);
  background: hsla(160, 45%, 50%, 0.1);
}

.nav__group-label {
  font-size: 10px;
  font-weight: 600;
  color: hsl(160, 18%, 52%);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 6px 10px 8px;
}
.nav__group-label:not(:first-child) {
  padding-top: 18px;
}
</style>
