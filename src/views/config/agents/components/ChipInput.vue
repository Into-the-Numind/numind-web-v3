<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'

interface Props {
  modelValue: string[]
  max?: number
  minLen?: number
  maxLen?: number
  placeholder?: string
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  max: 4,
  minLen: 5,
  maxLen: 50,
  placeholder: '输入后按回车添加',
  readonly: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const inputValue = ref('')

function commitChip(): void {
  const text = inputValue.value.trim()
  if (!text) return
  if (text.length < props.minLen || text.length > props.maxLen) {
    // Reject — do not emit. Clear input so user knows it was rejected.
    inputValue.value = ''
    return
  }
  if (props.modelValue.length >= props.max) return
  emit('update:modelValue', [...props.modelValue, text])
  inputValue.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitChip()
  }
}

function onBlur(): void {
  commitChip()
}

function removeChip(index: number): void {
  const next = [...props.modelValue]
  next.splice(index, 1)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="chip-input" :class="{ 'chip-input--readonly': readonly }">
    <div v-for="(chip, index) in modelValue" :key="index" class="chip-input__chip">
      <span class="chip-input__chip-text">{{ chip }}</span>
      <button
        v-if="!readonly"
        type="button"
        class="chip-input__chip-remove"
        :aria-label="`删除 ${chip}`"
        @click="removeChip(index)"
      >
        <X :size="12" />
      </button>
    </div>

    <input
      v-if="!readonly && modelValue.length < max"
      v-model="inputValue"
      type="text"
      class="chip-input__input"
      :placeholder="placeholder"
      @keydown="onKeydown"
      @blur="onBlur"
    />
  </div>
</template>

<style scoped>
.chip-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  min-height: 44px;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.chip-input:focus-within {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.chip-input--readonly {
  background: var(--surface-tint);
  cursor: default;
}

.chip-input--readonly:focus-within {
  border-color: var(--border);
  box-shadow: none;
}

.chip-input__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 4px var(--space-md);
  background: var(--accent-soft);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font-size: var(--text-sm);
  color: var(--accent-link);
  white-space: nowrap;
  max-width: 240px;
}

.chip-input__chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-input__chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent-link);
  cursor: pointer;
  border-radius: var(--radius-pill);
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

.chip-input__chip-remove:hover {
  background: var(--accent-light);
  color: var(--primary-foreground);
}

.chip-input__input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--text-sm);
  color: var(--text);
  padding: 2px var(--space-xs);
}

.chip-input__input::placeholder {
  color: var(--text-muted);
}
</style>
