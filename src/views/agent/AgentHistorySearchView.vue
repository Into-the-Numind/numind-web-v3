<script setup lang="ts">
/*
 * Agent history full-text search view (Task 3.5).
 *
 * Backend: GET /v1/agent-runs/search with MySQL 8 FULLTEXT ngram (n=2).
 * Backed by numind-server task 3.5 feature.
 *
 * UX:
 *  - Search input with explicit "搜索" button (no implicit live search to avoid
 *    spamming the FULLTEXT index on every keystroke).
 *  - Four async states (硬规则 §2): loading / empty / error / success.
 *  - Each result shows session metadata + snippet (HTML-safe, server-escaped).
 *  - Click a result → jump to that session in read-only mode.
 *
 * Snippet HTML safety: the server escapes user content before inserting <mark>
 * tags. We render via v-html, which is safe ONLY for trusted strings — the
 * snippet is trusted because Go html.EscapeString runs before <mark> insertion.
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import MainLayout from '@/components/layout/MainLayout.vue'
import AppButton from '@/components/common/AppButton.vue'
import { searchAgentRuns, type AgentSearchResult } from '@/api/agentSearch'

const router = useRouter()

const goBack = (): void => {
  router.push({ name: 'agent-history' })
}

const query = ref('')
const results = ref<AgentSearchResult[]>([])
const total = ref(0)
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const hasSearched = ref(false)

const isEmptyAfterSearch = computed(
  () => hasSearched.value && !loading.value && results.value.length === 0 && !errorMsg.value
)

const doSearch = async (): Promise<void> => {
  const q = query.value.trim()
  if (!q) {
    errorMsg.value = '请输入搜索内容'
    results.value = []
    total.value = 0
    return
  }
  loading.value = true
  errorMsg.value = null
  hasSearched.value = true
  try {
    const resp = await searchAgentRuns({ q, limit: 20 })
    results.value = resp.results
    total.value = resp.total
  } catch (err) {
    errorMsg.value = (err as Error).message || '搜索失败,请稍后再试'
    results.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const handleResultClick = (sessionId: string): void => {
  router.push({
    name: 'agent-chat',
    params: { sessionId }
  })
}

const handleRetry = (): void => {
  void doSearch()
}

const formatTime = (iso: string): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const roleLabel = (role: string): string => {
  if (role === 'user') return '我'
  if (role === 'assistant') return '助手'
  return role
}
</script>

<template>
  <MainLayout>
    <div class="agent-history-search-page">
      <div class="back-link" @click="goBack">
        <ArrowLeft :size="16" />
        <span>返回历史会话</span>
      </div>

      <header class="page-header">
        <h1 class="page-title">搜索历史对话</h1>
        <p class="page-subtitle">支持中文短词检索，按相关度排序</p>
      </header>

      <div class="search-bar">
        <input
          v-model="query"
          type="text"
          class="search-input"
          placeholder="例如：王医生 / 合同跟进 / 订单进度"
          @keyup.enter="doSearch"
        />
        <AppButton variant="primary" :loading="loading" @click="doSearch">搜索</AppButton>
      </div>

      <!-- success: results list -->
      <section v-if="!loading && !errorMsg && results.length > 0" class="results-section">
        <p class="result-count">共 {{ total }} 条结果</p>
        <ul class="result-list">
          <li
            v-for="r in results"
            :key="r.message_uuid"
            class="result-item"
            :tabindex="0"
            @click="handleResultClick(r.session_id)"
            @keyup.enter="handleResultClick(r.session_id)"
          >
            <div class="result-meta">
              <span class="result-role" :data-role="r.role">{{ roleLabel(r.role) }}</span>
              <span class="result-time">{{ formatTime(r.created_at) }}</span>
            </div>
            <!--
              v-html is safe here: snippet markup is generated server-side after
              html.EscapeString runs on user content, so the only HTML present
              is the <mark>...</mark> tags inserted by the snippet algorithm.
            -->
            <p class="result-snippet" v-html="r.snippet" />
          </li>
        </ul>
      </section>

      <!-- loading -->
      <div v-else-if="loading" class="state-block">
        <div class="spinner" aria-hidden="true" />
        <p>搜索中...</p>
      </div>

      <!-- error -->
      <div v-else-if="errorMsg" class="state-block state-error">
        <p>{{ errorMsg }}</p>
        <AppButton variant="secondary" @click="handleRetry">重试</AppButton>
      </div>

      <!-- empty -->
      <div v-else-if="isEmptyAfterSearch" class="state-block">
        <p>没有找到匹配的对话</p>
        <p class="hint">试试更短的词，比如 "合同" 而不是 "合同跟进进度"</p>
      </div>

      <!-- initial: hint before any search -->
      <div v-else class="state-block">
        <p>输入关键字开始搜索</p>
        <p class="hint">仅显示你自己的对话记录</p>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.agent-history-search-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 20px;
  user-select: none;
}

.back-link:hover {
  color: var(--color-accent, #2563eb);
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text, #1f2937);
  margin: 0 0 8px;
}

.page-subtitle {
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  margin: 0;
}

.search-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 24px;
}

.search-input {
  flex: 1;
  height: 40px;
  padding: 0 var(--space-3, 12px);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  font-size: var(--text-sm, 14px);
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1f2937);
  transition: all var(--transition-fast, 0.15s);
}

.search-input:focus {
  outline: none;
  border-color: var(--color-accent, #2563eb);
  box-shadow: var(--shadow-focus, 0 0 0 3px rgba(37, 99, 235, 0.15));
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-count {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 8px;
}

.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.result-item:hover,
.result-item:focus {
  border-color: var(--color-accent, #2563eb);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
  outline: none;
}

.result-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}

.result-role {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 12px;
  background: var(--color-surface-tint, #f3f4f6);
}

.result-role[data-role='user'] {
  background: rgba(37, 99, 235, 0.1);
  color: var(--color-accent, #2563eb);
}

.result-role[data-role='assistant'] {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.result-snippet {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #1f2937);
  word-break: break-word;
}

/*
 * The snippet HTML contains <mark> tags inserted by the backend snippet
 * algorithm. <mark> is rendered with our brand accent color so matches stand
 * out without looking like default yellow-highlighter spam.
 */
.result-snippet :deep(mark) {
  background: rgba(245, 158, 11, 0.2);
  color: var(--color-text, #1f2937);
  font-weight: 600;
  padding: 0 2px;
  border-radius: 2px;
}

.state-block {
  text-align: center;
  padding: 48px 24px;
  color: var(--color-text-muted, #6b7280);
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.state-block .hint {
  font-size: 13px;
  opacity: 0.8;
  margin: 0;
}

.state-error {
  color: var(--color-danger, #dc2626);
}

.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--color-border, #e5e7eb);
  border-top-color: var(--color-accent, #2563eb);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
