<!--
  SkillList — 父账户 Skill 资产列表页

  DataTable 布局（按 .claude/rules/ui-ux.md 硬规则 #1：管理端必须用表格）。
  四态：loading skeleton / empty 引导卡 / error toast / success。

  Skill 资产是独立于 Agent 的复用单元（v2 #1）：
    - 同一个 Skill 可以装载到多个 Agent
    - 删除 Skill 会级联软删所有 binding（卸载学员侧用不到该技能）
    - 版本历史保留，回滚创建新版本

  agent-mode-v2-skill-as-artifact (S4 T10)
  Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §5
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Lightbulb } from 'lucide-vue-next'
import { useSkillStore } from '@/stores/skill'
import { useNotificationsStore } from '@/stores/notifications'
import type { Skill } from '@/types/skill'
import DataTable, { type Column } from '@/components/common/DataTable.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import SkillListRow from './components/SkillListRow.vue'
import { formatDateTime } from '@/utils/datetime'

const router = useRouter()
const store = useSkillStore()
const notifications = useNotificationsStore()

// ---------- Local state ----------
const searchTerm = ref('')
const sortKey = ref<'updated_at_desc' | 'updated_at_asc' | 'name_asc' | 'name_desc'>(
  'updated_at_desc'
)
const page = ref(1)
const pageSize = 20
const listError = ref('')

// ---------- Confirm modal ----------
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const pending = ref<Skill | null>(null)
const processing = ref(false)

// ---------- DataTable columns ----------
const columns: Column[] = [
  { key: 'icon', title: '', width: '52px', align: 'center' },
  { key: 'name', title: '名称', width: '220px', align: 'left' },
  { key: 'description', title: '描述', align: 'left' },
  { key: 'bound_agent_count', title: '装载 Agent', width: '110px' },
  { key: 'version', title: '版本', width: '70px' },
  { key: 'updated_at', title: '最近修改', width: '170px' },
  { key: 'actions', title: '操作', width: '280px' }
]

// ---------- 排序选项 ----------
const sortOptions: { value: typeof sortKey.value; label: string }[] = [
  { value: 'updated_at_desc', label: '最近修改' },
  { value: 'updated_at_asc', label: '最早修改' },
  { value: 'name_asc', label: '名称升序' },
  { value: 'name_desc', label: '名称降序' }
]

// ---------- 数据加载 ----------
async function fetchList() {
  listError.value = ''
  try {
    await store.fetchList({
      page: page.value,
      page_size: pageSize,
      search: searchTerm.value || undefined,
      sort: sortKey.value
    })
  } catch (e: unknown) {
    listError.value = (e as Error).message || '加载失败'
  }
}

onMounted(fetchList)

// 搜索词改变时 debounce 拉取（手动实现，避免引依赖）
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchTerm, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchList()
  }, 300)
})

watch(sortKey, () => {
  page.value = 1
  fetchList()
})

function onPageChange(newPage: number) {
  page.value = newPage
  fetchList()
}

// ---------- Navigation ----------
function goNew() {
  router.push('/config/skills/new')
}

function goEdit(skill: Skill) {
  router.push(`/config/skills/${skill.id}/edit`)
}

function goView(skill: Skill) {
  router.push(`/config/skills/${skill.id}`)
}

function goHistory(skill: Skill) {
  router.push(`/config/skills/${skill.id}/history`)
}

// ---------- 删除流（含级联提示）----------
function confirmDelete(skill: Skill) {
  pending.value = skill
  confirmTitle.value = `确认删除「${skill.name}」？`
  const bindCount = skill.bound_agent_count ?? 0
  if (bindCount > 0) {
    confirmMessage.value =
      `该 Skill 当前已装载到 ${bindCount} 个 Agent。\n` +
      `删除后会自动从这些 Agent 卸载，且学员无法再使用此技能。\n` +
      `版本历史会保留，但需重新创建才能再装载。`
  } else {
    confirmMessage.value = '该 Skill 当前没有装载到任何 Agent，可放心删除。版本历史会保留。'
  }
  confirmVisible.value = true
}

async function executeDelete() {
  if (!pending.value || processing.value) return
  processing.value = true
  try {
    const affected = await store.remove(pending.value.id)
    if (affected > 0) {
      notifications.success(`已删除，已从 ${affected} 个 Agent 卸载`)
    } else {
      notifications.success('已删除')
    }
  } catch (e: unknown) {
    notifications.error((e as Error).message || '删除失败')
  } finally {
    processing.value = false
    confirmVisible.value = false
    pending.value = null
  }
}

