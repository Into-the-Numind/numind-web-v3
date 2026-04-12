<!--
  StepNavItem.vue — 单条 step nav item（F3 task）

  5 个视觉状态：
    - active          当前任务，翠绿 ring + accent-ultra-soft 底
    - done            已完成，✓ check icon 绿底白字
    - viewing         正在看历史步骤，中性灰 highlight（无翠绿）
    - pending-return  虚线 accent-light border，提示"当前任务等你回来"
    - disabled        灰掉不可点击

  props/emits 与 spec §5.2 + plan F3 对齐。
  CSS 类名严格对齐 mockup 01 的 .step / .step--{state} / .step__marker /
  .step__dot / .step__body / .step__title / .step__desc / .step__status。

  Spec 引用：§3.2 状态机 + §5.2 StepNavItem.vue
  Mockup 引用：01-active-and-history.html 行 737-784 + 850-887
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
    <div class="step__marker">
      <span class="step__dot">
        <Check v-if="state === 'done'" :size="12" aria-hidden="true" />
        <MessageCircle v-else-if="isTrailingChat" :size="11" aria-hidden="true" />
        <template v-else>{{ step }}</template>
      </span>
    </div>
    <div class="step__body">
      <div class="step__title">{{ name }}</div>
      <p v-if="description" class="step__desc">{{ description }}</p>
      <div v-if="statusLine" class="step__status">{{ statusLine }}</div>
    </div>
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
  /** 节点描述；R4 graceful fallback：为 null/空 时不渲染描述行 */
  description?: string | null
  /** 5 态视觉 */
  state: StepNavItemState
  /** 可选状态行（如 "已完成 · 7.4s" / "等待输入" / "当前任务 · 点击返回"） */
  statusLine?: string
  /** 是否为 trailing chat 项（影响图标展示） */
  isTrailingChat?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  description: null,
  statusLine: '',
  isTrailingChat: false
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

const stateClass = computed(() => `step--${props.state}`)

const ariaLabel = computed(() => {
  const base = `步骤 ${props.step}：${props.name}`
  return props.statusLine ? `${base}，${props.statusLine}` : base
})

function handleClick(): void {
  if (props.state === 'disabled') return
  emit('click')
}
</script>

<style scoped>
.step {
  position: relative;
  padding: var(--space-md) var(--space-md) var(--space-md) var(--space-lg);
  margin: 2px 0;
  border-radius: var(--radius-md);
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 10px;
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

.step__marker {
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
}

.step__dot {
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

.step__body {
  min-width: 0;
}
.step__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 3px;
  line-height: 1.35;
}
.step__desc {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.45;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.step__status {
  font-size: 10.5px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  letter-spacing: 0.01em;
  margin-top: 5px;
}

/* ---------- state: done ---------- */
.step--done .step__dot {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}

/* ---------- state: active ---------- */
.step--active {
  background: var(--accent-ultra-soft);
}
.step--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--space-sm);
  bottom: var(--space-sm);
  width: 3px;
  background: var(--primary);
  border-radius: 0 3px 3px 0;
}
.step--active .step__title {
  color: var(--primary-hover);
}
.step--active .step__dot {
  border-color: var(--primary);
  background: var(--accent-ultra-soft);
  color: var(--primary-hover);
  box-shadow: var(--shadow-focus);
}

/* ---------- state: viewing — 与 active 统一绿色底 ---------- */
.step--viewing {
  background: var(--accent-ultra-soft);
}
.step--viewing::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--space-sm);
  bottom: var(--space-sm);
  width: 3px;
  background: var(--primary);
  border-radius: 0 3px 3px 0;
}
.step--viewing .step__title {
  color: var(--primary-hover);
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
