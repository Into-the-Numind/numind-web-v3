<!--
  StepNavItem.vue — 单条 step nav item

  布局：icon 在左 + title 居中 + 收藏星标在右，水平 row + 垂直居中。
  渲染 marker icon、节点名、可选的 ⭐ 书签星标。

  5 个 step 视觉状态：active / done / viewing / pending-return / disabled

  Bookmark 3 态（与 step state 正交）：
    - 'saved'       已收藏 → 填色 ⭐
    - 'savable'     可收藏（步骤有 output，但未收藏）→ outline ⭐
    - 'unavailable' 不渲染（步骤无 output / streaming / trailing chat）

  点击 ⭐ 触发 toggle-bookmark，stopPropagation 不冒泡到步骤 click。
-->
<template>
  <div
    :class="['step', stateClass, { 'step--trailing': isTrailingChat }]"
    :data-testid="'sop-nav-item'"
    :data-step-state="state"
    :data-step="step"
    :data-bookmark-state="bookmarkState"
    :role="state === 'disabled' ? undefined : 'button'"
    :tabindex="state === 'disabled' ? -1 : 0"
    :aria-disabled="state === 'disabled' ? 'true' : undefined"
    :aria-current="state === 'active' ? 'step' : undefined"
    :aria-label="ariaLabel"
    @click="handleClick"
    @keydown.enter.prevent="handleClick"
    @keydown.space.prevent="handleClick"
  >
    <span class="step__dot">
      <Check v-if="state === 'done'" :size="12" aria-hidden="true" />
      <MessageCircle v-else-if="isTrailingChat" :size="11" aria-hidden="true" />
      <template v-else>{{ step }}</template>
    </span>
    <div class="step__title">{{ name }}</div>
    <button
      v-if="bookmarkState !== 'unavailable'"
      type="button"
      class="step__star"
      :class="{ 'step__star--saved': bookmarkState === 'saved' }"
      :title="bookmarkState === 'saved' ? '已收藏 · 点击移除' : '收藏此步骤'"
      :aria-label="bookmarkState === 'saved' ? `移除步骤 ${step} 的收藏` : `收藏步骤 ${step}`"
      data-testid="step-bookmark-toggle"
      @click.stop="handleToggleBookmark"
      @keydown.enter.stop.prevent="handleToggleBookmark"
      @keydown.space.stop.prevent="handleToggleBookmark"
    >
      <Star
        :size="14"
        :fill="bookmarkState === 'saved' ? 'currentColor' : 'none'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, MessageCircle, Star } from 'lucide-vue-next'
import type { StepNavItemState } from './stepNavState'

export type StepBookmarkState = 'saved' | 'savable' | 'unavailable'

interface Props {
  /** 1-based step 序号 */
  step: number
  /** 节点名（或 trailing chat 固定文案） */
  name: string
  /** 5 态视觉 */
  state: StepNavItemState
  /** 是否为 trailing chat 项（影响图标展示） */
  isTrailingChat?: boolean
  /** 书签 3 态。默认 'unavailable' 不渲染 ⭐ */
  bookmarkState?: StepBookmarkState
}

const props = withDefaults(defineProps<Props>(), {
  isTrailingChat: false,
  bookmarkState: 'unavailable'
})

const emit = defineEmits<{
  (e: 'click'): void
  /**
   * 收藏星标点击 —— 故意 payload-free。StepNavItem 是纯展示组件，只知道
   * 自己的 step 序号与文字，不持有 nodeId / bookmarkId 等业务身份。父组件
   * （StepNav）通过 v-for 绑定 item.nodeId 自行解析触发对象。
   */
  (e: 'toggle-bookmark'): void
}>()

const stateClass = computed(() => `step--${props.state}`)

const ariaLabel = computed(() => `步骤 ${props.step}：${props.name}`)

function handleClick(): void {
  if (props.state === 'disabled') return
  emit('click')
}

function handleToggleBookmark(): void {
  emit('toggle-bookmark')
}
</script>

<style scoped>
.step {
  position: relative;
  padding: var(--space-md);
  margin: 2px 0;
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: row;
  align-items: center;
  text-align: left;
  gap: var(--space-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
  background: transparent;
  border: 1px solid transparent;
}
.step:hover {
  background: var(--surface-hover);
}
.step:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.step__dot {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--border);
  background: var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.step__title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
}

/* ---------- state: done ---------- */
.step--done .step__dot {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}

/* ---------- state: active ---------- *
   区分靠背景色 + 字重 + dot ring，避免 border-left 装饰条（impeccable 禁令）*/
.step--active {
  background: var(--accent-ultra-soft);
}
.step--active .step__title {
  color: var(--primary-hover);
  font-weight: 700;
}
.step--active .step__dot {
  border-color: var(--primary);
  background: var(--accent-ultra-soft);
  color: var(--primary-hover);
  box-shadow: var(--shadow-focus);
}

/* ---------- state: viewing — 与 active 同语言，bg + weight 区分 ---------- */
.step--viewing {
  background: var(--accent-ultra-soft);
}
.step--viewing .step__title {
  color: var(--primary-hover);
  font-weight: 700;
}
.step--viewing .step__dot {
  border-color: var(--primary);
  background: var(--accent-ultra-soft);
  color: var(--primary-hover);
  box-shadow: var(--shadow-focus);
}

/* ---------- state: pending-return — 非选中态，与 done 一致 ---------- */
.step--pending-return .step__dot {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}

/* ---------- state: disabled ---------- */
.step--disabled {
  opacity: 0.52;
  cursor: not-allowed;
}
.step--disabled:hover {
  background: transparent;
}
.step--disabled .step__title {
  color: var(--text-secondary);
}
.step--disabled .step__dot {
  border-style: dashed;
}

/* ---------- step__star ----------
   独立的 button，触控区 24×24，hover/focus 与 step 行解耦。
   saved 态用主色 + filled，savable 态用 muted + outline。*/
.step__star {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  margin-left: var(--space-xs);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background var(--transition-fast),
    border-color var(--transition-fast);
}
.step__star:hover {
  color: var(--text);
  background: var(--surface);
  border-color: var(--border);
}
.step__star:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
.step__star--saved {
  color: var(--primary);
}
.step__star--saved:hover {
  color: var(--primary-hover);
  background: var(--accent-ultra-soft);
  border-color: var(--accent-soft);
}
</style>
