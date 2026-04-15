<!--
  StepNavItem.vue — 单条 step nav item

  布局：icon 在左 + title 在右，水平 row + 垂直居中，文字左对齐。
  仅渲染 marker icon 与节点名，不再展示 description / status line。

  5 个视觉状态：active / done / viewing / pending-return / disabled
-->
<template>
  <div
    :class="['step', stateClass, { 'step--trailing': isTrailingChat }]"
    :data-testid="'sop-nav-item'"
    :data-step-state="state"
    :data-step="step"
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, MessageCircle } from 'lucide-vue-next'
import type { StepNavItemState } from './stepNavState'

interface Props {
  /** 1-based step 序号 */
  step: number
  /** 节点名（或 trailing chat 固定文案） */
  name: string
  /** 5 态视觉 */
  state: StepNavItemState
  /** 是否为 trailing chat 项（影响图标展示） */
  isTrailingChat?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isTrailingChat: false
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

const stateClass = computed(() => `step--${props.state}`)

const ariaLabel = computed(() => `步骤 ${props.step}：${props.name}`)

function handleClick(): void {
  if (props.state === 'disabled') return
  emit('click')
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
</style>
