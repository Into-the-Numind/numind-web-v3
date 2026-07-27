<template>
  <div class="chatbot-list">
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
      <!-- 头部 -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="page-title">AI 助手</h2>
          <p class="page-desc">创建和管理 AI 助手，为客户提供智能对话服务</p>
        </div>
        <AppButton variant="hero" @click="router.push('/config/chatbots/new/edit')">
          + 新建 AI 助手
        </AppButton>
      </div>

      <!-- 空状态 -->
      <div v-if="store.chatbots.length === 0" class="empty-state">
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
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
        </div>
        <div class="empty-title">暂无 AI 助手</div>
        <div class="empty-desc">创建第一个 AI 助手，开始为客户提供智能对话服务</div>
        <AppButton size="sm" @click="router.push('/config/chatbots/new/edit')">
          新建 AI 助手
        </AppButton>
      </div>

      <!-- 数据表格 -->
      <template v-else>
        <div class="list-toolbar">
          <div class="status-filter" aria-label="AI 助手状态筛选">
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

        <div class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th class="col-left">名称</th>
                <th>状态</th>
                <th>创建时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="bot in filteredChatbots" :key="bot.id">
                <td class="cell-name" @click="router.push(`/config/chatbots/${bot.id}/edit`)">
                  {{ bot.name }}
                </td>
                <td>
                  <span class="status-badge" :class="'status--' + bot.status">
                    {{ statusLabel(bot.status) }}
                  </span>
                </td>
                <td class="cell-secondary">{{ formatDate(bot.created_at) }}</td>
                <td class="col-action">
                  <div class="action-group">
                    <button
                      class="action-link"
                      @click="router.push(`/config/chatbots/${bot.id}/edit`)"
                    >
                      编辑
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="filteredChatbots.length === 0">
                <td colspan="4" class="table-empty">没有匹配的 AI 助手</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import AppButton from '@/components/common/AppButton.vue'
import type { ChatbotStatus } from '@/types/config'

const router = useRouter()
const store = useConfigStore()
const error = ref('')
const statusFilter = ref<ChatbotStatus | 'all'>('all')

const statusOptions: Array<{ value: ChatbotStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '未发布' }
]

const filteredChatbots = computed(() => {
  if (statusFilter.value === 'all') return store.chatbots
  return store.chatbots.filter((bot) => bot.status === statusFilter.value)
})

function statusLabel(status: ChatbotStatus): string {
  const map: Record<ChatbotStatus, string> = {
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
    await store.fetchChatbots()
  } catch {
    error.value = '加载失败，请重试'
  }
}

onMounted(loadData)
</script>

<style scoped>
.chatbot-list {
  width: 100%;
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
  align-items: flex-start;
  margin-bottom: 24px;
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
  letter-spacing: -0.01em;
}

.page-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

/* ── Toolbar ── */

.list-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
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
  padding: 80px 0;
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

/* ── Table Card ── */

.table-card {
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.95), hsla(150, 12%, 98%, 0.9));
  border: 1px solid hsla(155, 30%, 90%, 0.7);
  border-radius: 20px;
  box-shadow:
    0 2px 12px hsl(150 15% 0% / 0.05),
    0 0 0 1px hsl(155 20% 92% / 0.3),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: center;
  padding: 14px 16px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 15%, 50%);
  letter-spacing: 0.04em;
  border-bottom: 1px solid hsl(155, 20%, 93%);
  white-space: nowrap;
  background: hsla(150, 15%, 98%, 0.5);
}

.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid hsl(155, 20%, 95%);
  color: hsl(155, 15%, 25%);
  vertical-align: middle;
  text-align: center;
}

.data-table tbody tr {
  transition: background 0.15s;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr:hover td {
  background: hsl(155, 20%, 98%);
}

.table-empty {
  padding: 40px 16px;
  color: var(--text-muted);
  text-align: center;
}

.data-table td.cell-name {
  font-weight: 600;
  color: hsl(155, 25%, 18%);
  text-align: left;
  cursor: pointer;
}

.cell-name:hover {
  color: var(--accent);
}

.data-table th.col-left {
  text-align: left;
}

.cell-secondary {
  font-size: 13px;
  font-weight: 500;
  color: hsl(155, 15%, 35%);
}

.data-table th.col-action,
.data-table td.col-action {
  text-align: right;
}

/* ── Status Badge ── */

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
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
</style>
