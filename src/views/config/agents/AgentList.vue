<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import type { Agent } from '@/types/agentBuilder'
import DataTable, { type Column } from '@/components/common/DataTable.vue'
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

// ---------- DataTable columns ----------
const columns: Column[] = [
  { key: 'name', title: '名字', width: '200px', align: 'left' },
  { key: 'description', title: '描述', align: 'left' },
  { key: 'version', title: '版本', width: '70px' },
  { key: 'updated_at', title: '更新时间', width: '160px' },
  { key: 'actions', title: '操作', width: '260px' }
]

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
      listError.value = '仅父账户可配置 AI 助手，请联系机构主'
    } else if (status === 404) {
      listError.value = 'Agent 不存在或已下架'
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
  router.push(`/agents/new?from=copy:${agent.id}`)
}

// ---------- Soft-delete flow ----------
function confirmDelete(agent: Agent) {
  pendingAgent.value = agent
  confirmTitle.value = `确认下架「${agent.name}」？`
  confirmMessage.value = '下架后：\n- 学员将无法启动新会话\n- 已下架后无法恢复（需重新创建）'
  confirmDanger.value = true
  confirmVisible.value = true
}

async function executeDelete() {
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
  }
}

function cancelDelete() {
  confirmVisible.value = false
  pendingAgent.value = null
}
</script>

<template>
  <div class="agent-list">
    <!-- Top bar -->
    <div class="agent-list__header">
      <AppInput v-model="searchTerm" placeholder="搜索助手" class="agent-list__search" />
      <div class="agent-list__actions">
        <AppButton variant="primary" @click="router.push('/agents/new')"> + 创建 Agent </AppButton>
        <AppButton variant="secondary" @click="router.push('/agents/new/from-template')">
          从模板库选
        </AppButton>
      </div>
    </div>

    <!-- Error banner -->
    <div v-if="listError" class="agent-list__error-banner">
      <span>{{ listError }}</span>
      <AppButton variant="text" size="sm" @click="fetchList">重试</AppButton>
    </div>

    <!-- DataTable (handles loading skeleton + empty state internally) -->
    <DataTable
      :columns="columns"
      :data="filtered"
      :loading="store.loading"
      :total="store.total"
      empty-text="暂无助手，点击 + 创建第一个"
    >
      <!-- Name cell with advanced_mode badge -->
      <template #cell-name="{ row }">
        <span class="agent-name">
          {{ row.name }}
          <span v-if="row.advanced_mode" class="badge badge--advanced" title="高级模式">🔧</span>
          <span v-else class="badge badge--problem" title="问卷模式">📋</span>
        </span>
      </template>

      <!-- updated_at formatted -->
      <template #cell-updated_at="{ value }">
        {{ formatDate(value as string) }}
      </template>

      <!-- Actions -->
      <template #cell-actions="{ row }">
        <div class="agent-list__row-actions">
          <AppButton size="sm" variant="secondary" @click="goEdit(row.id)"> 编辑 </AppButton>
          <AppButton size="sm" variant="secondary" @click="goDetail(row.id)"> 详情 </AppButton>
          <AppButton size="sm" variant="secondary" @click="derive(row)"> 派生 </AppButton>
          <AppButton size="sm" variant="secondary" @click="confirmDelete(row)"> 下架 </AppButton>
        </div>
      </template>
    </DataTable>

    <!-- Confirm modal for soft-delete -->
    <ConfirmModal
      :model-value="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :variant="confirmDanger ? 'danger' : 'default'"
      confirm-text="确认下架"
      cancel-text="取消"
      @confirm="executeDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<style scoped>
.agent-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.agent-list__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.agent-list__search {
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}

.agent-list__actions {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.agent-list__error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--danger-surface, #fef2f2);
  border: 1px solid var(--danger-border, #fca5a5);
  border-radius: var(--radius-sm);
  color: var(--danger, #dc2626);
  font-size: var(--text-sm);
}

.agent-name {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.badge {
  font-size: 12px;
  line-height: 1;
}

.agent-list__row-actions {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  justify-content: center;
}
</style>
