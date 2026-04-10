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
      <!-- 头部 -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="page-title">SOP 管理</h2>
          <p class="page-desc">创建和管理标准作业流程模板</p>
        </div>
        <AppButton size="sm" @click="router.push('/config/sop-templates/new/edit')">
          + 新建SOP模板
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
        <div class="empty-title">暂无 SOP 模板</div>
        <div class="empty-desc">创建第一个 SOP 模板，标准化您的业务流程</div>
        <AppButton size="sm" @click="router.push('/config/sop-templates/new/edit')">
          新建SOP模板
        </AppButton>
      </div>

      <!-- 数据表格 -->
      <div v-else class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>步骤数</th>
              <th>状态</th>
              <th>创建时间</th>
              <th class="col-action">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tpl in store.sopTemplates" :key="tpl.id">
              <td class="cell-name">{{ tpl.name }}</td>
              <td class="cell-secondary">{{ tpl.node_count ?? '-' }}</td>
              <td>
                <span class="status-badge" :class="'status--' + tpl.publish_status">
                  {{ statusLabel(tpl.publish_status) }}
                </span>
              </td>
              <td class="cell-secondary">{{ formatDate(tpl.created_at) }}</td>
              <td class="col-action">
                <div class="action-group">
                  <button
                    class="action-link"
                    @click="router.push(`/config/sop-templates/${tpl.id}/edit`)"
                  >
                    编辑
                  </button>
                  <button
                    v-if="tpl.publish_status !== 'published'"
                    class="action-link action--publish"
                    @click="handlePublish(tpl.id)"
                  >
                    发布
                  </button>
                  <button
                    v-if="tpl.publish_status === 'published'"
                    class="action-link action--offline"
                    @click="handleOffline(tpl.id)"
                  >
                    下线
                  </button>
                  <button class="action-link action--danger" @click="handleDelete(tpl.id)">
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

const router = useRouter()
const store = useConfigStore()
const error = ref('')

function statusLabel(status: string): string {
  const map: Record<string, string> = {
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
    await store.fetchSopTemplates()
  } catch {
    error.value = '加载失败，请重试'
  }
}

async function handlePublish(id: number) {
  if (!confirm('确认发布该SOP模板？')) return
  await store.setSopTemplateStatus(id, 'published')
}

async function handleOffline(id: number) {
  if (!confirm('确认下线该SOP模板？')) return
  await store.setSopTemplateStatus(id, 'offline')
}

async function handleDelete(id: number) {
  if (!confirm('确认删除该SOP模板？此操作不可恢复。')) return
  await store.removeSopTemplate(id)
}

onMounted(loadData)
</script>

<style scoped>
.sop-list {
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
  background: var(--color-surface-tint, #f9fafb);
  border-radius: var(--radius-md, 12px);
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
  color: #ef4444;
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
  color: var(--color-text, #1a1d26);
  letter-spacing: -0.01em;
}

.page-desc {
  font-size: 0.8125rem;
  color: var(--color-text-muted, #8b90a0);
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
  background: var(--color-surface-tint, #f9fafb);
  color: var(--color-text-muted, #8b90a0);
  margin-bottom: 20px;
}

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, #1a1d26);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 0.875rem;
  color: var(--color-text-muted, #8b90a0);
  margin-bottom: 24px;
}

/* ── Table Card ── */

.table-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-md, 12px);
  overflow: hidden;
  box-shadow: var(--shadow-card, 0 1px 4px rgba(0, 0, 0, 0.04));
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
  color: var(--color-text-muted, #8b90a0);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--color-border, #e2e4ea);
  background: var(--color-surface-tint, #f9fafb);
  white-space: nowrap;
}

.data-table td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border-light, #eeeff3);
  color: var(--color-text, #1a1d26);
}

.data-table tbody tr {
  transition: background var(--transition-fast, 150ms ease);
}

.data-table tbody tr:hover {
  background: var(--color-surface-hover, #f3f4f8);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.cell-name {
  font-weight: 500;
}

.cell-secondary {
  color: var(--color-text-secondary, #5f6577);
}

.col-action {
  text-align: right;
}

/* ── Status Badge ── */

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill, 999px);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
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
  color: var(--color-accent-link, #26a86d);
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 150ms ease);
}

.action-link:hover {
  color: var(--color-accent-hover, #1e8b5a);
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
}

.action--publish {
  color: #16a34a;
}

.action--publish:hover {
  color: #15803d;
  background: #f0fdf4;
}

.action--offline {
  color: #d97706;
}

.action--offline:hover {
  color: #b45309;
  background: #fffbeb;
}

.action--danger {
  color: #ef4444;
}

.action--danger:hover {
  color: #dc2626;
  background: #fef2f2;
}
</style>
