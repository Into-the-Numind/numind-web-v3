<template>
  <div class="content-feed">
    <!-- Filter bar -->
    <div class="filter-bar">
      <div class="filter-group">
        <select v-model="filterBloggerId" class="filter-select" @change="loadNotes(1)">
          <option :value="0">全部博主</option>
          <option v-for="b in store.bloggers" :key="b.id" :value="b.id">
            {{ b.nickname || b.xhs_user_id }}
          </option>
        </select>

        <select v-model="filterNoteType" class="filter-select" @change="loadNotes(1)">
          <option value="">全部类型</option>
          <option value="normal">图文</option>
          <option value="video">视频</option>
        </select>

        <select v-model="sortBy" class="filter-select" @change="loadNotes(1)">
          <option value="published_at">最新发布</option>
          <option value="likes">最多点赞</option>
        </select>
      </div>

      <div class="filter-group">
        <input
          v-model="keyword"
          type="text"
          class="search-input"
          placeholder="搜索标题或内容..."
          @keydown.enter="loadNotes(1)"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="store.loading && store.notes.length === 0" class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">加载笔记...</div>
    </div>

    <!-- Empty -->
    <div v-else-if="store.notes.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg
          viewBox="0 0 24 24"
          width="48"
          height="48"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </div>
      <h3 class="empty-title">暂无笔记内容</h3>
      <p class="empty-desc">添加博主并等待首次检查完成后，笔记将自动出现在这里</p>
    </div>

    <!-- Note cards grid -->
    <div v-else class="notes-grid">
      <div v-for="note in store.notes" :key="note.id" class="note-card" @click="openDetail(note)">
        <!-- Cover image -->
        <div v-if="note.images && note.images.length > 0" class="note-cover">
          <img :src="note.images[0]" :alt="note.title" class="cover-img" />
          <span v-if="note.note_type === 'video'" class="video-badge">视频</span>
        </div>

        <!-- Content -->
        <div class="note-body">
          <h4 class="note-title">{{ note.title || '无标题' }}</h4>

          <div class="note-meta">
            <span class="note-blogger">{{ getBloggerName(note.blogger_id) }}</span>
            <span class="note-date">{{ formatDate(note.published_at) }}</span>
          </div>

          <!-- Tags -->
          <div class="note-tags">
            <span class="type-badge" :class="note.note_type === 'video' ? 'video' : 'image'">
              {{ note.note_type === 'video' ? '视频' : '图文' }}
            </span>
            <span v-if="note.ai_category" class="ai-tag">{{ note.ai_category }}</span>
          </div>

          <!-- Engagement -->
          <div class="note-engagement">
            <span class="eng-item" title="点赞">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                />
              </svg>
              {{ formatNumber(note.likes) }}
            </span>
            <span class="eng-item" title="评论">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {{ formatNumber(note.comments) }}
            </span>
            <span class="eng-item" title="收藏">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              {{ formatNumber(note.collects) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="store.notesTotal > pageSize" class="pagination">
      <button class="page-btn" :disabled="currentPage <= 1" @click="loadNotes(currentPage - 1)">
        上一页
      </button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <button
        class="page-btn"
        :disabled="currentPage >= totalPages"
        @click="loadNotes(currentPage + 1)"
      >
        下一页
      </button>
    </div>

    <!-- Note detail modal -->
    <NoteDetail
      :note="selectedNote"
      :visible="showDetail"
      @close="showDetail = false"
      @analyze="handleAnalyze"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import type { MonitorNote } from '@/api/monitor'
import { analyzeNote } from '@/api/monitor'
import NoteDetail from './NoteDetail.vue'

const store = useMonitorStore()

// Pagination
const currentPage = ref(1)
const pageSize = 20
const totalPages = computed(() => Math.ceil(store.notesTotal / pageSize))

// Filters
const filterBloggerId = ref(0)
const filterNoteType = ref('')
const sortBy = ref('published_at')
const keyword = ref('')

// Detail
const selectedNote = ref<MonitorNote | null>(null)
const showDetail = ref(false)

async function loadNotes(page: number) {
  currentPage.value = page
  await store.fetchNotes({
    offset: (page - 1) * pageSize,
    limit: pageSize,
    blogger_id: filterBloggerId.value || undefined,
    note_type: filterNoteType.value || undefined,
    keyword: keyword.value.trim() || undefined
  })
}

function openDetail(note: MonitorNote) {
  selectedNote.value = note
  showDetail.value = true
}

async function handleAnalyze(noteId: number) {
  try {
    const res = await analyzeNote(noteId)
    // Update the note in local state
    if (res.data) {
      selectedNote.value = res.data
      const idx = store.notes.findIndex((n) => n.id === noteId)
      if (idx >= 0) {
        store.notes[idx] = res.data
      }
    }
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    const msg = err?.response?.data?.message || '分析失败'
    alert(msg)
  }
}

function getBloggerName(bloggerId: number): string {
  const blogger = store.bloggers.find((b) => b.id === bloggerId)
  return blogger?.nickname || blogger?.xhs_user_id || '未知博主'
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

onMounted(() => {
  // Load bloggers for the filter dropdown if not already loaded
  if (store.bloggers.length === 0) {
    store.fetchBloggers({ offset: 0, limit: 100 })
  }
  loadNotes(1)
})
</script>

<style scoped>
.content-feed {
  width: 100%;
}

/* Filter bar */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xl);
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  cursor: pointer;
  outline: none;
}

.filter-select:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.search-input {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  outline: none;
  min-width: 200px;
  transition: border-color var(--transition-fast);
}

.search-input:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.search-input::placeholder {
  color: var(--text-muted);
}

/* Loading */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-4xl) 0;
  gap: var(--space-lg);
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-light);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* Empty */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
  gap: var(--space-sm);
  text-align: center;
}

.empty-icon {
  color: var(--text-muted);
  opacity: 0.4;
  margin-bottom: var(--space-sm);
}

.empty-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.empty-desc {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0;
  max-width: 360px;
}

/* Notes grid */
.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-lg);
}

.note-card {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-card);
}

.note-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--border);
  transform: translateY(-2px);
}

/* Cover image */
.note-cover {
  position: relative;
  width: 100%;
  height: 160px;
  overflow: hidden;
  background: var(--surface-hover);
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-badge {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
}

/* Note body */
.note-body {
  padding: var(--space-md) var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.note-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: var(--line-height-tight);
}

.note-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.note-blogger {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-date {
  font-size: var(--text-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* Tags */
.note-tags {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.type-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
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

.ai-tag {
  display: inline-block;
  padding: 1px 8px;
  background: var(--accent-ultra-soft);
  color: var(--accent);
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 500;
}

/* Engagement */
.note-engagement {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding-top: var(--space-xs);
  border-top: 1px solid var(--border-light);
}

.eng-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  margin-top: var(--space-xl);
  padding-top: var(--space-lg);
}

.page-btn {
  padding: 6px 16px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.page-btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* Responsive */
@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-group {
    flex-wrap: wrap;
  }

  .search-input {
    min-width: 0;
    width: 100%;
  }

  .notes-grid {
    grid-template-columns: 1fr;
  }
}
</style>
