<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useLLMModelStore } from '@/stores/llmModel'

const props = defineProps<{
  feature: 'chatbot' | 'sop'
}>()

const store = useLLMModelStore()
const isOpen = ref(false)

const selectedModel = computed(() => store.getSelectedModel(props.feature))
const selectedModelKey = computed(() => store.getSelectedModelKey(props.feature))
const thinkingEnabled = computed(() => store.isThinkingEnabled(props.feature))
const isThinkingOnly = computed(() => selectedModel.value?.thinking_only ?? false)
const supportsThinking = computed(() => selectedModel.value?.supports_thinking ?? false)

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

async function selectModel(modelKey: string) {
  isOpen.value = false
  const thinking = store.isThinkingEnabled(props.feature)
  await store.savePreference(props.feature, modelKey, thinking)
}

async function toggleThinking() {
  if (!supportsThinking.value) return
  const modelKey = selectedModelKey.value
  const newThinking = !thinkingEnabled.value
  await store.savePreference(props.feature, modelKey, newThinking)
}

function onClickOutside(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('.model-selector-wrap')
  if (!el) isOpen.value = false
}

onMounted(async () => {
  document.addEventListener('click', onClickOutside)
  await store.fetchModels()
  await store.fetchPreferences()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>

<template>
  <div class="model-selector-wrap">
    <!-- Model pill -->
    <div class="model-pill" :class="{ active: isOpen }" @click.stop="toggleDropdown">
      <span class="model-name">{{ selectedModel?.display_name || '选择模型' }}</span>
      <ChevronDown :size="14" class="chevron" />

      <!-- Dropdown -->
      <div v-show="isOpen" class="model-dropdown" :class="{ 'drop-up': feature === 'chatbot' }">
        <div
          v-for="model in store.models"
          :key="model.model_key"
          class="model-option"
          :class="{ selected: model.model_key === selectedModelKey }"
          @click.stop="selectModel(model.model_key)"
        >
          <span class="model-option-name">{{ model.display_name }}</span>
          <span
            v-if="props.feature !== 'sop' && model.thinking_only"
            class="model-thinking-badge thinking-only-badge"
            >仅思考</span
          >
          <span
            v-else-if="props.feature !== 'sop' && model.supports_thinking"
            class="model-thinking-badge"
            >思考</span
          >
        </div>
        <div v-if="store.models.length === 0 && store.loading" class="model-loading">加载中...</div>
        <div v-if="store.models.length === 0 && !store.loading" class="model-empty">
          暂无可用模型
        </div>
      </div>
    </div>

    <!-- Thinking toggle (chatbot 保留；SOP 始终默认开启，不需要按钮) -->
    <button
      v-if="props.feature !== 'sop'"
      class="thinking-btn"
      :class="{
        enabled: thinkingEnabled,
        disabled: !supportsThinking && !isThinkingOnly,
        'thinking-only': isThinkingOnly
      }"
      :disabled="!supportsThinking && !isThinkingOnly"
      :title="
        isThinkingOnly
          ? '该模型始终使用深度思考'
          : supportsThinking
            ? thinkingEnabled
              ? '关闭深度思考'
              : '开启深度思考'
            : '当前模型不支持深度思考'
      "
      @click.stop="!isThinkingOnly && toggleThinking()"
    >
      <span>深度思考</span>
    </button>
  </div>
</template>

<style scoped>
.model-selector-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ---- Model pill ---- */
.model-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 30px;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  font-size: 12px;
  color: var(--text, #374151);
  font-weight: 500;
  user-select: none;
}

.model-pill:hover {
  background: white;
  border-color: var(--primary, #25a769);
  box-shadow: 0 2px 8px rgba(37, 167, 105, 0.1);
  color: var(--primary, #25a769);
}

.model-pill.active {
  border-color: var(--primary, #25a769);
  background: white;
  color: var(--primary, #25a769);
}

.model-name {
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  opacity: 0.5;
  flex-shrink: 0;
}

/* ---- Dropdown ---- */
.model-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  padding: 6px;
  min-width: 160px;
  width: max-content;
  z-index: 200;
}

.model-dropdown.drop-up {
  top: auto;
  bottom: calc(100% + 8px);
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text, #374151);
  transition: background 0.15s;
}

.model-option:hover {
  background: rgba(0, 0, 0, 0.04);
}

.model-option.selected {
  background: rgba(37, 167, 105, 0.08);
  color: var(--primary, #25a769);
  font-weight: 600;
}

.model-option-name {
  white-space: nowrap;
}

.model-thinking-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(37, 167, 105, 0.1);
  color: var(--primary, #25a769);
  font-weight: 500;
  flex-shrink: 0;
}

.model-loading,
.model-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}

/* ---- Thinking toggle button ---- */
.thinking-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  height: 30px;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
  color: var(--text, #374151);
  font-weight: 500;
  white-space: nowrap;
  font-family: inherit;
}

.thinking-btn:hover:not(.disabled) {
  background: white;
  border-color: var(--primary, #25a769);
  color: var(--primary, #25a769);
  box-shadow: 0 2px 8px rgba(37, 167, 105, 0.1);
}

.thinking-btn.enabled {
  background: rgba(37, 167, 105, 0.08);
  border-color: var(--primary, #25a769);
  color: var(--primary, #25a769);
}

.thinking-btn.thinking-only {
  cursor: default;
}

.thinking-only-badge {
  background: rgba(194, 65, 12, 0.1) !important;
  color: #c2410c !important;
}

.thinking-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
