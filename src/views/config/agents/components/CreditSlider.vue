<script setup lang="ts">
import { computed } from "vue";

interface Props {
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  readonly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  min: 200,
  max: 2000,
  step: 100,
  readonly: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const helpText = computed(() => {
  const v = props.modelValue;
  if (v < 500) return "适合简单问答";
  if (v <= 1500) return "适合数据分析";
  return "适合复杂多步骤任务";
});

function clamp(n: number): number {
  return Math.min(props.max, Math.max(props.min, n));
}

function onRangeChange(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value);
  emit("update:modelValue", clamp(raw));
}

function onNumberBlur(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value);
  const next = Number.isFinite(raw) ? clamp(raw) : props.min;
  // Snap to nearest step
  const snapped = Math.round(next / props.step) * props.step;
  emit("update:modelValue", clamp(snapped));
}

function onNumberInput(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(raw)) {
    const clamped = clamp(raw);
    emit("update:modelValue", clamped);
  }
}
</script>

<template>
  <div class="credit-slider" :class="{ 'credit-slider--readonly': readonly }">
    <div class="credit-slider__controls">
      <input
        type="range"
        class="credit-slider__range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="readonly"
        @change="onRangeChange"
        @input="onRangeChange"
      />
      <input
        type="number"
        class="credit-slider__number"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="readonly"
        @input="onNumberInput"
        @blur="onNumberBlur"
      />
    </div>
    <p class="credit-slider__help">{{ helpText }}</p>
  </div>
</template>

<style scoped>
.credit-slider {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.credit-slider__controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.credit-slider__range {
  flex: 1;
  accent-color: var(--tertiary, #005eb6);
  cursor: pointer;
  height: 4px;
}

.credit-slider__range:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.credit-slider__number {
  width: 80px;
  padding: 4px 8px;
  font-size: 14px;
  border: 1px solid var(--outline-variant, #a9b4b9);
  border-radius: 6px;
  background: var(--surface-lowest, #ffffff);
  color: var(--on-surface, #2a3439);
  text-align: center;
  outline: none;
  transition: border-color 0.15s;
}

.credit-slider__number:focus {
  border-color: var(--tertiary, #005eb6);
}

.credit-slider__number:disabled {
  background: var(--surface-low, #f0f4f7);
  cursor: not-allowed;
}

.credit-slider__help {
  margin: 0;
  font-size: 12px;
  color: var(--on-surface-variant, #566166);
}
</style>
