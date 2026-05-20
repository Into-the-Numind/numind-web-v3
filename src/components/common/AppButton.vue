<template>
  <button
    class="app-button"
    :class="[
      `app-button--${variant}`,
      `app-button--${size}`,
      { 'is-loading': loading, 'is-disabled': disabled }
    ]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="app-button__spinner">⏳</span>
    <slot />
  </button>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'text' | 'hero'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md'
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function handleClick(event: MouseEvent) {
  emit('click', event)
}
</script>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}

/* Variants */
.app-button--primary {
  background: var(--color-primary);
  color: var(--color-primary-foreground);
}

.app-button--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.app-button--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.app-button--secondary:hover:not(:disabled) {
  background: var(--color-surface-hover);
}

.app-button--text {
  background: transparent;
  color: var(--color-accent-link);
}

.app-button--text:hover:not(:disabled) {
  color: var(--color-accent-hover);
  background: var(--color-accent-ultra-soft);
}

/* hero — high-emphasis page-level CTA (e.g. "新建" / "创建" 顶部按钮) */
.app-button--hero {
  height: auto;
  padding: 10px 22px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 4px 16px hsl(158 64% 50% / 0.25);
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
}

.app-button--hero:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px hsl(158 64% 50% / 0.3);
}

.app-button--hero:active:not(:disabled) {
  transform: translateY(0);
}

/* Sizes */
.app-button--sm {
  height: 32px;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
}

.app-button--md {
  height: 40px;
  padding: 0 var(--space-4);
  font-size: var(--text-sm);
}

.app-button--lg {
  height: 48px;
  padding: 0 var(--space-6);
  font-size: var(--text-base);
}

/* States */
.app-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.app-button__spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
