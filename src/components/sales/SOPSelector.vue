<template>
  <section class="panel">
    <header class="panel-header">
      <h3>SOP 话术模板</h3>
      <button type="button" class="refresh-btn" :disabled="loading" @click="$emit('refresh')">
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <div v-if="loading" class="placeholder">正在加载模板...</div>
    <div v-else-if="!options.length" class="placeholder">暂无可用模板</div>

    <div v-else class="template-list">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="template-item"
        :class="{ active: selectedId === option.id }"
        @click="$emit('update:selectedId', option.id)"
      >
        <span class="template-name">{{ option.name }}</span>
        <span v-if="option.description" class="template-desc">{{ option.description }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { SalesSopTemplate } from '@/api/sales'

defineProps<{
  options: SalesSopTemplate[]
  selectedId: number | null
  loading: boolean
}>()

defineEmits<{
  refresh: []
  'update:selectedId': [id: number]
}>()
</script>

<style scoped>
.panel {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  background: linear-gradient(180deg, #fff 0%, hsl(158 32% 98%) 100%);
  padding: 18px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.panel-header h3 {
  font-size: 16px;
  color: var(--text);
  font-weight: 700;
}

.refresh-btn {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.placeholder {
  border: 1px dashed var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  text-align: center;
  font-size: 13px;
  padding: 16px 12px;
}

.template-list {
  max-height: 300px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
}

.template-item {
  border: 1px solid var(--border-light);
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: all 0.2s ease;
}

.template-item:hover {
  border-color: var(--accent-light);
}

.template-item.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px hsl(158 64% 90% / 0.4);
}

.template-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.template-desc {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>

