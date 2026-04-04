<template>
  <Teleport to="body">
    <div v-if="visible && note" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-panel">
        <!-- Header -->
        <div class="panel-header">
          <h2 class="panel-title">{{ note.title || '无标题' }}</h2>
          <button class="close-btn" @click="emit('close')">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Scrollable content -->
        <div class="panel-body">
          <!-- Meta info -->
          <div class="meta-row">
            <span class="type-badge" :class="note.note_type === 'video' ? 'video' : 'image'">
              {{ note.note_type === 'video' ? '视频' : '图文' }}
            </span>
            <span v-if="note.published_at" class="meta-date">
              发布于 {{ formatDate(note.published_at) }}
            </span>
          </div>

          <!-- Engagement stats -->
          <div class="stats-row">
            <div class="stat-item">
              <span class="stat-num">{{ formatNumber(note.likes) }}</span>
              <span class="stat-label">点赞</span>
            </div>
            <div class="stat-item">
              <span class="stat-num">{{ formatNumber(note.comments) }}</span>
              <span class="stat-label">评论</span>
            </div>
            <div class="stat-item">
              <span class="stat-num">{{ formatNumber(note.collects) }}</span>
              <span class="stat-label">收藏</span>
            </div>
            <div class="stat-item">
              <span class="stat-num">{{ formatNumber(note.shares) }}</span>
              <span class="stat-label">分享</span>
            </div>
          </div>

          <!-- Content text -->
          <div v-if="note.content" class="content-section">
            <h3 class="section-title">正文内容</h3>
            <p class="content-text">{{ note.content }}</p>
          </div>

          <!-- Tags -->
          <div v-if="note.tags && note.tags.length > 0" class="tags-section">
            <h3 class="section-title">标签</h3>
            <div class="tags-list">
              <span v-for="tag in note.tags" :key="tag" class="tag-item">#{{ tag }}</span>
            </div>
          </div>

          <!-- Images -->
          <div v-if="note.images && note.images.length > 0" class="images-section">
            <h3 class="section-title">图片 ({{ note.images.length }})</h3>
            <div class="images-grid">
              <img
                v-for="(img, idx) in note.images"
                :key="idx"
                :src="img"
                :alt="`图片 ${idx + 1}`"
                class="image-thumb"
              />
            </div>
          </div>

          <!-- Transcript (video notes) -->
          <div v-if="note.note_type === 'video' && note.transcript" class="transcript-section">
            <h3 class="section-title">视频文字稿</h3>
            <div class="transcript-box">
              <p class="transcript-text">{{ note.transcript }}</p>
            </div>
          </div>

          <!-- AI Analysis -->
          <div class="ai-section">
            <div class="ai-header">
              <h3 class="section-title">AI 分析</h3>
              <button
                class="analyze-btn"
                :disabled="analyzing"
                @click="handleAnalyze"
              >
                <span v-if="analyzing" class="btn-spinner"></span>
                {{ note.ai_summary ? '重新分析' : '开始分析' }}
              </button>
            </div>

            <template v-if="note.ai_summary">
              <div class="ai-block">
                <h4 class="ai-block-title">摘要</h4>
                <p class="ai-block-content">{{ note.ai_summary }}</p>
              </div>

              <div v-if="note.ai_topics && note.ai_topics.length > 0" class="ai-block">
                <h4 class="ai-block-title">主题</h4>
                <div class="topic-tags">
                  <span v-for="topic in note.ai_topics" :key="topic" class="topic-tag">
                    {{ topic }}
                  </span>
                </div>
              </div>

              <div v-if="note.ai_category" class="ai-block">
                <h4 class="ai-block-title">分类</h4>
                <span class="ai-category-tag">{{ note.ai_category }}</span>
              </div>
            </template>

            <div v-else class="ai-empty">
              <p class="ai-empty-text">尚未进行 AI 分析，点击上方按钮开始</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { MonitorNote } from '@/api/monitor'

const props = defineProps<{
  note: MonitorNote | null
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  analyze: [noteId: number]
}>()

const analyzing = ref(false)

async function handleAnalyze() {
  if (!props.note || analyzing.value) return
  analyzing.value = true
  try {
    emit('analyze', props.note.id)
  } finally {
    // Parent handles the actual API call; reset after a delay
    setTimeout(() => {
      analyzing.value = false
    }, 2000)
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
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
  max-width: 640px;
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

.type-badge.image {
  background: hsl(210, 60%, 93%);
  color: hsl(210, 60%, 45%);
}

.type-badge.video {
  background: hsl(280, 60%, 93%);
  color: hsl(280, 60%, 45%);
}

.meta-date {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* Stats */
.stats-row {
  display: flex;
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

/* Sections */
.section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  margin: 0 0 var(--space-sm) 0;
}

.content-text {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0;
  white-space: pre-wrap;
}

/* Tags */
.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.tag-item {
  display: inline-block;
  padding: 2px 10px;
  background: hsl(210, 40%, 94%);
  color: hsl(210, 50%, 50%);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
}

/* Images */
.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-sm);
}

.image-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.image-thumb:hover {
  transform: scale(1.03);
}

/* Transcript */
.transcript-box {
  padding: var(--space-lg);
  background: var(--surface-tint);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--accent);
}

.transcript-text {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0;
  white-space: pre-wrap;
}

/* AI Section */
.ai-section {
  background: var(--surface-tint);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
}

.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-lg);
}

.ai-header .section-title {
  margin-bottom: 0;
}

.analyze-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.analyze-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.analyze-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ai-block {
  margin-bottom: var(--space-lg);
}

.ai-block:last-child {
  margin-bottom: 0;
}

.ai-block-title {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 var(--space-xs) 0;
}

.ai-block-content {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0;
}

.topic-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.topic-tag {
  display: inline-block;
  padding: 2px 10px;
  background: var(--accent-ultra-soft);
  color: var(--accent);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
}

.ai-category-tag {
  display: inline-block;
  padding: 4px 12px;
  background: var(--accent-soft);
  color: var(--accent-hover);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
}

.ai-empty {
  text-align: center;
  padding: var(--space-lg) 0;
}

.ai-empty-text {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0;
}

/* Spinner */
.btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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

  .stats-row {
    gap: var(--space-md);
  }
}
</style>
