<template>
  <section class="quick-reply">
    <div class="quick-reply-title">快捷提问</div>
    <div class="quick-reply-list">
      <button
        v-for="item in items"
        :key="item"
        type="button"
        class="quick-reply-item"
        :disabled="disabled"
        @click="$emit('select', item)"
      >
        {{ item }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    items: string[]
    disabled?: boolean
  }>(),
  {
    disabled: false
  }
)

defineEmits<{
  select: [value: string]
}>()
</script>

<style scoped>
.quick-reply {
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--surface);
  padding: 12px;
}

.quick-reply-title {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
  margin-bottom: 8px;
}

.quick-reply-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-reply-item {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  transition: all 0.2s ease;
}

.quick-reply-item:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-hover);
  background: hsl(158 50% 97%);
}

.quick-reply-item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>

