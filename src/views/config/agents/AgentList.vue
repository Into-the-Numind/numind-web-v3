<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import type { Agent } from '@/types/agentBuilder'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import DataTable, { type Column } from '@/components/common/DataTable.vue'
import { formatDate } from '@/utils/datetime'
import { HTTP_CHILD_ACCOUNT_FORBIDDEN, errorMessage, errorStatus } from '@/constants/agentErrno'

const router = useRouter()
const route = useRoute()
const store = useAgentBuilderStore()

const searchTerm = ref('')
const listError = ref('')
type AgentStatusFilter = 'all' | 'active' | 'inactive'
const statusFilter = ref<AgentStatusFilter>('all')

const statusOptions: Array<{ value: AgentStatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '已启用' },
  { value: 'inactive', label: '已下架' }
]

// Marketplace "装载到 Agent" flow: arrives here with ?attach_skill so the operator
// picks which Agent to load a subscribed Skill into. Picking an agent carries the
// skill to its edit page, which auto-binds it (SkillBindingPanel).
const attachSkillId = computed(() => {
  const v = Number(route.query.attach_skill)
  return Number.isFinite(v) && v > 0 ? v : null
})
const attachSkillName = computed(() => {
  const v = route.query.skill_name
  return (Array.isArray(v) ? v[0] : v) || ''
})

const filtered = computed<Agent[]>(() => {
  const term = searchTerm.value.toLowerCase()
  return store.list.filter((a) => {
    const statusMatched =
      statusFilter.value === 'all' ||
      (statusFilter.value === 'active' && a.is_active) ||
      (statusFilter.value === 'inactive' && !a.is_active)
    if (!statusMatched) return false
    if (!term) return true
    return a.name.toLowerCase().includes(term) || a.description.toLowerCase().includes(term)
  })
})

const columns: Column[] = [
  { key: 'name', title: '名称', align: 'left' },
  { key: 'description', title: '描述', align: 'left' },
  { key: 'status', title: '状态' },
  { key: 'version', title: '版本' },
  { key: 'updated_at', title: '更新时间' },
  { key: 'actions', title: '', align: 'right' }
]

async function fetchList() {
  listError.value = ''
  try {
    await store.fetchList({ page: 1, page_size: 20, include_inactive: true })
  } catch (e: unknown) {
    const status = errorStatus(e)
    if (status === HTTP_CHILD_ACCOUNT_FORBIDDEN) {
      listError.value = '仅父账户可配置 AI 助手，请联系机构主'
    } else if (status === 404) {
      listError.value = '智能体不存在或已被下架'
    } else {
      listError.value = errorMessage(e, '加载失败')
    }
  }
}

onMounted(fetchList)

function goEdit(id: number) {
  // Carry the skill through so the edit page auto-binds it (closes the marketplace loop).
  if (attachSkillId.value) {
    router.push(`/config/agents/${id}/edit?attach_skill=${attachSkillId.value}`)
    return
  }
  router.push(`/config/agents/${id}/edit`)
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

    <!-- Marketplace 装载流程引导条 -->
    <div v-if="attachSkillId" class="attach-banner">
      <span class="attach-banner__text">
        正在为技能<strong>「{{ attachSkillName || '订阅技能' }}」</strong>选择 Agent：点击下方任一
        Agent 的「编辑」，进入后会自动装载。
      </span>
      <AppButton variant="secondary" size="sm" @click="router.push('/config/agents')"
        >取消</AppButton
      >
    </div>

    <!-- Toolbar -->
    <div class="list-toolbar">
      <AppInput v-model="searchTerm" placeholder="搜索智能体" class="search-input" />
      <div class="status-filter" aria-label="智能体状态筛选">
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

    <!-- Error banner（500 / 503 / 403 等 — 含重试按钮） -->
    <div v-if="listError" class="agent-list__error-banner">
      <p class="error-text">{{ listError }}</p>
      <AppButton variant="secondary" size="sm" @click="fetchList">重试</AppButton>
    </div>

    <!-- 管理端列表（ui-ux.md §1 hard rule：必须用 DataTable，不可用 raw table）。
         不传 :total —— 列表是 client-side filter（searchTerm），page_size=20 已覆盖全部行；
         未来切服务端分页时再补 :total + @update:page。 -->
    <DataTable
      variant="card"
      :columns="columns"
      :data="filtered"
      :loading="store.loading"
      empty-text="暂无智能体"
      :clickable="true"
      @row-click="(row: Agent) => goEdit(row.id)"
    >
      <template #cell-name="{ row }">
        <span class="name-wrapper">
          {{ row.name }}
        </span>
      </template>
      <template #cell-status="{ row }">
        <span class="status-badge" :class="row.is_active ? 'status--active' : 'status--inactive'">
          {{ row.is_active ? '已启用' : '已下架' }}
        </span>
      </template>
      <template #cell-updated_at="{ row }">{{ formatDate(row.updated_at) }}</template>
      <template #cell-actions="{ row }">
        <div class="action-group">
          <button class="action-link" @click.stop="goEdit(row.id)">编辑</button>
        </div>
      </template>
    </DataTable>
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
.list-toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  width: 100%;
  max-width: 320px;
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

.attach-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: hsla(152, 55%, 96%, 0.9);
  border: 1px solid hsla(152, 45%, 80%, 0.8);
  border-radius: var(--radius-md);
}

.attach-banner__text {
  font-size: 14px;
  color: #065f46;
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

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
}

.status--active {
  background: var(--accent-soft);
  color: var(--accent);
}

.status--inactive {
  background: #f3f4f6;
  color: #6b7280;
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
</style>
