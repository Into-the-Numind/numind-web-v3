<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import type { Agent } from '@/types/agentBuilder'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { formatDate } from '@/utils/datetime'
import { HTTP_CHILD_ACCOUNT_FORBIDDEN, errorMessage, errorStatus } from '@/constants/agentErrno'
import { useNotificationsStore } from '@/stores/notifications'
import { Trash2 } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const store = useAgentBuilderStore()
const notifications = useNotificationsStore()

const searchTerm = ref('')
const listError = ref('')
type AgentStatusFilter = 'all' | 'active' | 'inactive'
const statusFilter = ref<AgentStatusFilter>('all')
const confirmVisible = ref(false)
const pendingDelete = ref<Agent | null>(null)

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
const deleteMessage = computed(() => {
  const name = pendingDelete.value?.name ?? '该 AI 智能体'
  return `确认删除「${name}」？删除后将无法恢复。`
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

async function fetchList() {
  listError.value = ''
  try {
    await store.fetchList({ page: 1, page_size: 20, include_inactive: true })
  } catch (e: unknown) {
    const status = errorStatus(e)
    if (status === HTTP_CHILD_ACCOUNT_FORBIDDEN) {
      listError.value = '仅父账户可配置 AI 智能体，请联系机构主'
    } else if (status === 404) {
      listError.value = 'AI 智能体不存在或已被下架'
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

function requestDelete(agent: Agent) {
  pendingDelete.value = agent
  confirmVisible.value = true
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  const target = pendingDelete.value
  try {
    await store.softDelete(target.id)
    notifications.success('AI 智能体已删除')
  } catch {
    notifications.error('删除失败，请重试')
  }
  pendingDelete.value = null
}
</script>

<template>
  <div class="agent-list">
    <div class="config-list-panel">
      <!-- Page header -->
      <div class="page-header">
        <div class="header-left">
          <h2 class="page-title">AI 智能体</h2>
          <p class="page-desc">创建和管理多步骤 AI 智能体，为学员提供自主 AI 工作流执行服务</p>
        </div>
        <div class="header-right">
          <AppButton variant="hero" @click="router.push('/config/agents/new')">
            + 新建 AI 智能体
          </AppButton>
        </div>
      </div>

      <!-- Marketplace 装载流程引导条 -->
      <div v-if="attachSkillId" class="attach-banner">
        <span class="attach-banner__text">
          正在为技能<strong>「{{ attachSkillName || '订阅技能' }}」</strong>选择
          Agent：点击下方任一卡片，进入后会自动装载。
        </span>
        <AppButton variant="secondary" size="sm" @click="router.push('/config/agents')"
          >取消</AppButton
        >
      </div>

      <!-- Toolbar -->
      <div class="list-toolbar">
        <AppInput v-model="searchTerm" placeholder="搜索 AI 智能体" class="search-input" />
        <div class="status-filter" aria-label="AI 智能体状态筛选">
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

      <div v-if="store.loading" class="tool-card-grid">
        <div v-for="i in 4" :key="i" class="tool-card tool-card--loading">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line skeleton-line--short"></div>
        </div>
      </div>

      <div v-else-if="filtered.length > 0" class="tool-card-grid">
        <article
          v-for="agent in filtered"
          :key="agent.id"
          class="tool-card"
          role="button"
          tabindex="0"
          @click="goEdit(agent.id)"
          @keydown.enter.prevent="goEdit(agent.id)"
          @keydown.space.prevent="goEdit(agent.id)"
        >
          <div class="tool-card__top">
            <h3 class="tool-card__title">{{ agent.name }}</h3>
            <span
              class="status-badge"
              :class="agent.is_active ? 'status--active' : 'status--inactive'"
            >
              {{ agent.is_active ? '已启用' : '已下架' }}
            </span>
          </div>
          <p class="tool-card__desc">{{ agent.description || '多步骤 AI 智能体' }}</p>
          <div class="tool-card__footer">
            <span class="tool-card__date">{{ formatDate(agent.updated_at) }}</span>
            <button
              class="delete-action"
              type="button"
              :aria-label="`删除 ${agent.name}`"
              title="删除"
              @click.stop="requestDelete(agent)"
              @keydown.stop
            >
              <Trash2 :size="15" stroke-width="2" />
            </button>
          </div>
        </article>
      </div>

      <div v-else-if="!listError" class="card-empty">暂无 AI 智能体</div>
    </div>

    <ConfirmModal
      v-model="confirmVisible"
      title="确认删除"
      :message="deleteMessage"
      variant="danger"
      confirm-text="删除"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.agent-list {
  width: 100%;
}

.config-list-panel {
  overflow: visible;
}

/* Page header */
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

.header-right {
  display: flex;
  gap: 12px;
}

/* Search bar */
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 0 var(--space-lg);
  margin: 0;
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
  margin: 0 0 var(--space-lg);
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
  margin: 0 0 var(--space-lg);
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

.status--active {
  background: var(--accent-soft);
  color: var(--accent);
}

.status--inactive {
  background: #f3f4f6;
  color: #6b7280;
}

/* Tool cards */
.tool-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 288px);
  gap: var(--space-md);
  justify-content: start;
  padding: 0;
}

.tool-card {
  width: 288px;
  min-height: 146px;
  appearance: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-lg);
  background: var(--surface);
  border: 1px solid hsl(158, 50%, 78%);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  text-align: left;
  transition:
    background var(--transition-base),
    border-color var(--transition-base),
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

.tool-card:hover {
  border-color: hsl(158, 50%, 78%);
  background: var(--surface);
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.08),
    0 0 0 1px hsl(158 40% 80% / 0.5);
  transform: translateY(-3px);
}

.tool-card:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.tool-card--loading {
  justify-content: center;
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

.skeleton-line {
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--surface-tint);
  animation: pulse 1.5s ease-in-out infinite;
}

.skeleton-line--title {
  width: 50%;
  height: 16px;
}

.skeleton-line--short {
  width: 70%;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.delete-action {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--text);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

.delete-action:hover {
  color: #dc2626; /* TODO(admin-rebrand): replace with --danger token */
  background: #fef2f2; /* TODO(admin-rebrand): replace with --danger-soft token */
}

@media (max-width: 720px) {
  .page-header,
  .header-right,
  .list-toolbar,
  .attach-banner,
  .agent-list__error-banner {
    align-items: stretch;
    flex-direction: column;
  }

  .page-header,
  .list-toolbar {
    padding-right: 0;
    padding-left: 0;
  }

  .attach-banner,
  .agent-list__error-banner {
    margin-right: 0;
    margin-left: 0;
  }

  .search-input {
    max-width: none;
  }

  .tool-card-grid {
    grid-template-columns: 1fr;
  }

  .tool-card {
    width: 100%;
  }
}
</style>
