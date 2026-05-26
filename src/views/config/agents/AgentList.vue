<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import type { Agent } from '@/types/agentBuilder'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { formatDate } from '@/utils/datetime'
import { HTTP_CHILD_ACCOUNT_FORBIDDEN, errorMessage, errorStatus } from '@/constants/agentErrno'

const router = useRouter()
const store = useAgentBuilderStore()
const notifications = useNotificationsStore()

// ---------- Local state ----------
const searchTerm = ref('')
const listError = ref('')

// ---------- Confirm modal ----------
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmDanger = ref(false)
const pendingAgent = ref<Agent | null>(null)
const processing = ref(false)

// ---------- Filtered list (client-side search) ----------
const filtered = computed(() => {
  const term = searchTerm.value.toLowerCase()
  if (!term) return store.list
  return store.list.filter(
    (a) => a.name.toLowerCase().includes(term) || a.description.toLowerCase().includes(term)
  )
})

// ---------- Data loading ----------
async function fetchList() {
  listError.value = ''
  try {
    await store.fetchList({ page: 1, page_size: 20 })
  } catch (e: unknown) {
    const status = errorStatus(e)
    if (status === HTTP_CHILD_ACCOUNT_FORBIDDEN) {
      listError.value = '仅父账户可配置智能体，请联系机构主'
    } else if (status === 404) {
      listError.value = '智能体不存在或已被删除'
    } else {
      listError.value = errorMessage(e, '加载失败')
    }
  }
}

onMounted(fetchList)

// ---------- Navigation ----------
function goEdit(id: number) {
  router.push(`/config/agents/${id}/edit`)
}

function goDetail(id: number) {
  router.push(`/config/agents/${id}`)
}

function derive(agent: Agent) {
  router.push(`/config/agents/new?from=copy:${agent.id}`)
}

// ---------- Soft-delete flow ----------
function confirmDelete(agent: Agent) {
  pendingAgent.value = agent
  confirmTitle.value = `确认删除「${agent.name}」？`
  confirmMessage.value = '删除后：\n- 学员将无法启动新会话\n- 删除后无法恢复（需重新创建）'
  confirmDanger.value = true
  confirmVisible.value = true
}

async function executeDelete() {
  if (!pendingAgent.value || processing.value) return
  processing.value = true
  try {
    await store.softDelete(pendingAgent.value.id)
    notifications.success('已删除')
  } catch (e: unknown) {
    notifications.error(errorMessage(e, '删除失败'))
  } finally {
    processing.value = false
    confirmVisible.value = false
    pendingAgent.value = null
    void fetchList()
  }
}

function cancelDelete() {
  confirmVisible.value = false
  pendingAgent.value = null
}
</script>

<template>
  <div class="agent-list">
    <!-- 加载状态 -->
    <div v-if="store.loading" class="loading-state">
      <div v-for="i in 4" :key="i" class="skeleton-row"></div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="listError" class="error-state">
      <p class="error-text">{{ listError }}</p>
      <AppButton variant="secondary" size="sm" @click="fetchList">重试</AppButton>
    </div>

    <template v-else>
      <!-- 头部 -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="page-title">智能体</h2>
          <p class="page-desc">创建和管理多步骤智能体，为学员提供自主 SOP 执行服务</p>
        </div>
        <div class="header-right">
          <AppButton variant="secondary" @click="router.push('/config/agents/new/from-template')">
            从模板库选
          </AppButton>
          <AppButton variant="hero" @click="router.push('/config/agents/new')">
            + 新建智能体
          </AppButton>
        </div>
      </div>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <AppInput v-model="searchTerm" placeholder="搜索智能体" class="search-input" />
      </div>

      <!-- 空状态 -->
      <div v-if="filtered.length === 0" class="empty-state">
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
        <div class="empty-desc">创建第一个智能体，开始为学员提供多步骤自主推理服务</div>
        <AppButton size="sm" @click="router.push('/config/agents/new')">
          新建智能体
        </AppButton>
      </div>

      <!-- 数据表格 -->
      <div v-else class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-left">名称</th>
              <th class="col-left">描述</th>
              <th>版本</th>
              <th>更新时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="agent in filtered" :key="agent.id">
              <td class="cell-name" @click="goDetail(agent.id)">
                <span class="name-wrapper">
                  {{ agent.name }}
                  <span v-if="agent.advanced_mode" class="badge badge--advanced" title="高级模式">🔧</span>
                  <span v-else class="badge badge--problem" title="问卷模式">📋</span>
                </span>
              </td>
              <td class="cell-desc">{{ agent.description || '-' }}</td>
              <td class="cell-secondary">{{ agent.version }}</td>
              <td class="cell-secondary">{{ formatDate(agent.updated_at) }}</td>
              <td class="col-action">
                <div class="action-group">
                  <button class="action-link" @click="goEdit(agent.id)">
                    编辑
                  </button>
                  <button class="action-link" @click="goDetail(agent.id)">
                    详情
                  </button>
                  <button class="action-link" @click="derive(agent)">
                    派生
                  </button>
                  <button class="action-link action--danger" @click="confirmDelete(agent)">
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- 确认删除弹窗 -->
    <ConfirmModal
      :model-value="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :variant="confirmDanger ? 'danger' : 'default'"
      confirm-text="确认删除"
      cancel-text="取消"
      @confirm="executeDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<style scoped>
.agent-list {
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
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
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
  color: var(--text);
  letter-spacing: -0.01em;
}

.page-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.header-right {
  display: flex;
  gap: 12px;
}

/* ── Search Bar ── */
.search-bar {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-start;
}

.search-input {
  width: 100%;
  max-width: 320px;
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

.name-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 6px;
  font-weight: 500;
}

.badge--advanced {
  background: #eff6ff;
  color: #1d4ed8;
}

.badge--problem {
  background: #fff7ed;
  color: #c2410c;
}

.cell-desc {
  font-size: 13px;
  color: hsl(155, 15%, 35%);
  text-align: left !important;
  max-width: 350px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.action--danger {
  color: #ef4444;
}

.action--danger:hover {
  color: #dc2626;
  background: #fef2f2;
}
</style>
