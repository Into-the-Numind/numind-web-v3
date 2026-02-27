<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { useMarkdown } from '@/composables/useMarkdown'

const props = defineProps<{
  content: string
  finished: boolean
}>()

const { render } = useMarkdown()
const collapsed = ref(false)

watch(
  () => props.finished,
  (val) => {
    if (val) collapsed.value = true
  }
)
</script>

<template>
  <div class="thinking-container" :class="{ collapsed, finished }">
    <div class="thinking-header" @click="collapsed = !collapsed">
      <div class="thinking-title">
        <span>{{ finished ? '思考完成' : '思考中...' }}</span>
      </div>
      <ChevronDown :size="14" class="thinking-icon" />
    </div>
    <div class="thinking-content" v-html="render(content)"></div>
  </div>
</template>

<style scoped>
.thinking-container {
  margin-bottom: 16px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.05);
  background-color: rgba(0, 0, 0, 0.02);
}

.thinking-header {
  padding: 8px 16px;
  background-color: rgba(0, 0, 0, 0.03);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-muted);
  user-select: none;
}

.thinking-header:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.thinking-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.thinking-icon {
  transition: transform 0.3s;
  transform: rotate(180deg);
}

.thinking-container.collapsed .thinking-icon {
  transform: rotate(0deg);
}

.thinking-content {
  padding: 12px 16px;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.6;
  white-space: pre-wrap;
  border-top: 1px dashed rgba(0, 0, 0, 0.05);
  transition: max-height 0.3s ease-out;
  max-height: 4000px;
  overflow-y: auto;
}

.thinking-container.collapsed .thinking-content {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-top-color: transparent;
}

.thinking-container.finished .thinking-icon {
  color: var(--primary);
}
</style>
