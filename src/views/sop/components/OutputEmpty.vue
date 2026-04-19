<!--
  OutputEmpty — 虚线边框纯视觉占位（F6）

  用于 state A / empty-skip 场景，当某步骤无 output 展示时的占位。
  对齐 mockup `.output-empty`。
-->
<template>
  <div class="output-empty">
    <div class="output-empty__glyph" aria-hidden="true">
      <FileText :size="16" />
    </div>
    <p class="output-empty__hint">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { FileText } from 'lucide-vue-next'

interface Props {
  message?: string
}

withDefaults(defineProps<Props>(), {
  message: '（暂无输出）'
})
</script>

<style scoped>
.output-empty {
  max-width: 980px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: var(--space-2xl) var(--space-xl);
  text-align: center;
  color: var(--text-muted);
  margin-bottom: var(--space-lg);
}

.output-empty__glyph {
  width: var(--space-3xl);
  height: var(--space-3xl);
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 1px solid var(--border-light);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-sm);
}

.output-empty__hint {
  font-size: var(--text-xs);
  margin: 0;
  color: var(--text-muted);
}
</style>
