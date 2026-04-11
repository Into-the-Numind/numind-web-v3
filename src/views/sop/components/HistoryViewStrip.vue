<!--
  HistoryViewStrip — 历史步骤只读提示条（F7）

  职责：
    - state B 主区顶部的 info strip（spec D5 硬约束：viewing 历史步骤时必须
      提示"输入不可修改"并给出返回当前任务的 CTA）
    - 左侧 accent 竖线 + Eye icon + 说明文字
    - 右侧 ghost 小按钮 "返回步骤 N"（N = 当前任务步骤序号）
    - 整条横跨主区（max-width 980px），border-bottom 做分隔

  Mockup 无直接对应，自研视觉与既有设计语言同系：
    - 浅 accent 背景（var(--accent-ultra-soft)）
    - accent 左边框作为状态指示
    - typography 使用 text-sm + text-secondary

  ## Props

  - targetStep: number — 返回目标步骤序号（通常为 store.currentStep）
  - targetName: string — 返回目标步骤名称（用于 aria-label / 未来 tooltip 拓展）

  ## Emits

  - return — 点击返回按钮；父组件应调用 store.returnToCurrentTask
-->
<template>
  <div class="history-view-strip">
    <div class="history-view-strip__info">
      <Eye :size="14" aria-hidden="true" />
      <span>正在查看历史步骤 · 输入不可修改</span>
    </div>
    <button
      type="button"
      class="history-view-strip__return"
      :aria-label="`返回当前任务：${targetName}`"
      @click="emit('return')"
    >
      <span>返回步骤 {{ targetStep }}</span>
      <ArrowRight :size="13" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, Eye } from 'lucide-vue-next'

interface Props {
  targetStep: number
  targetName: string
}

defineProps<Props>()

const emit = defineEmits<{
  return: []
}>()
</script>

<style scoped>
/* ==================== Strip ==================== */

.history-view-strip {
  max-width: 980px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-lg);
  margin-bottom: var(--space-lg);
  background: var(--accent-ultra-soft);
  border: 1px solid var(--border-light);
  border-left: 2px solid var(--accent);
  border-radius: var(--radius-md);
}

.history-view-strip__info {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/* ==================== Return button ==================== */

.history-view-strip__return {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  font-family: inherit;
  transition:
    background-color var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base);
}

.history-view-strip__return:hover {
  color: var(--text);
  background: var(--surface-hover);
  border-color: var(--accent-soft);
}
</style>
