<!--
  ToolbarActions — SOP 步骤工具栏组件

  职责：
    - 上一步 / 下一步导航按钮
    - 复制输出到剪贴板
    - 重新生成按钮（文案根据 dirty 检测 + 书签状态动态变化）

  ## Regenerate 按钮动态文案（等价复刻 legacy 行为）

  - 默认："重新生成"
  - 若当前输入相对原始值 dirty **且** 当前节点有书签："重新生成（将删除书签）"
  - 若无 canRegenerate 权限：按钮隐藏

  ## Props

  - canRegenerate: boolean — 是否可以重新生成
  - canCopy: boolean — 是否可以复制（有输出才可）
  - canGoPrev: boolean — 是否可以返回上一步
  - canGoNext: boolean — 是否可以进入下一步
  - isDirty: boolean — 当前输入是否被修改（用于书签警告）
  - hasBookmark: boolean — 当前节点是否关联书签
  - nextLabel: string — 下一步按钮文案（默认"下一步"）

  ## Emits

  - copy — 点击复制
  - regenerate — 点击重新生成（父组件决定是否显示 ConfirmModal）
  - prev — 点击上一步
  - next — 点击下一步

  父组件负责：
    - 监听 copy 时实际调用 navigator.clipboard.writeText
    - 监听 regenerate 时：若 isDirty && hasBookmark，先弹 ConfirmModal 确认再执行
    - 监听 prev/next 时调用 store.setActiveStep
-->
<template>
  <div class="toolbar-actions">
    <div class="toolbar-actions-left">
      <button
        v-if="canGoPrev"
        type="button"
        class="toolbar-btn toolbar-btn--secondary"
        @click="emit('prev')"
      >
        <span aria-hidden="true">←</span>
        <span>上一步</span>
      </button>
    </div>

    <div class="toolbar-actions-right">
      <button
        v-if="canCopy"
        type="button"
        class="toolbar-btn toolbar-btn--ghost"
        aria-label="复制输出到剪贴板"
        @click="emit('copy')"
      >
        <span aria-hidden="true">⎘</span>
        <span>复制</span>
      </button>

      <button
        v-if="canRegenerate"
        type="button"
        class="toolbar-btn toolbar-btn--ghost"
        :class="{ 'toolbar-btn--warning': isDirty && hasBookmark }"
        @click="emit('regenerate')"
      >
        <span aria-hidden="true">↻</span>
        <span>{{ regenerateLabel }}</span>
      </button>

      <button
        v-if="canGoNext"
        type="button"
        class="toolbar-btn toolbar-btn--primary"
        @click="emit('next')"
      >
        <span>{{ nextLabel }}</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  canRegenerate?: boolean
  canCopy?: boolean
  canGoPrev?: boolean
  canGoNext?: boolean
  isDirty?: boolean
  hasBookmark?: boolean
  nextLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  canRegenerate: false,
  canCopy: false,
  canGoPrev: false,
  canGoNext: false,
  isDirty: false,
  hasBookmark: false,
  nextLabel: '下一步'
})

const emit = defineEmits<{
  copy: []
  regenerate: []
  prev: []
  next: []
}>()

/**
 * Regenerate 文案：dirty 且有书签时提示"将删除书签"。
 */
const regenerateLabel = computed(() => {
  if (props.isDirty && props.hasBookmark) {
    return '重新生成（将删除书签）'
  }
  return '重新生成'
})
</script>

<style scoped>
.toolbar-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) 0;
  flex-wrap: wrap;
}

.toolbar-actions-left,
.toolbar-actions-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  border: 1px solid transparent;
}

.toolbar-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.toolbar-btn--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-border);
}

.toolbar-btn--secondary:hover {
  background: var(--color-surface-hover);
  border-color: var(--primary);
}

.toolbar-btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

.toolbar-btn--ghost:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.toolbar-btn--warning {
  color: var(--color-danger, #dc2626);
}

.toolbar-btn--warning:hover {
  background: var(--color-danger-soft, #fef2f2);
}

.toolbar-btn--primary {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

.toolbar-btn--primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}
</style>
