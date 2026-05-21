<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Bot,
  User,
  Briefcase,
  BookOpen,
  MessageCircle,
  GraduationCap,
  BarChart3,
  Lightbulb,
  Sparkles,
  Heart,
  Star,
  Coffee,
} from "lucide-vue-next";

interface Props {
  modelValue: string;
  readonly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const ICON_OPTIONS = [
  { name: "Bot", component: Bot },
  { name: "User", component: User },
  { name: "Briefcase", component: Briefcase },
  { name: "BookOpen", component: BookOpen },
  { name: "MessageCircle", component: MessageCircle },
  { name: "GraduationCap", component: GraduationCap },
  { name: "BarChart3", component: BarChart3 },
  { name: "Lightbulb", component: Lightbulb },
  { name: "Sparkles", component: Sparkles },
  { name: "Heart", component: Heart },
  { name: "Star", component: Star },
  { name: "Coffee", component: Coffee },
] as const;

type IconName = (typeof ICON_OPTIONS)[number]["name"];
const ICON_MAP = new Map<IconName, (typeof ICON_OPTIONS)[number]["component"]>(
  ICON_OPTIONS.map((o) => [o.name, o.component]),
);

const uploadError = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);

const isLucide = computed(() => props.modelValue.startsWith("lucide:"));
const isDataUrl = computed(() => props.modelValue.startsWith("data:"));

const currentLucideName = computed(() => {
  if (!isLucide.value) return null;
  return props.modelValue.slice("lucide:".length);
});

const currentLucideComponent = computed(() => {
  if (!currentLucideName.value) return null;
  return ICON_MAP.get(currentLucideName.value as IconName) ?? null;
});

function selectIcon(name: string): void {
  if (props.readonly) return;
  emit("update:modelValue", `lucide:${name}`);
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadError.value = "";

  const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
  if (file.size > MAX_BYTES) {
    uploadError.value = "图片不能超过 2MB";
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    emit("update:modelValue", result);
    input.value = "";
  };
  reader.readAsDataURL(file);
}
</script>

<template>
  <div class="avatar-picker" :class="{ 'avatar-picker--readonly': readonly }">
    <!-- Preview -->
    <div class="avatar-picker__preview">
      <component
        :is="currentLucideComponent"
        v-if="currentLucideComponent"
        :size="48"
        class="avatar-picker__preview-icon"
      />
      <img
        v-else-if="isDataUrl"
        :src="modelValue"
        alt="头像预览"
        width="48"
        height="48"
        class="avatar-picker__preview-img"
      />
    </div>

    <!-- Icon grid -->
    <div class="avatar-picker__grid" role="radiogroup" aria-label="选择图标">
      <button
        v-for="opt in ICON_OPTIONS"
        :key="opt.name"
        type="button"
        class="avatar-picker__tile"
        :class="{
          'avatar-picker__tile--selected': `lucide:${opt.name}` === modelValue,
        }"
        :disabled="readonly"
        :aria-checked="`lucide:${opt.name}` === modelValue"
        :aria-label="opt.name"
        @click="selectIcon(opt.name)"
      >
        <component :is="opt.component" :size="22" />
      </button>
    </div>

    <!-- Upload section — hidden when readonly -->
    <div v-if="!readonly" class="avatar-picker__upload">
      <label class="avatar-picker__upload-label">
        <span>上传图片（JPG / PNG，≤ 2MB）</span>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/jpeg,image/png"
          class="avatar-picker__file-input"
          @change="onFileChange"
        />
      </label>
      <p v-if="uploadError" class="avatar-picker__upload-error">
        {{ uploadError }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.avatar-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.avatar-picker__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: 2px solid var(--outline-variant, #a9b4b9);
  border-radius: 12px;
  background: var(--surface-low, #f0f4f7);
  overflow: hidden;
}

.avatar-picker__preview-icon {
  color: var(--on-surface-variant, #566166);
}

.avatar-picker__preview-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
}

.avatar-picker__grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  max-width: 280px;
}

.avatar-picker__tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--outline-variant, #a9b4b9);
  border-radius: 8px;
  background: var(--surface-lowest, #ffffff);
  color: var(--on-surface-variant, #566166);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
}

.avatar-picker__tile:hover:not(:disabled) {
  border-color: var(--tertiary, #005eb6);
  color: var(--tertiary, #005eb6);
}

.avatar-picker__tile--selected {
  border-color: var(--tertiary, #005eb6);
  background: var(--info-soft, #eff6ff);
  color: var(--tertiary, #005eb6);
}

.avatar-picker__tile:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.avatar-picker__upload {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.avatar-picker__upload-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--tertiary, #005eb6);
  cursor: pointer;
  user-select: none;
}

.avatar-picker__upload-label:hover {
  text-decoration: underline;
}

.avatar-picker__file-input {
  display: none;
}

.avatar-picker__upload-error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, #9f403d);
}
</style>
