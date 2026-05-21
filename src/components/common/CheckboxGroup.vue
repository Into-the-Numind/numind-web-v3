<script setup lang="ts">
import { computed } from "vue";

interface Option {
  value: string;
  label: string;
}

interface Props {
  modelValue: string[];
  options: Option[];
  allowOther?: boolean;
  otherLabel?: string;
  layout?: "vertical" | "horizontal";
  readonly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  allowOther: false,
  otherLabel: "其他（填写）",
  layout: "vertical",
  readonly: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

/** Values that match known option codes */
const knownValues = computed(() => new Set(props.options.map((o) => o.value)));

/**
 * The "other" free-text entry: any element in modelValue not in knownValues.
 * Returns the string or undefined.
 */
const otherEntry = computed<string | undefined>(() =>
  props.modelValue.find((v) => !knownValues.value.has(v)),
);

/** Whether the "other" checkbox is currently checked */
const otherChecked = computed<boolean>(() => otherEntry.value !== undefined);

function isChecked(value: string): boolean {
  return props.modelValue.includes(value);
}

function toggleKnown(value: string, checked: boolean): void {
  let next: string[];
  if (checked) {
    next = [...props.modelValue, value];
  } else {
    next = props.modelValue.filter((v) => v !== value);
  }
  emit("update:modelValue", next);
}

function toggleOther(checked: boolean): void {
  if (checked) {
    // Add empty placeholder so the text input becomes enabled
    if (!otherChecked.value) {
      emit("update:modelValue", [...props.modelValue, ""]);
    }
  } else {
    // Remove whatever other entry was present
    const next = props.modelValue.filter((v) => knownValues.value.has(v));
    emit("update:modelValue", next);
  }
}

function onOtherInput(event: Event): void {
  const text = (event.target as HTMLInputElement).value;
  const next = props.modelValue.filter((v) => knownValues.value.has(v));
  if (text) {
    next.push(text);
  } else {
    // Keep empty string so checkbox stays checked but no value
    next.push("");
  }
  emit("update:modelValue", next);
}
</script>

<template>
  <div
    class="checkbox-group"
    :class="[
      `checkbox-group--${layout}`,
      { 'checkbox-group--readonly': readonly },
    ]"
  >
    <label
      v-for="opt in options"
      :key="opt.value"
      class="checkbox-group__option"
    >
      <input
        type="checkbox"
        :value="opt.value"
        :checked="isChecked(opt.value)"
        :disabled="readonly"
        @change="
          toggleKnown(opt.value, ($event.target as HTMLInputElement).checked)
        "
      />
      <span>{{ opt.label }}</span>
    </label>

    <label
      v-if="allowOther"
      class="checkbox-group__option checkbox-group__option--other"
    >
      <input
        type="checkbox"
        :checked="otherChecked"
        :disabled="readonly"
        @change="toggleOther(($event.target as HTMLInputElement).checked)"
      />
      <span>{{ otherLabel }}</span>
      <input
        v-if="otherChecked"
        type="text"
        class="checkbox-group__other-input"
        :value="otherEntry ?? ''"
        :disabled="readonly"
        placeholder="请填写"
        @input="onOtherInput"
      />
    </label>
  </div>
</template>

<style scoped>
.checkbox-group {
  display: flex;
  gap: 8px;
}

.checkbox-group--vertical {
  flex-direction: column;
}

.checkbox-group--horizontal {
  flex-direction: row;
  flex-wrap: wrap;
}

.checkbox-group__option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
  user-select: none;
}

.checkbox-group--readonly .checkbox-group__option {
  cursor: default;
  opacity: 0.75;
}

.checkbox-group__option input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--tertiary, #005eb6);
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-group__option input[type="checkbox"]:disabled {
  cursor: not-allowed;
}

.checkbox-group__other-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  font-size: 14px;
  border: 1px solid var(--outline-variant, #a9b4b9);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
  outline: none;
  transition: border-color 0.15s;
}

.checkbox-group__other-input:focus {
  border-color: var(--tertiary, #005eb6);
}

.checkbox-group__other-input:disabled {
  background: var(--surface-tint);
  cursor: not-allowed;
}
</style>
