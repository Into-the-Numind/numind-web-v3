<template>
  <div class="sop-list">
    <!-- 加载状态 -->
    <div v-if="store.loading" class="loading-state">
      <div v-for="i in 4" :key="i" class="skeleton-row"></div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <p class="error-text">{{ error }}</p>
      <AppButton variant="secondary" size="sm" @click="loadData">重试</AppButton>
    </div>

    <template v-else>
      <div class="config-list-panel">
        <!-- 头部 -->
        <div class="page-header">
          <div class="header-left">
            <h2 class="page-title">AI 工作流</h2>
            <p class="page-desc">创建和管理 AI 工作流模板</p>
          </div>
          <AppButton variant="hero" @click="router.push('/config/sop-templates/new/edit')">
            + 新建 AI 工作流
          </AppButton>
        </div>

        <!-- 空状态 -->
        <div v-if="store.sopTemplates.length === 0" class="empty-state">
          <div class="empty-illustration">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M10 13H8" />
              <path d="M16 17H8" />
              <path d="M16 13h-2" />
            </svg>
          </div>
          <div class="empty-title">暂无 AI 工作流</div>
          <div class="empty-desc">创建第一个 AI 工作流，标准化您的业务流程</div>
          <AppButton size="sm" @click="router.push('/config/sop-templates/new/edit')">
            新建 AI 工作流
          </AppButton>
        </div>

        <!-- 工具卡片 -->
        <template v-else>
          <div class="list-toolbar">
            <div class="status-filter" aria-label="AI 工作流状态筛选">
              <button
                v-for="option in statusOptions"
                :key="option.value"
                type="button"
                class="filter-chip"
                :class="{ active: statusFilter === option.value }"
                @click="statusFilter = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="filteredTemplates.length > 0" class="tool-card-grid">
            <article v-for="tpl in filteredTemplates" :key="tpl.id" class="tool-card">
              <div class="tool-card__top">
                <h3 class="tool-card__title">{{ tpl.name }}</h3>
                <span class="status-badge" :class="'status--' + tpl.publish_status">
                  {{ statusLabel(tpl.publish_status) }}
                </span>
              </div>
              <p class="tool-card__desc">
                {{ tpl.description || 'AI 工作流模板' }}
              </p>
              <div class="tool-card__footer">
                <span class="tool-card__date">{{ formatDate(tpl.created_at) }}</span>
                <button
                  class="action-link"
                  @click="router.push(`/config/sop-templates/${tpl.id}/edit`)"
                >
                  编辑
                </button>
              </div>
            </article>
          </div>
          <div v-else class="card-empty">没有匹配的 AI 工作流</div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import AppButton from '@/components/common/AppButton.vue'

const router = useRouter()
const store = useConfigStore()
const error = ref('')
type SopPublishStatus = 'draft' | 'published'
const statusFilter = ref<SopPublishStatus | 'all'>('all')

const statusOptions: Array<{ value: SopPublishStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '未发布' }
]

const filteredTemplates = computed(() => {
  if (statusFilter.value === 'all') return store.sopTemplates
  return store.sopTemplates.filter((tpl) => tpl.publish_status === statusFilter.value)
})

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: '未发布',
    published: '已发布'
  }
  return map[status] ?? status
}

function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function loadData() {
  error.value = ''
  try {
    await store.fetchSopTemplates()
  } catch {
    error.value = '加载失败，请重试'
  }
}

onMounted(loadData)
</script>

<style scoped>
.sop-list {
  width: 100%;
}

.config-list-panel {
  overflow: visible;
}

/* ── Loading & Error ── */

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 0;
}

.skeleton-row {
  height: 48px;
  background: var(--surface-tint);
  border-radius: var(--radius-md);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.error-state {
  text-align: center;
  padding: 64px 0;
}

.error-text {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
  margin-bottom: 16px;
  font-size: 0.875rem;
}

/* ── Page Header ── */

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-xl);
  margin: 0;
  padding: 0 0 var(--space-lg);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0;
}

.page-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: var(--line-height-normal);
}

/* ── Toolbar ── */

.list-toolbar {
  display: flex;
  justify-content: flex-start;
  padding: 0 0 var(--space-lg);
  margin: 0;
}

.status-filter {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-chip {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.filter-chip:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.filter-chip.active {
  color: var(--primary-hover);
  border-color: hsl(160 55% 82%);
  background: var(--accent-soft);
  font-weight: 600;
}

/* ── Empty State ── */

.empty-state {
  text-align: center;
  padding: 72px var(--space-xl);
}

.empty-illustration {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--surface-tint);
  color: var(--text-muted);
  margin-bottom: 20px;
}

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 24px;
}

/* ── Tool Cards ── */

.tool-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-md);
  padding: 0;
}

.tool-card {
  min-height: 146px;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-lg);
  background: var(--surface);
  border: 1px solid hsl(155 24% 91% / 0.9);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
}

.tool-card:hover {
  border-color: hsl(160 45% 82% / 0.9);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.tool-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.tool-card__title {
  min-width: 0;
  flex: 1;
  margin: 0;
  color: hsl(155, 25%, 18%);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: var(--line-height-tight);
}

.tool-card__desc {
  min-height: 34px;
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.tool-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: auto;
  padding-top: var(--space-sm);
  border-top: 1px solid var(--divider);
}

.tool-card__date {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 600;
}

.card-empty {
  padding: var(--space-3xl) var(--space-xl);
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

/* ── Status Badge ── */

.status-badge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.status--draft {
  background: #f3f4f6;
  color: #6b7280;
}

.status--published {
  background: var(--accent-soft);
  color: var(--accent);
}

.status--offline {
  background: #fee2e2; /* TODO(admin-rebrand): replace with --danger-soft token */
  color: #dc2626; /* TODO(admin-rebrand): replace with --danger token */
}

/* ── Action Links ── */

.action-group {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.action-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--accent-link);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.action-link:hover {
  color: var(--accent-hover);
  background: var(--accent-ultra-soft);
}

@media (max-width: 720px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .list-toolbar {
    padding: 0 0 var(--space-lg);
  }

  .tool-card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
