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
      <ChevronDown :size="14" class="thinking-icon" aria-hidden="true" />
      <span>{{ finished ? '思考过程' : '思考中...' }}</span>
    </div>
    <div class="thinking-content" v-html="render(content)"></div>
  </div>
</template>

<style scoped>
.thinking-container {
  margin-bottom: 12px;
}

.thinking-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
}

.thinking-header:hover {
  color: var(--text-secondary, var(--text));
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
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.7;
  transition:
    max-height 0.3s ease-out,
    margin-top 0.3s ease-out,
    opacity 0.2s ease-out;
  max-height: 4000px;
  overflow: hidden;
  opacity: 0.9;
}

.thinking-container.collapsed .thinking-content {
  max-height: 0;
  margin-top: 0;
  opacity: 0;
}

.thinking-content :deep(p) {
  margin: 0 0 6px;
}

.thinking-content :deep(p:last-child) {
  margin-bottom: 0;
}

.thinking-content :deep(ul),
.thinking-content :deep(ol) {
  margin: 0 0 6px;
  padding-left: 20px;
}

.thinking-content :deep(li) {
  margin-bottom: 2px;
}

.thinking-content :deep(strong) {
  color: var(--text-secondary, var(--text));
  font-weight: 600;
}
</style>
