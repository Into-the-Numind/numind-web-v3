<!--
  ActionRow — 主区底部按钮行（F7）

  职责：
    - state E 完成态渲染 "重新生成"（secondary/ghost）+ "下一步"（primary）
    - state B 历史态复用作 "返回步骤 N"（由 props 配置）
    - 右对齐，max-width 对齐主区 canvas（980px）

  ## Props

  - primary: { label, icon?, disabled? } — 主 CTA（必须）
  - secondary?: { label, icon?, disabled? } — 次 CTA（可选，ghost 样式）

  icon 字符串解析为 Lucide 组件，支持常见键：
    - 'arrow-right'  → ArrowRight
    - 'arrow-left'   → ArrowLeft
    - 'rotate-cw'    → RotateCw

  未知 key → 返回 null（不渲染 icon，按钮只显示文字）。

  ## Emits

  - primary — 点击主按钮
  - secondary — 点击次按钮
-->
<template>
  <div class="action-row" data-testid="action-row">
    <button
      v-if="secondary"
      type="button"
      class="action-row__btn action-row__btn--ghost"
      :disabled="secondary.disabled"
      @click="emit('secondary')"
    >
      <component :is="secondaryIcon" v-if="secondaryIcon" :size="13" aria-hidden="true" />
      <span>{{ secondary.label }}</span>
    </button>
    <button
      type="button"
      class="action-row__btn action-row__btn--primary"
      :disabled="primary.disabled"
      @click="emit('primary')"
    >
      <span>{{ primary.label }}</span>
      <component :is="primaryIcon" v-if="primaryIcon" :size="14" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import { ArrowLeft, ArrowRight, Check, RotateCw } from 'lucide-vue-next'

interface ActionConfig {
  label: string
  icon?: string
  disabled?: boolean
}

interface Props {
  primary: ActionConfig
  secondary?: ActionConfig | null
}

const props = withDefaults(defineProps<Props>(), {
  secondary: null
})

const emit = defineEmits<{
  primary: []
  secondary: []
}>()

// 支持的 icon 键 → Lucide 组件映射。未命中返回 null。
const ICON_MAP: Record<string, Component> = {
  'arrow-right': ArrowRight,
  'arrow-left': ArrowLeft,
  'rotate-cw': RotateCw,
  check: Check
}

function resolveIcon(key?: string): Component | null {
  if (!key) return null
  return ICON_MAP[key] ?? null
}

const primaryIcon = computed(() => resolveIcon(props.primary.icon))
const secondaryIcon = computed(() => resolveIcon(props.secondary?.icon))
</script>

<style scoped>
/* ==================== Row ==================== */

.action-row {
  max-width: 980px;
  margin-top: var(--space-lg);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-md);
}

/* ==================== Buttons ==================== */

.action-row__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  font-family: inherit;
  transition:
    background-color var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base),
    opacity var(--transition-base);
}

.action-row__btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.action-row__btn--primary {
  background: var(--primary);
  color: var(--primary-foreground);
}

.action-row__btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.action-row__btn--ghost {
  background: var(--surface);
  color: var(--text-secondary);
  border-color: var(--border);
}

.action-row__btn--ghost:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-hover);
}
</style>
