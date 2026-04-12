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
          <h2 class="page-title">智能体管理</h2>
          <p class="page-desc">创建和管理 AI 智能体，为客户提供智能对话服务</p>
        </div>
        <AppButton size="sm" @click="router.push('/config/chatbots/new/edit')">
          + 新建智能体
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
        <div class="empty-title">暂无智能体</div>
        <div class="empty-desc">创建第一个智能体，开始为客户提供智能对话服务</div>
        <AppButton size="sm" @click="router.push('/config/chatbots/new/edit')">
          新建智能体
        </AppButton>
      </div>

      <!-- 数据表格 -->
      <div v-else class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>状态</th>
              <th>知识库数</th>
              <th>创建时间</th>
              <th class="col-action">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bot in store.chatbots" :key="bot.id">
              <td class="cell-name">{{ bot.name }}</td>
              <td>
                <span class="status-badge" :class="'status--' + bot.status">
                  {{ statusLabel(bot.status) }}
                </span>
              </td>
              <td class="cell-secondary">{{ bot.knowledge_base_count ?? '-' }}</td>
              <td class="cell-secondary">{{ formatDate(bot.created_at) }}</td>
              <td class="col-action">
                <div class="action-group">
                  <button
                    class="action-link"
                    @click="router.push(`/config/chatbots/${bot.id}/edit`)"
                  >
                    编辑
                  </button>
                  <button class="action-link" @click="router.push(`/chatbot/${bot.id}`)">
                    测试对话
                  </button>
                  <button
                    v-if="bot.status !== 'published'"
                    class="action-link action--publish"
                    @click="handlePublish(bot.id)"
                  >
                    发布
                  </button>
                  <button
                    v-if="bot.status === 'published'"
                    class="action-link action--offline"
                    @click="handleOffline(bot.id)"
                  >
                    下线
                  </button>
                  <button class="action-link action--danger" @click="handleDelete(bot.id)">
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import AppButton from '@/components/common/AppButton.vue'
import type { ChatbotStatus } from '@/types/config'

const router = useRouter()
const store = useConfigStore()
const error = ref('')

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

async function handlePublish(id: number) {
  if (!confirm('确认发布该智能体？')) return
  await store.setChatbotStatus(id, 'published')
}

async function handleOffline(id: number) {
  if (!confirm('确认下线该智能体？下线后用户将无法使用。')) return
  await store.setChatbotStatus(id, 'draft')
}

async function handleDelete(id: number) {
  if (!confirm('确认删除该智能体？此操作不可恢复。')) return
  await store.removeChatbot(id)
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
  font-family: var(--font-heading);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.page-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
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
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th {
  text-align: left;
  padding: 12px 20px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border);
  background: var(--surface-tint);
  white-space: nowrap;
}

.data-table td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text);
}

.data-table tbody tr {
  transition: background var(--transition-fast);
}

.data-table tbody tr:hover {
  background: var(--surface-hover);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.cell-name {
  font-weight: 500;
}

.cell-secondary {
  color: var(--text-secondary);
}

.col-action {
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

.action--publish {
  color: var(--accent);
}

.action--publish:hover {
  color: var(--accent-hover);
  background: var(--accent-ultra-soft);
}

.action--offline {
  color: #d97706; /* TODO(admin-rebrand): replace with --warning token */
}

.action--offline:hover {
  color: #b45309; /* TODO(admin-rebrand): replace with --warning token */
  background: #fffbeb; /* TODO(admin-rebrand): replace with --warning token */
}

.action--danger {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
}

.action--danger:hover {
  color: #dc2626; /* TODO(admin-rebrand): replace with --danger token */
  background: #fef2f2; /* TODO(admin-rebrand): replace with --danger token */
}
</style>
