<template>
  <div class="chatbot-list">
    <!-- 加载状态 -->
    <div v-if="store.loading" class="loading-state">
      <div class="skeleton-row" v-for="i in 4" :key="i"></div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <p class="error-text">{{ error }}</p>
      <AppButton variant="secondary" size="sm" @click="loadData">重试</AppButton>
    </div>

    <template v-else>
      <!-- 头部 -->
      <div class="page-header">
        <h2 class="page-title">智能体管理</h2>
        <AppButton size="sm" @click="router.push('/config/chatbots/new/edit')">
          + 新建智能体
        </AppButton>
      </div>

      <!-- 空状态 -->
      <div v-if="store.chatbots.length === 0" class="empty-state">
        <div class="empty-icon">🤖</div>
        <div class="empty-title">暂无智能体，立即创建</div>
        <div class="empty-desc">创建智能体，为客户提供智能对话服务</div>
        <AppButton size="sm" @click="router.push('/config/chatbots/new/edit')">
          新建智能体
        </AppButton>
      </div>

      <!-- 数据表格 -->
      <div v-else class="table-container">
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
              <td>{{ (bot as any).knowledge_base_count ?? '-' }}</td>
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
    draft: '草稿',
    published: '已发布',
    offline: '已下线'
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
  await store.setChatbotStatus(id, 'offline')
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

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 0;
}

.skeleton-row {
  height: 48px;
  background: var(--color-surface-tint, #f3f4f6);
  border-radius: 8px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.error-state {
  text-align: center;
  padding: 48px 0;
}

.error-text {
  color: #ef4444;
  margin-bottom: 16px;
  font-size: 0.875rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text, #111827);
}

.empty-state {
  text-align: center;
  padding: 64px 0;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text, #111827);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 0.875rem;
  color: var(--color-text-muted, #6b7280);
  margin-bottom: 24px;
}

.table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th {
  text-align: left;
  padding: 12px 16px;
  font-weight: 500;
  color: var(--color-text-muted, #6b7280);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  white-space: nowrap;
}

.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  color: var(--color-text, #111827);
}

.cell-name {
  font-weight: 500;
}

.cell-secondary {
  color: var(--color-text-muted, #6b7280);
}

.col-action {
  text-align: right;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status--draft {
  background: #f3f4f6;
  color: #6b7280;
}

.status--published {
  background: #dcfce7;
  color: #16a34a;
}

.status--offline {
  background: #fee2e2;
  color: #dc2626;
}

.action-group {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.action-link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--color-accent-link, #3b82f6);
  padding: 4px 0;
  transition: color 0.15s;
}

.action-link:hover {
  color: var(--color-accent-hover, #2563eb);
}

.action--publish {
  color: #16a34a;
}

.action--publish:hover {
  color: #15803d;
}

.action--offline {
  color: #d97706;
}

.action--offline:hover {
  color: #b45309;
}

.action--danger {
  color: #ef4444;
}

.action--danger:hover {
  color: #dc2626;
}
</style>
