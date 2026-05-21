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
  <aside class="nav" :class="{ 'nav--mobile-open': mobileOpen }" data-testid="sop-step-nav">
    <!-- 移动端关闭按钮：≤768px 显示，仅抽屉态使用 -->
    <button
      type="button"
      class="nav__mobile-close"
      title="关闭步骤导航"
      aria-label="关闭步骤导航"
      data-testid="sop-step-nav-mobile-close"
      @click="emit('closeMobile')"
    >
      <X :size="20" aria-hidden="true" />
    </button>

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
      :state="item.state"
      :bookmark-state="item.bookmarkState"
      @click="handleItemClick(item.step)"
      @toggle-bookmark="emit('toggle-bookmark', item.nodeId)"
    />

    <template v-if="trailingChatEnabled">
      <div class="nav__group-label">追问</div>
      <StepNavItem
        v-if="trailingItem"
        :step="trailingItem.step"
        :name="trailingItem.name"
        :is-trailing-chat="true"
        :state="trailingItem.state"
        @click="handleItemClick(trailingItem.step)"
      />
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, X } from 'lucide-vue-next'
import StepNavItem from './StepNavItem.vue'
import type { StepBookmarkState } from './StepNavItem.vue'
import { computeStepState, type StepNavItemState } from './stepNavState'
import type { SopNodePublic } from '@/views/sop/types'
import { useBookmarks } from '@/views/sop/composables/useBookmarks'

interface Props {
  nodes: SopNodePublic[]
  currentStep: number
  viewingStep: number
  completedNodeIds: number[] | Set<number>
  trailingChatEnabled?: boolean
  streamingNodeId?: number | null
  accessibility?: Record<number, boolean>
  /** 移动端抽屉是否展开。≤768px 时控制 transform 滑入/滑出。 */
  mobileOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  trailingChatEnabled: false,
  streamingNodeId: null,
  accessibility: () => ({}),
  mobileOpen: false
})

const emit = defineEmits<{
  (e: 'navigate', step: number): void
  (e: 'back'): void
  (e: 'closeMobile'): void
  (e: 'toggle-bookmark', nodeId: number): void
}>()

interface MainItemVm {
  step: number
  name: string
  nodeId: number
  state: StepNavItemState
  bookmarkState: StepBookmarkState
}

interface TrailingItemVm {
  step: number
  name: string
  state: StepNavItemState
}

const bookmarks = useBookmarks()

const completedNodeIdsSet = computed<Set<number>>(() =>
  props.completedNodeIds instanceof Set ? props.completedNodeIds : new Set(props.completedNodeIds)
)

/**
 * 决定一个 step 的书签 3 态：
 *   - streaming 中的节点 → 'unavailable'（output 还没落地）
 *   - 未 complete 的节点 → 'unavailable'
 *   - complete + 已有书签 → 'saved'
 *   - complete + 无书签 → 'savable'
 */
function deriveBookmarkState(nodeId: number): StepBookmarkState {
  if (props.streamingNodeId === nodeId) return 'unavailable'
  if (!completedNodeIdsSet.value.has(nodeId)) return 'unavailable'
  return bookmarks.hasBookmarkForNode(nodeId) ? 'saved' : 'savable'
}

const mainItems = computed<MainItemVm[]>(() =>
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
      nodeId: node.id,
      state,
      bookmarkState: deriveBookmarkState(node.id)
    }
  })
)

const trailingItem = computed<TrailingItemVm | null>(() => {
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
    name: '追问AI',
    state
  }
})

function handleItemClick(step: number): void {
  // StepNavItem 内部已守 disabled，这里信任 emit。
  emit('navigate', step)
  // 移动端：选中步骤后自动关抽屉，保持移动端"选完就走"的预期
  if (props.mobileOpen) emit('closeMobile')
}
</script>

<style scoped>
.nav {
  width: 264px;
  flex-shrink: 0;
  /* sticky 侧边栏：body 滚动时保持可见，自身高度限定 viewport，内部可滚 */
  position: sticky;
  top: 0;
  align-self: flex-start;
  height: 100vh;
  max-height: 100vh;
  overflow-y: auto;
  border-right: 1px solid hsla(160, 20%, 88%, 0.5);
  background: hsla(160, 30%, 96%, 0.65);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  padding: var(--space-lg) 14px var(--space-lg);
  display: flex;
  flex-direction: column;
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

/* 桌面端隐藏移动端关闭按钮 */
.nav__mobile-close {
  display: none;
}

/* ==================== 移动端：抽屉化 ==================== */
@media (max-width: 768px) {
  .nav {
    /* 抽屉：脱离文档流 + 固定定位 + 默认左移 100% 隐藏 */
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    /* 280px 比桌面 264px 略宽，给指尖更舒服的命中区 */
    width: 280px;
    max-width: 86vw;
    height: 100vh;
    height: 100dvh;
    /* iOS Safari 100vh 包括地址栏 → 用 dvh 取最接近 visible viewport 的高度，
       老 Safari (<15.4) 不支持 dvh 自然回退到上一行的 100vh 兜底 */
    transform: translateX(-100%);
    transition:
      transform 0.28s cubic-bezier(0.32, 0.72, 0, 1),
      box-shadow 0.28s ease;
    z-index: 100;
    border-right: 1px solid hsla(160, 20%, 88%, 0.5);
    /* 抽屉态背景必须实底（关闭时也可能 transition 中可见），避免与正文穿透 */
    background: hsla(160, 30%, 96%, 0.98);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    /* 抽屉内部独立滚动 + iOS 弹性 */
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    /* 抽屉态字体略大，触控易点 */
    padding: var(--space-md) 12px calc(var(--space-2xl) + env(safe-area-inset-bottom, 0px));
  }

  .nav--mobile-open {
    transform: translateX(0);
    box-shadow: 0 0 24px hsl(160 10% 0% / 0.18);
  }

  .nav__mobile-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* 触摸目标：44pt */
    width: 44px;
    height: 44px;
    align-self: flex-end;
    margin-bottom: var(--space-xs);
    border: none;
    border-radius: 10px;
    background: transparent;
    color: hsl(160, 18%, 35%);
    cursor: pointer;
    transition: background 200ms ease;
  }

  .nav__mobile-close:hover,
  .nav__mobile-close:active {
    background: hsla(160, 45%, 50%, 0.12);
  }

  .nav__back {
    /* 移动端：稍微加大点击区域 */
    padding: 14px 16px;
    font-size: 15px;
  }
}
</style>
