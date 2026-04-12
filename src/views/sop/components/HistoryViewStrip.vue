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
  <div class="history-view-strip" data-testid="history-view-strip">
    <div class="history-view-strip__info">
      <Eye :size="14" aria-hidden="true" />
      <span>正在查看历史步骤 · 输入不可修改</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Eye } from 'lucide-vue-next'
</script>

<style scoped>
/* ==================== Strip ==================== */

.history-view-strip {
  max-width: 980px;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 10px 16px;
  margin-bottom: 0;
  background: var(--accent-ultra-soft);
  border: 1px solid var(--border-light);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-md);
}

.history-view-strip__info {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
