<template>
  <Teleport to="body">
    <div v-if="visible && briefing" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-panel">
        <!-- Header -->
        <div class="panel-header">
          <h2 class="panel-title">{{ briefing.title || '无标题' }}</h2>
          <button class="close-btn" @click="emit('close')">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Scrollable content -->
        <div class="panel-body">
          <!-- Meta info -->
          <div class="meta-row">
            <span class="type-badge" :class="briefing.type">
              {{ briefing.type === 'weekly' ? '周报' : '日报' }}
            </span>
            <span class="meta-period">
              {{ formatDate(briefing.period_start) }} ~ {{ formatDate(briefing.period_end) }}
            </span>
          </div>

          <!-- Stats row -->
          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-num">{{ briefing.note_count }}</span>
              <span class="stat-label">笔记数</span>
            </div>
            <div class="stat-item">
              <span class="feishu-badge" :class="briefing.feishu_sent ? 'sent' : 'unsent'">
                {{ briefing.feishu_sent ? '已推送飞书' : '未推送' }}
              </span>
            </div>
          </div>

          <!-- Markdown content -->
          <div class="content-section">
            <div class="markdown-body" v-html="renderedContent"></div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import type { MonitorBriefing } from '@/api/monitor'

const props = defineProps<{
  briefing: MonitorBriefing | null
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const renderedContent = computed(() => {
  if (!props.briefing?.content) return '<p class="empty-text">暂无内容</p>'
  return marked(props.briefing.content) as string
})

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--space-xl);
}

.modal-panel {
  background: var(--surface);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

/* Header */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-xl) var(--space-xl) var(--space-lg);
  border-bottom: 1px solid var(--border-light);
  gap: var(--space-lg);
}

.panel-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text);
  margin: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.close-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}

/* Body */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

/* Meta */
.meta-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.type-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
}

.type-badge.daily {
  background: hsl(210, 60%, 93%);
  color: hsl(210, 60%, 45%);
}

.type-badge.weekly {
  background: hsl(280, 60%, 93%);
  color: hsl(280, 60%, 45%);
}

.meta-period {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* Stats */
.stats-row {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-lg);
  background: var(--surface-tint);
  border-radius: var(--radius-sm);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-num {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text);
}

.stat-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.feishu-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
}

.feishu-badge.sent {
  background: hsl(160, 60%, 93%);
  color: hsl(160, 72%, 34%);
}

.feishu-badge.unsent {
  background: hsl(0, 0%, 93%);
  color: hsl(0, 0%, 50%);
}

/* Markdown content */
.content-section {
  min-height: 100px;
}

.markdown-body {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: var(--text);
  margin: var(--space-lg) 0 var(--space-sm) 0;
  font-weight: 600;
}

.markdown-body :deep(h1) {
  font-size: var(--text-xl);
}

.markdown-body :deep(h2) {
  font-size: var(--text-lg);
}

.markdown-body :deep(h3) {
  font-size: var(--text-base);
}

.markdown-body :deep(p) {
  margin: 0 0 var(--space-sm) 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 var(--space-sm) 0;
  padding-left: var(--space-xl);
}

.markdown-body :deep(li) {
  margin-bottom: var(--space-xs);
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--accent);
  padding-left: var(--space-lg);
  margin: var(--space-sm) 0;
  color: var(--text-muted);
  font-style: italic;
}

.markdown-body :deep(code) {
  background: var(--surface-tint);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  background: var(--surface-tint);
  padding: var(--space-lg);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: var(--space-sm) 0;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-body :deep(.empty-text) {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-xl) 0;
}

/* Responsive */
@media (max-width: 768px) {
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .modal-panel {
    max-width: 100%;
    max-height: 90vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
