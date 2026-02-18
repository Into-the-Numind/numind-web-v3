<template>
  <div class="app-input-wrapper">
    <label v-if="label" class="app-input__label">{{ label }}</label>
    <input
      class="app-input"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="handleInput"
      @blur="$emit('blur', $event)"
    />
    <span v-if="error" class="app-input__error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
interface Props {
  modelValue?: string
  type?: 'text' | 'password' | 'email' | 'number'
  label?: string
  placeholder?: string
  disabled?: boolean
  error?: string
}

withDefaults(defineProps<Props>(), {
  type: 'text',
  modelValue: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  blur: [event: FocusEvent]
}>()

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}
</script>

<style scoped>
.app-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.app-input__label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
}

.app-input {
  height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--color-surface);
  color: var(--color-text);
  transition: all var(--transition-fast);
}

.app-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--shadow-focus);
}

.app-input::placeholder {
  color: var(--color-text-muted);
}

.app-input:disabled {
  background: var(--color-surface-tint);
  cursor: not-allowed;
}

.app-input__error {
  font-size: var(--text-xs);
  color: #ef4444;
}
</style>