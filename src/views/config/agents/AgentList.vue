<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import type { Agent } from '@/types/agentBuilder'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import DataTable, { type Column } from '@/components/common/DataTable.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { formatDate } from '@/utils/datetime'
import { HTTP_CHILD_ACCOUNT_FORBIDDEN, errorMessage, errorStatus } from '@/constants/agentErrno'

const router = useRouter()
const store = useAgentBuilderStore()
const notifications = useNotificationsStore()

const searchTerm = ref('')
const listError = ref('')

const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmDanger = ref(false)
const pendingAgent = ref<Agent | null>(null)
const processing = ref(false)

const filtered = computed<Agent[]>(() => {
  const term = searchTerm.value.toLowerCase()
  if (!term) return store.list
  return store.list.filter(
    (a) => a.name.toLowerCase().includes(term) || a.description.toLowerCase().includes(term)
  )
})

const columns: Column[] = [
  { key: 'name', title: '名称', align: 'left' },
  { key: 'description', title: '描述', align: 'left' },
  { key: 'version', title: '版本' },
  { key: 'updated_at', title: '更新时间' },
  { key: 'actions', title: '', align: 'right' }
]

async function fetchList() {
  listError.value = ''
  try {
    await store.fetchList({ page: 1, page_size: 20 })
  } catch (e: unknown) {
    const status = errorStatus(e)
    if (status === HTTP_CHILD_ACCOUNT_FORBIDDEN) {
      listError.value = '仅父账户可配置 AI 助手，请联系机构主'
    } else if (status === 404) {
      listError.value = '智能体不存在或已被删除'
    } else {
      listError.value = errorMessage(e, '加载失败')
    }
  }
}

onMounted(fetchList)

function goEdit(id: number) {
  router.push(`/config/agents/${id}/edit`)
}

function goDetail(id: number) {
  router.push(`/config/agents/${id}`)
}

function derive(agent: Agent) {
  router.push(`/config/agents/new?from=copy:${agent.id}`)
}

// 下架（软删除）：store.softDelete 把 is_active 置 false，历史会话保留
function confirmTakedown(agent: Agent) {
  pendingAgent.value = agent
  confirmTitle.value = `确认下架「${agent.name}」？`
  confirmMessage.value =
    '下架后：\n- 学员将无法启动新会话\n- 历史会话仍可查看\n- 如需恢复请联系运营'
  confirmDanger.value = true
  confirmVisible.value = true
}

async function executeTakedown() {
  if (!pendingAgent.value || processing.value) return
  processing.value = true
  try {
    await store.softDelete(pendingAgent.value.id)
    notifications.success('已下架')
  } catch (e: unknown) {
    notifications.error(errorMessage(e, '下架失败'))
  } finally {
    processing.value = false
    confirmVisible.value = false
    pendingAgent.value = null
    void fetchList()
  }
}

function cancelTakedown() {
  confirmVisible.value = false
  pendingAgent.value = null
}
</script>

<template>
  <div class="agent-list">
    <!-- Page header -->
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

    <!-- Search bar -->
    <div class="search-bar">
      <AppInput v-model="searchTerm" placeholder="搜索智能体" class="search-input" />
    </div>

    <!-- Error banner（500 / 503 / 403 等 — 含重试按钮） -->
    <div v-if="listError" class="agent-list__error-banner">
      <p class="error-text">{{ listError }}</p>
      <AppButton variant="secondary" size="sm" @click="fetchList">重试</AppButton>
    </div>

    <!-- 管理端列表（ui-ux.md §1 hard rule：必须用 DataTable，不可用 raw table） -->
    <DataTable
      :columns="columns"
      :data="filtered"
      :loading="store.loading"
      empty-text="暂无智能体"
      :clickable="true"
      @row-click="(row: Agent) => goDetail(row.id)"
    >
      <template #cell-name="{ row }">
        <span class="name-wrapper">
          {{ row.name }}
          <span v-if="row.advanced_mode" class="badge badge--advanced" title="高级模式">🔧</span>
          <span v-else class="badge badge--problem" title="问卷模式">📋</span>
        </span>
      </template>
      <template #cell-updated_at="{ row }">{{ formatDate(row.updated_at) }}</template>
      <template #cell-actions="{ row }">
        <div class="action-group">
          <button class="action-link" @click.stop="goEdit(row.id)">编辑</button>
          <button class="action-link" @click.stop="goDetail(row.id)">详情</button>
          <button class="action-link" @click.stop="derive(row)">派生</button>
          <button class="action-link action--danger" @click.stop="confirmTakedown(row)">
            下架
          </button>
        </div>
      </template>
    </DataTable>

    <!-- 确认下架弹窗 -->
    <ConfirmModal
      :model-value="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :variant="confirmDanger ? 'danger' : 'default'"
      confirm-text="确认下架"
      cancel-text="取消"
      @confirm="executeTakedown"
      @cancel="cancelTakedown"
    />
  </div>
</template>

<style scoped>
.agent-list {
  width: 100%;
}

/* Page header */
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

/* Search bar */
.search-bar {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-start;
}

.search-input {
  width: 100%;
  max-width: 320px;
}

/* Error banner */
.agent-list__error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
}

.agent-list__error-banner .error-text {
  color: #b91c1c;
  font-size: 0.875rem;
  margin: 0;
}

/* Name cell */
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

/* Action group */
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
