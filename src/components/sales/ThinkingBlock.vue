<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useMarkdown } from '@/composables/useMarkdown'

const props = defineProps<{
  content: string
  finished: boolean
}>()

const { render } = useMarkdown()
const collapsed = ref(props.finished)

watch(
  () => props.finished,
  (val) => {
    if (val) collapsed.value = true
  }
)
</script>

<template>
  <div class="thinking-container" :class="{ collapsed, finished }">
    <div
      class="thinking-header"
      role="button"
      tabindex="0"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
      @keydown.enter.prevent="collapsed = !collapsed"
    >
      <span class="thinking-title">
        <ChevronDown :size="14" class="thinking-icon" aria-hidden="true" />
        <span>{{ finished ? '思考过程' : '思考中...' }}</span>
      </span>
    </div>
    <div class="thinking-content" v-html="render(content)"></div>
  </div>
</template>

<style scoped>
.thinking-container {
  margin-bottom: 16px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid hsl(155, 20%, 92%);
  background-color: hsl(150, 25%, 96%);
}

.thinking-header {
  padding: 8px 16px;
  background-color: hsl(150, 25%, 94%);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary, var(--text-muted));
  user-select: none;
}

.thinking-header:hover {
  background-color: hsl(150, 25%, 92%);
}

.thinking-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.thinking-icon {
  width: 14px;
  height: 14px;
  transition: transform 0.3s;
  transform: rotate(0deg);
}

.thinking-container:not(.collapsed) .thinking-icon {
  transform: rotate(180deg);
}

.thinking-content {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-secondary, var(--text-muted));
  line-height: 1.6;
  white-space: pre-wrap;
  border-top: 1px solid hsl(155, 20%, 92%);
  transition:
    max-height 0.3s ease-out,
    padding 0.3s ease-out,
    border-top-color 0.3s ease-out;
  max-height: 4000px;
  overflow-y: auto;
}

.thinking-container.collapsed .thinking-content {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-top-color: transparent;
}

.thinking-content :deep(p) {
  margin: 0 0 4px;
}

.thinking-content :deep(p:last-child) {
  margin-bottom: 0;
}

.thinking-content :deep(br) {
  line-height: 1.2;
}
</style>
