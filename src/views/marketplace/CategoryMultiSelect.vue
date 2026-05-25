<!--
  CategoryMultiSelect — Skill marketplace 分类多选小组件 (T9).

  agent-mode-v2-skill-marketplace spec §8.3.
  v-model: string[] — selected category tags.

  当前固定 6 个分类 (与 spec §2.1 category_tags 示例对齐); 后续可由 backend 提供枚举.
-->
<script setup lang="ts">
import { computed } from 'vue'

const CATEGORIES = ['销售', '调研', '数据分析', 'SOP', '客服', '其他'] as const

const props = defineProps<{
  modelValue: string[]
  max?: number // 上限选中数 (default 5 per spec §3.1 PublishRequest binding)
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const max = computed(() => props.max ?? 5)
const selected = computed(() => new Set(props.modelValue))

function toggle(cat: string) {
  const set = new Set(props.modelValue)
  if (set.has(cat)) {
    set.delete(cat)
  } else if (set.size < max.value) {
    set.add(cat)
  }
  emit('update:modelValue', Array.from(set))
}
</script>

<template>
  <div class="category-multi-select">
    <button
      v-for="cat in CATEGORIES"
      :key="cat"
      type="button"
      class="chip"
      :class="{ active: selected.has(cat) }"
      :disabled="!selected.has(cat) && modelValue.length >= max"
      @click="toggle(cat)"
    >
      {{ cat }}
    </button>
    <span class="hint">{{ modelValue.length }}/{{ max }}</span>
  </div>
</template>

<style scoped>
.category-multi-select {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-secondary, #f9fafb);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.chip:hover:not(:disabled) {
  background: var(--color-bg-tertiary, #f3f4f6);
}
.chip.active {
  background: var(--color-primary, #2563eb);
  color: #fff;
  border-color: var(--color-primary, #2563eb);
}
.chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hint {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  margin-left: 8px;
}
</style>
