<script setup lang="ts">
import { ref } from "vue";
import { X } from "lucide-vue-next";

interface Props {
  modelValue: string[];
  max?: number;
  minLen?: number;
  maxLen?: number;
  placeholder?: string;
  readonly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  max: 4,
  minLen: 5,
  maxLen: 50,
  placeholder: "输入后按回车添加",
  readonly: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const inputValue = ref("");

function commitChip(): void {
  const text = inputValue.value.trim();
  if (!text) return;
  if (text.length < props.minLen || text.length > props.maxLen) {
    // Reject — do not emit. Clear input so user knows it was rejected.
    inputValue.value = "";
    return;
  }
  if (props.modelValue.length >= props.max) return;
  emit("update:modelValue", [...props.modelValue, text]);
  inputValue.value = "";
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    commitChip();
  }
}

function onBlur(): void {
  commitChip();
}

function removeChip(index: number): void {
  const next = [...props.modelValue];
  next.splice(index, 1);
  emit("update:modelValue", next);
}
</script>

<template>
  <div class="chip-input" :class="{ 'chip-input--readonly': readonly }">
    <div
      v-for="(chip, index) in modelValue"
      :key="index"
      class="chip-input__chip"
    >
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
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--outline-variant, #a9b4b9);
  border-radius: 8px;
  background: var(--surface-lowest, #ffffff);
  min-height: 40px;
}

.chip-input--readonly {
  background: var(--surface-low, #f0f4f7);
  cursor: default;
}

.chip-input__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: var(--surface, #e8eff3);
  border: 1px solid var(--outline-variant, #a9b4b9);
  border-radius: 9999px;
  font-size: 13px;
  color: var(--on-surface, #2a3439);
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
  color: var(--on-surface-variant, #566166);
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.15s;
}

.chip-input__chip-remove:hover {
  background: var(--surface-high, #e1e9ee);
}

.chip-input__input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--on-surface, #2a3439);
  padding: 2px 4px;
}

.chip-input__input::placeholder {
  color: var(--outline, #717c82);
}
</style>
