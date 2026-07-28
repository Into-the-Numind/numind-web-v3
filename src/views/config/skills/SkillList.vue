<!--
  SkillList — Skill 资产卡片列表页

  Skill 是独立于 AI 智能体的复用能力资产：
    - 同一个 Skill 可以装载到多个 AI 智能体
    - 删除 Skill 会级联软删所有 binding
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Lightbulb, Trash2 } from 'lucide-vue-next'
import { useSkillStore } from '@/stores/skill'
import { useUserStore } from '@/stores/user'
import { useNotificationsStore } from '@/stores/notifications'
import { listMarketplace } from '@/api/marketplace'
import type { Skill, SkillVisibility } from '@/types/skill'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { formatDateTime } from '@/utils/datetime'

const router = useRouter()
const store = useSkillStore()
const userStore = useUserStore()
const notifications = useNotificationsStore()

const publishedSourceIds = ref<Set<number>>(new Set())
const searchTerm = ref('')
const sortKey = ref<'updated_at_desc' | 'updated_at_asc' | 'name_asc' | 'name_desc'>(
  'updated_at_desc'
)
const page = ref(1)
const pageSize = 20
const listError = ref('')

const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const pending = ref<Skill | null>(null)
const processing = ref(false)

const sortOptions: { value: typeof sortKey.value; label: string }[] = [
  { value: 'updated_at_desc', label: '最近修改' },
  { value: 'updated_at_asc', label: '最早修改' },
  { value: 'name_asc', label: '名称升序' },
  { value: 'name_desc', label: '名称降序' }
]

const filteredSkills = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) return store.list
  return store.list.filter((skill) =>
    [skill.name, skill.description].some((value) => (value || '').toLowerCase().includes(term))
  )
})

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / pageSize)))
const showEmpty = computed(
  () => !store.loading && !listError.value && store.list.length === 0 && !searchTerm.value
)
const showNoMatch = computed(
  () =>
    !store.loading && !listError.value && store.list.length > 0 && filteredSkills.value.length === 0
)
const showPagination = computed(() => !store.loading && store.total > pageSize)

async function fetchPublishedIds() {
  const myID = userStore.userInfo?.id
  if (myID == null) return
  const myIDNum = Number(myID)
  if (!Number.isFinite(myIDNum)) return
  try {
    const res = await listMarketplace({ page: 1, page_size: 100, sort: 'recent' })
    publishedSourceIds.value = new Set(
      res.list
        .filter((mp) => Number(mp.publisher_user_id) === myIDNum)
        .map((mp) => mp.source_skill_id)
    )
  } catch {
    // 徽章是辅助信息，失败不阻塞列表。
  }
}

async function fetchList() {
  listError.value = ''
  try {
    await store.fetchList({
      page: page.value,
      page_size: pageSize,
      search: searchTerm.value.trim() || undefined,
      sort: sortKey.value
    })
  } catch (e: unknown) {
    listError.value = (e as Error).message || '加载失败'
  }
}

onMounted(() => {
  fetchList()
  fetchPublishedIds()
})

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

function goNew() {
  router.push('/config/skills/new')
}

function goEdit(skill: Skill) {
  router.push(`/config/skills/${skill.id}/edit`)
}

function canEdit(skill: Skill) {
  return skill.can_edit !== false
}

function visibilityLabel(visibility: SkillVisibility) {
  const map: Record<SkillVisibility, string> = {
    official: '官方',
    institution: '机构',
    sub_user: '我的'
  }
  return map[visibility] ?? '我的'
}

function visibilityClass(visibility: SkillVisibility) {
  return `visibility-badge--${visibility}`
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  fetchList()
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  fetchList()
}

function confirmDelete(skill: Skill) {
  pending.value = skill
  confirmTitle.value = `确认删除「${skill.name}」？`
  const bindCount = skill.bound_agent_count ?? 0
  if (bindCount > 0) {
    confirmMessage.value =
      `该 Skill 当前已装载到 ${bindCount} 个 AI 智能体。\n` +
      `删除后会自动从这些 AI 智能体卸载，且学员无法再使用此技能。`
  } else {
    confirmMessage.value = '该 Skill 当前没有装载到任何 AI 智能体。'
  }
  confirmVisible.value = true
}