function cancelDelete() {
  confirmVisible.value = false
  pending.value = null
}

// ---------- 空状态判定 ----------
const showEmpty = computed(
  () => !store.loading && !listError.value && store.list.length === 0 && !searchTerm.value
)
</script>

<template>
  <div class="skill-list">
    <!-- 顶部操作栏 -->
    <div class="skill-list__header">
      <AppInput
        v-model="searchTerm"
        placeholder="搜索 Skill 名称或描述"
        class="skill-list__search"
      />
      <select v-model="sortKey" class="skill-list__sort" aria-label="排序方式">
        <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <div class="skill-list__actions">
        <AppButton variant="primary" @click="goNew">+ 新建 Skill</AppButton>
      </div>
    </div>

    <!-- 错误条 -->
    <div v-if="listError" class="skill-list__error-banner">
      <span>{{ listError }}</span>
      <AppButton variant="text" size="sm" @click="fetchList">重试</AppButton>
    </div>

    <!-- 空状态引导卡（首次进入 + 真的没数据时） -->
    <div v-if="showEmpty" class="skill-list__empty-card">
      <Lightbulb :size="48" />
      <h3>还没有 Skill</h3>
      <p>
        <strong>Skill 是独立技能资产</strong>，可以装载到多个 Agent 上复用。<br />
        例如：把「销售数据分析」做成一个 Skill，让多个 Agent 都能在需要时调用。
      </p>
      <AppButton variant="primary" @click="goNew">创建第一个 Skill</AppButton>
    </div>

    <!-- DataTable 主体（仅在不是首次空状态时显示） -->
    <DataTable
      v-else
      :columns="columns"
      :data="store.list"
      :loading="store.loading"
      :total="store.total"
      :page="page"
      :page-size="pageSize"
      empty-text="没有匹配的 Skill"
      @update:page="onPageChange"
    >
      <!-- icon 占位（v1 不做自定义 icon，统一展示首字母） -->
      <template #cell-icon="{ row }">
        <div class="skill-icon">{{ String(row.name).charAt(0) || 'S' }}</div>
      </template>

      <!-- 名称 -->
      <template #cell-name="{ row }">
        <span class="skill-name" @click="goView(row)">{{ row.name }}</span>
      </template>

      <!-- 描述（截断显示） -->
      <template #cell-description="{ value }">
        <span class="skill-description">{{ value || '—' }}</span>
      </template>

      <!-- 装载 Agent 数 -->
      <template #cell-bound_agent_count="{ value }">
        <span :class="['skill-binding-count', value > 0 ? 'active' : '']">{{ value ?? 0 }}</span>
      </template>

      <!-- 更新时间格式化 -->
      <template #cell-updated_at="{ value }">
        {{ formatDateTime(value as string) }}
      </template>

      <!-- 操作按钮 -->
      <template #cell-actions="{ row }">
        <SkillListRow
          :skill="row"
          @edit="goEdit"
          @view="goView"
          @history="goHistory"
          @delete="confirmDelete"
        />
      </template>
    </DataTable>

    <!-- 删除确认 -->
    <ConfirmModal
      :model-value="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      variant="danger"
      confirm-text="确认删除"
      cancel-text="取消"
      @confirm="executeDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<style scoped>
.skill-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.skill-list__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.skill-list__search {
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}

.skill-list__sort {
  height: 38px;
  padding: 0 var(--space-3);
  border: 1px solid rgba(169, 180, 185, 0.2);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: 0.875rem;
  cursor: pointer;
}

.skill-list__sort:focus {
  outline: none;
  border-color: var(--primary);
}

.skill-list__actions {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.skill-list__error-banner {
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

.skill-list__empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12) var(--space-6);
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid rgba(169, 180, 185, 0.1);
  text-align: center;
}

.skill-list__empty-card h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text);
}

.skill-list__empty-card p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.skill-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-tint);
  color: var(--primary);
  font-weight: 600;
  font-size: 0.875rem;
}

.skill-name {
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}

.skill-name:hover {
  color: var(--primary);
}

.skill-description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.skill-binding-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 var(--space-2);
  border-radius: 11px;
  background: var(--surface-tint);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.skill-binding-count.active {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}
</style>
