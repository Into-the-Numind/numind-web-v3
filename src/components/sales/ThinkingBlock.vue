<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { useMarkdown } from '@/composables/useMarkdown'

const props = withDefaults(
  defineProps<{
    content: string
    finished: boolean
    /**
     * When true, the block auto-collapses once `finished` is true (agent mode:
     * fold the thinking record on completion / on reload). Default false keeps
     * the sales + chatbot behaviour (always expanded). Users can still toggle.
     */
    autoCollapse?: boolean
  }>(),
  { autoCollapse: false }
)

const { render } = useMarkdown()
// Start collapsed only when we should auto-collapse AND it's already finished
// (e.g. a reloaded/historical thinking block). While streaming it stays open.
const collapsed = ref(props.autoCollapse && props.finished)

// Auto-collapse the moment thinking finishes (the answer begins / run completes),
// so the completed transcript shows folded thinking with the answer below.
// One-directional by design: `finished` only goes false→true within a message's
// life (the discriminated-union message model never resets it), and after the
// fold the user can still manually re-expand via the header — we never re-fold.
watch(
  () => props.finished,
  (fin) => {
    if (props.autoCollapse && fin) collapsed.value = true
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
      <ChevronRight :size="14" class="thinking-icon" aria-hidden="true" />
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

/* Disclosure chevron:折叠时指右 ▶（base rotate 0），展开时指下 ▼（rotate 90deg）。
   标准 disclosure 约定，sales/chatbot/agent 共用。 */
.thinking-icon {
  width: 14px;
  height: 14px;
  transition: transform 0.3s;
  transform: rotate(0deg);
}

.thinking-container:not(.collapsed) .thinking-icon {
  transform: rotate(90deg);
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

.thinking-content :deep(*) {
  color: inherit !important;
}

.thinking-content :deep(strong) {
  font-weight: 600;
}
</style>
