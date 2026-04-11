<script setup lang="ts">
/**
 * SopStepView — SOP 节点的主区视图（F4 骨架）
 *
 * 职责：渲染 step header（标题 + 描述）+ 内容占位。
 * 真实的 input / output / streaming 组件将在 F5 / F6 / F7 中替换 placeholder。
 *
 * Props:
 *   - node：当前查看的 SOP 节点（trailing chat 时 StepCanvas 不会渲染本组件）
 *   - status：视图状态机值（spec §3.3，用于后续 task 分发子组件）
 *
 * 约束：
 *   - description 为空字符串时不渲染描述行（R4：types.ts 老节点 description 为 ""）
 *
 * 详见 spec §5.2 + plan F4。
 */
import type { SopNodePublic, ViewingStepStatus } from '@/views/sop/types'

defineProps<{
  node: SopNodePublic | null
  status: ViewingStepStatus
}>()
</script>

<template>
  <div class="sop-step-view">
    <header class="step-header">
      <h2 class="step-header__title">{{ node?.name ?? '' }}</h2>
      <p v-if="node?.description" class="step-header__desc">
        {{ node.description }}
      </p>
    </header>
    <div class="sop-step-view__placeholder">
      <p>内容加载中...</p>
    </div>
  </div>
</template>

<style scoped>
/* SopStepView —— 对齐 mockup 01 .step-header / .step-header__title / .step-header__desc
 * 使用 .sop-run-view-v2 scope 内的 --font-sans / --text / --space-* token。
 * 说明：22px / 14px 字号按 mockup 硬编码（scope 内无对应 token 变量），属于语义层级。
 */
.sop-step-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  font-family: var(--font-sans);
  color: var(--text);
}

.step-header {
  max-width: 980px;
  margin-bottom: var(--space-xl); /* 对齐 mockup 24px */
}

.step-header__title {
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 var(--space-sm);
  color: var(--text);
  letter-spacing: -0.005em;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.step-header__desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
  max-width: 720px;
}

.sop-step-view__placeholder {
  max-width: 980px;
  padding: var(--space-2xl) var(--space-xl);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 14px;
}

.sop-step-view__placeholder p {
  margin: 0;
}
</style>