async function executeDelete() {
  if (!pending.value || processing.value) return
  processing.value = true
  try {
    const affected = await store.remove(pending.value.id)
    if (affected > 0) {
      notifications.success(`已删除，已从 ${affected} 个 AI 智能体卸载`)
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
</script>

<template>
  <div class="skill-list">
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">Skill</h2>
        <p class="page-desc">管理可复用的能力资产，并装载到 AI 智能体中</p>
      </div>
      <div class="header-right">
        <AppButton variant="secondary" @click="router.push('/config/skills/templates')">
          官方模板库
        </AppButton>
        <AppButton variant="primary" @click="goNew">+ 新建 Skill</AppButton>
      </div>
    </div>

    <div class="list-toolbar">
      <AppInput v-model="searchTerm" placeholder="搜索 Skill" class="search-input" />
      <select v-model="sortKey" class="sort-select" aria-label="排序方式">
        <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div v-if="listError" class="skill-list__error-banner">
      <span>{{ listError }}</span>
      <AppButton variant="text" size="sm" @click="fetchList">重试</AppButton>
    </div>

    <div v-if="showEmpty" class="skill-list__empty-card">
      <Lightbulb :size="48" />
      <h3>还没有 Skill</h3>
      <p>Skill 是独立技能资产，可以装载到多个 AI 智能体上复用。</p>
      <AppButton variant="primary" @click="goNew">创建第一个 Skill</AppButton>
    </div>

    <div v-else-if="store.loading" class="tool-card-grid">
      <div v-for="i in 4" :key="i" class="tool-card tool-card--loading">
        <div class="skeleton-line skeleton-line--title"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-line--short"></div>
      </div>
    </div>

    <div v-else-if="filteredSkills.length > 0" class="tool-card-grid">
      <article
        v-for="skill in filteredSkills"
        :key="skill.id"
        class="tool-card skill-card"
        role="button"
        tabindex="0"
        @click="goEdit(skill)"
        @keydown.enter.prevent="goEdit(skill)"
        @keydown.space.prevent="goEdit(skill)"
      >
        <div class="tool-card__top">
          <h3 class="tool-card__title">{{ skill.name }}</h3>
          <span class="visibility-badge" :class="visibilityClass(skill.visibility)">
            {{ visibilityLabel(skill.visibility) }}
          </span>
        </div>

        <div
          v-if="publishedSourceIds.has(skill.id) || skill.marketplace_id"
          class="skill-card__badges"
        >
          <span v-if="publishedSourceIds.has(skill.id)" class="status-badge">已发布</span>
          <span v-if="skill.marketplace_id" class="reference-badge">引用自市场</span>
        </div>

        <p class="tool-card__desc">{{ skill.description || '可复用的 Skill 能力资产' }}</p>

        <div class="skill-card__meta">
          <span>装载 {{ skill.bound_agent_count ?? 0 }} 个</span>
        </div>

        <div class="tool-card__footer">
          <span class="tool-card__date">{{ formatDateTime(skill.updated_at) }}</span>
          <div class="card-actions">
            <button
              v-if="canEdit(skill)"
              class="delete-action"
              type="button"
              :aria-label="`删除 ${skill.name}`"
              title="删除"
              @click.stop="confirmDelete(skill)"
              @keydown.stop
            >
              <Trash2 :size="15" stroke-width="2" />
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-else-if="showNoMatch" class="card-empty">没有匹配的 Skill</div>

    <div v-if="showPagination" class="pagination-bar">
      <AppButton variant="secondary" size="sm" :disabled="page <= 1" @click="prevPage">
        上一页
      </AppButton>
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <AppButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="nextPage">
        下一页
      </AppButton>
    </div>

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
  width: 100%;
}

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
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0;
}

.page-desc {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: var(--line-height-normal);
}

.header-right {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

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

.sort-select {
  height: 40px;
  padding: 0 var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font-size: var(--text-sm);
  cursor: pointer;
}

.sort-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.skill-list__error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  margin: 0 0 var(--space-lg);
  background: #fef2f2; /* TODO(admin-rebrand): replace with --danger-soft token */
  border: 1px solid #fecaca; /* TODO(admin-rebrand): replace with --danger-border token */
  border-radius: var(--radius-md);
  color: #b91c1c; /* TODO(admin-rebrand): replace with --danger token */
  font-size: var(--text-sm);
}

.skill-list__empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: 72px var(--space-xl);
  color: var(--text-secondary);
  text-align: center;
}

.skill-list__empty-card h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.skill-list__empty-card p {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.tool-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 288px);
  gap: var(--space-md);
  justify-content: start;
  padding: 0;
}

.tool-card {
  width: 288px;
  height: 138px;
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
  min-height: 0;
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.skill-card__badges,
.skill-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.skill-card__meta {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
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
  min-width: 0;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
}

.card-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  flex: 0 0 auto;
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

.status-badge,
.reference-badge,
.visibility-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

.status-badge {
  background: var(--accent-soft);
  color: var(--accent);
}

.reference-badge {
  background: #eef2ff;
  color: #4f46e5;
}

.visibility-badge--official {
  background: #f3f4f6;
  color: #4b5563;
}

.visibility-badge--institution {
  background: var(--accent-soft);
  color: var(--accent);
}

.visibility-badge--sub_user {
  background: var(--surface-tint);
  color: var(--text-secondary);
}

.card-empty {
  padding: var(--space-3xl) var(--space-xl);
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  color: var(--text-muted);
  font-size: var(--text-sm);
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

@media (max-width: 720px) {
  .page-header,
  .header-right,
  .list-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .search-input {
    max-width: none;
  }

  .sort-select {
    width: 100%;
  }

  .tool-card-grid {
    grid-template-columns: 1fr;
  }

  .tool-card {
    width: 100%;
  }
}
</style>
