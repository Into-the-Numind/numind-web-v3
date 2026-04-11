<!--
  ScrollFollowButton — 跳回底部悬浮按钮

  职责：当用户在流式输出期间向上滚动（打断自动跟随）时，显示一个"跳回底部"
  的浮动按钮，点击后恢复自动滚动到最新内容。

  ## 解耦设计

  本组件**不直接持有 useScrollFollow 实例**，仅接收 visible prop 和 emit click。
  父组件（SOPRunView）负责协调：
    - 从 StepOutput 的 defineExpose 拿到 scrollFollow
    - visible = scrollFollow.isInterrupted.value
    - @click 时调用 scrollFollow.resume(scrollContainerRef.value)

  这样 ScrollFollowButton 保持纯展示，可在任何场景复用（如 TrailingChatPanel
  task 20 同样需要此按钮）。

  ## Props

  - visible: boolean — 是否显示按钮
  - label?: string — 按钮文案（默认"跳到最新"）

  ## Emits

  - click — 用户点击按钮
-->
<template>
  <Transition name="scroll-follow-fade">
    <button
      v-if="visible"
      type="button"
      class="scroll-follow-button"
      :aria-label="label"
      @click="emit('click')"
    >
      <span class="scroll-follow-arrow" aria-hidden="true">↓</span>
      <span class="scroll-follow-label">{{ label }}</span>
    </button>
  </Transition>
</template>

<script setup lang="ts">
interface Props {
  visible: boolean
  label?: string
}

withDefaults(defineProps<Props>(), {
  label: '跳到最新'
})

const emit = defineEmits<{
  click: []
}>()
</script>

<style scoped>
.scroll-follow-button {
  position: absolute;
  bottom: var(--space-xl);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-md);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
  z-index: var(--z-fixed);
}

.scroll-follow-button:hover {
  background: var(--primary-hover);
  box-shadow: var(--shadow-lg);
  transform: translateX(-50%) translateY(-2px);
}

.scroll-follow-button:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus), var(--shadow-md);
}

.scroll-follow-arrow {
  font-size: var(--text-base);
  line-height: 1;
}

/* 进入/离开动画：从下方淡入 */
.scroll-follow-fade-enter-active,
.scroll-follow-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.scroll-follow-fade-enter-from,
.scroll-follow-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

.scroll-follow-fade-enter-to,
.scroll-follow-fade-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
