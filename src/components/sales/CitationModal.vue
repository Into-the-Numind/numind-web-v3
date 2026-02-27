<script setup lang="ts">
import { X, BookOpen } from 'lucide-vue-next'
import type { Citation } from '@/api/sales'

const props = defineProps<{
  open: boolean
  citations: Citation[]
}>()

const emit = defineEmits<{
  close: []
}>()

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      :class="{ open: props.open }"
      @click="onOverlayClick"
    >
      <div class="modal-card citation-modal-card">
        <div class="modal-header">
          <div class="citation-modal-title">
            <BookOpen :size="20" />
            <span>知识库引用</span>
            <span class="citation-count">{{ props.citations.length }}</span>
          </div>
          <button class="modal-close-btn" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>
        <div class="citation-list">
          <!-- Empty state -->
          <div v-if="!props.citations || props.citations.length === 0" class="citation-empty">
            <BookOpen :size="48" />
            <div class="citation-empty-text">暂无知识库引用</div>
            <div class="citation-empty-hint">本次回答未引用知识库内容</div>
          </div>

          <!-- Citation items -->
          <div
            v-for="(citation, index) in props.citations"
            :key="index"
            class="citation-item"
            :style="{ animationDelay: `${index * 0.05}s` }"
          >
            <div class="citation-header">
              <div class="citation-doc-info">
                <span class="citation-doc-name" :title="citation.document_name || '未知文档'">
                  <span class="citation-number">{{ index + 1 }}</span>
                  {{ citation.document_name || '未知文档' }}
                </span>
              </div>
              <div
                class="citation-score"
                :title="`相关度: ${Math.round((citation.score || 0) * 100)}%`"
              >
                <span>{{ Math.round((citation.score || 0) * 100) }}%</span>
              </div>
            </div>
            <div class="citation-content">{{ citation.content || '' }}</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
@import '@/assets/styles/sales-modal.css';
</style>

<style scoped>
/* ==================== Citation Modal Styles ==================== */
.citation-modal-card {
  width: 860px;
  max-width: 95%;
  max-height: 85vh;
}

.citation-modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
}

.citation-modal-title svg {
  color: var(--primary);
}

.citation-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  background: var(--primary);
  color: white;
  font-size: 12px;
  font-weight: 600;
  border-radius: 11px;
  margin-left: 4px;
}

.citation-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  background: rgba(0, 0, 0, 0.02);
}

.citation-list::-webkit-scrollbar {
  width: 8px;
}

.citation-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.citation-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.citation-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

.citation-item {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
  transition: all 0.2s;
  animation: slideInUp 0.3s ease forwards;
}

.citation-item:hover {
  border-color: rgba(37, 167, 105, 0.3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.citation-item:last-child {
  margin-bottom: 0;
}

.citation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(37, 167, 105, 0.04);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.citation-doc-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.citation-doc-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
  display: flex;
  align-items: center;
}

.citation-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
  border-radius: 50%;
  margin-right: 8px;
  flex-shrink: 0;
}

.citation-score {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(37, 167, 105, 0.1);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary);
  flex-shrink: 0;
}

.citation-content {
  padding: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.citation-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-muted);
  text-align: center;
}

.citation-empty svg {
  margin-bottom: 16px;
  opacity: 0.3;
}

.citation-empty-text {
  font-size: 14px;
  margin-bottom: 4px;
}

.citation-empty-hint {
  font-size: 12px;
  opacity: 0.7;
}

@media (max-width: 768px) {
  .citation-modal-card {
    width: 100%;
    max-height: 90vh;
    margin: 20px;
  }

  .citation-list {
    padding: 16px;
  }

  .citation-header {
    padding: 10px 12px;
  }

  .citation-content {
    padding: 12px;
    font-size: 13px;
  }
}
</style>
