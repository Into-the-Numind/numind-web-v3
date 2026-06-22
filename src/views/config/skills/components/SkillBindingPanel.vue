<!--
  SkillBindingPanel — Agent 编辑器内嵌的 Skill 装载/排序/卸载面板

  在 AgentEdit.vue 工具开关区块上方使用：
    <SkillBindingPanel :agent-id="agentId" />

  本组件自包含：
    - 从 GET /v1/agents/:id/skills 拉当前装载列表
    - HTML5 drag-and-drop 重排 → PUT /v1/agents/:id/skills/reorder
    - 添加按钮弹 SkillSelectorModal → POST /v1/agents/:id/skills
    - 卸载按钮 ConfirmModal → DELETE /v1/agents/:id/skills/:skill_id

  agent-mode-v2-skill-as-artifact (S4 T13)
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSkillStore } from '@/stores/skill'
import { useNotificationsStore } from '@/stores/notifications'
import type { Skill } from '@/types/skill'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import SkillSelectorModal from './SkillSelectorModal.vue'

interface Props {
  agentId: number
  // Marketplace 装载闭环：非空时，加载完绑定列表后自动装载该 skill（用户从
  // 「已订阅 → 装载到 Agent → 选 Agent」进来，到这里一步到位，无需再手动选）。
  autoAttachSkillId?: number | null
}

const props = withDefaults(defineProps<Props>(), {
  autoAttachSkillId: null
})

const router = useRouter()
const store = useSkillStore()
const notifications = useNotificationsStore()

// ---------- Local state ----------
const selectorOpen = ref(false)
const detachVisible = ref(false)
const pendingDetach = ref<Skill | null>(null)
const processing = ref(false)

// ---------- Drag-and-drop ----------
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

const items = computed<Skill[]>(() => store.skillsByAgent[props.agentId] || [])
const excludeIds = computed(() => items.value.map((s) => s.id))

async function loadBindings() {
  try {
    await store.fetchAgentSkills(props.agentId)
  } catch (e) {
    notifications.error((e as Error).message || '加载装载列表失败')
  }
}

// maybeAutoAttach closes the marketplace 装载 loop: after the bindings load, if we
// arrived with an auto-attach skill, bind it directly (idempotent — skip if already
// bound; a same-name conflict surfaces the backend's friendly message).
async function maybeAutoAttach() {
  const skillId = props.autoAttachSkillId
  if (!skillId) return
  if (items.value.some((s) => s.id === skillId)) {
    notifications.info('该 skill 已装载到此助手')
    return
  }
  try {
    await store.attach(props.agentId, skillId)
    notifications.success('已为此助手自动装载订阅的 skill')
  } catch (e) {
    notifications.error((e as Error).message || '自动装载失败')
  }
}

onMounted(async () => {
  await loadBindings()
  await maybeAutoAttach()
})
watch(() => props.agentId, loadBindings)

// ---------- Attach ----------
async function onPick(skill: Skill) {
  processing.value = true
  try {
    await store.attach(props.agentId, skill.id)
    notifications.success(`已装载「${skill.name}」`)
  } catch (e) {
    notifications.error((e as Error).message || '装载失败')
  } finally {
    processing.value = false
  }
}

// ---------- Detach ----------
function confirmDetach(skill: Skill) {
  pendingDetach.value = skill
  detachVisible.value = true
}

async function executeDetach() {
  if (!pendingDetach.value) return
  processing.value = true
  try {
    await store.detach(props.agentId, pendingDetach.value.id)
    notifications.success(`已卸载「${pendingDetach.value.name}」`)
  } catch (e) {
    notifications.error((e as Error).message || '卸载失败')
  } finally {
    processing.value = false
    detachVisible.value = false
    pendingDetach.value = null
  }
}

function cancelDetach() {
  detachVisible.value = false
  pendingDetach.value = null
}

// ---------- Reorder via HTML5 drag-and-drop ----------
function onDragStart(idx: number, e: DragEvent) {
  dragIndex.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 需要 setData 才能开始拖拽
    e.dataTransfer.setData('text/plain', String(idx))
  }
}

function onDragOver(idx: number, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}

function onDragLeave(idx: number) {
  if (dragOverIndex.value === idx) dragOverIndex.value = null
}

async function onDrop(targetIdx: number, e: DragEvent) {
  e.preventDefault()
  const from = dragIndex.value
  dragIndex.value = null
  dragOverIndex.value = null
  if (from === null || from === targetIdx) return

  // 本地立刻重排（提供即时反馈），然后调 API 持久化
  const cur = [...items.value]
  const [moved] = cur.splice(from, 1)
  cur.splice(targetIdx, 0, moved)
  const newOrder = cur.map((s) => s.id)

  processing.value = true
  try {
    await store.reorder(props.agentId, newOrder)
  } catch (e) {
    notifications.error((e as Error).message || '排序失败')
    // 失败兜底：重新拉取
    await loadBindings()
  } finally {
    processing.value = false
  }
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

// ---------- Navigation ----------
function goSkillDetail(skill: Skill) {
  router.push(`/config/skills/${skill.id}`)
}
</script>

<template>
  <section class="skill-binding-panel">
    <header class="skill-binding-panel__header">
      <div>
        <h3>装载 skill</h3>
        <p class="skill-binding-panel__hint">
          skill
          是独立、可复用的能力包，运行时注入到这个助手。可装载到多个助手，拖拽排序决定调用优先级。
        </p>
      </div>
      <AppButton variant="primary" size="sm" @click="selectorOpen = true"> + 添加 skill </AppButton>
    </header>

    <div v-if="store.bindingLoading" class="state state--loading">加载中…</div>
    <div v-else-if="store.bindingError" class="state state--error">
      {{ store.bindingError }}
      <AppButton variant="text" size="sm" @click="loadBindings">重试</AppButton>
    </div>
    <div v-else-if="items.length === 0" class="state state--empty">
      还没有装载任何 skill。点右上角「添加 skill」开始。
    </div>

    <ul v-else class="binding-list">
      <li
        v-for="(skill, idx) in items"
        :key="skill.id"
        :class="[
          'binding-card',
          { 'binding-card--dragging': dragIndex === idx },
          { 'binding-card--drag-over': dragOverIndex === idx && dragIndex !== idx }
        ]"
        :draggable="true"
        @dragstart="(e) => onDragStart(idx, e)"
        @dragover="(e) => onDragOver(idx, e)"
        @dragleave="onDragLeave(idx)"
        @drop="(e) => onDrop(idx, e)"
        @dragend="onDragEnd"
      >
        <span class="binding-card__handle" aria-label="拖拽排序">⋮⋮</span>
        <div class="binding-card__icon">{{ skill.name.charAt(0) || 'S' }}</div>
        <div class="binding-card__main">
          <a class="binding-card__name" @click.prevent="goSkillDetail(skill)">
            {{ skill.name }}
          </a>
          <div class="binding-card__desc">{{ skill.description || '—' }}</div>
        </div>
        <div class="binding-card__meta">v{{ skill.version }}</div>
        <AppButton size="sm" variant="secondary" @click="confirmDetach(skill)">卸载</AppButton>
      </li>
    </ul>

    <SkillSelectorModal v-model="selectorOpen" :exclude-skill-ids="excludeIds" @pick="onPick" />

    <ConfirmModal
      :model-value="detachVisible"
      :title="`确认卸载「${pendingDetach?.name}」？`"
      message="卸载后此助手将无法调用该 skill。skill 本身保留，可以随时重新装载。"
      variant="danger"
      confirm-text="确认卸载"
      cancel-text="取消"
      @confirm="executeDetach"
      @cancel="cancelDetach"
    />
  </section>
</template>

<style scoped>
.skill-binding-panel {
  /* 与 AgentForm 的分区卡片视觉对齐（agent-builder-refine 内嵌本页） */
  padding: var(--space-xl);
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
}

.skill-binding-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.skill-binding-panel__header h3 {
  margin: 0 0 var(--space-xs) 0;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text);
}

.skill-binding-panel__hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  max-width: 540px;
  line-height: var(--line-height-normal);
}

.state {
  padding: var(--space-lg);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.state--error {
  /* TODO(admin-rebrand): replace with --danger token */
  color: #ef4444;
}

.binding-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.binding-card {
  display: grid;
  grid-template-columns: 20px 36px 1fr auto auto;
  gap: var(--space-md);
  align-items: center;
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: grab;
  transition: background var(--transition-fast);
}

.binding-card:hover {
  background: var(--surface-tint);
}

.binding-card:active {
  cursor: grabbing;
}

.binding-card--dragging {
  opacity: 0.5;
}

.binding-card--drag-over {
  outline: 2px dashed var(--primary);
  background: var(--accent-soft);
}

.binding-card__handle {
  color: var(--text-muted);
  font-weight: 600;
  font-size: var(--text-sm);
  user-select: none;
}

.binding-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--surface-tint);
  color: var(--primary);
  font-weight: 600;
}

.binding-card__main {
  min-width: 0;
}

.binding-card__name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}

.binding-card__name:hover {
  color: var(--primary);
}

.binding-card__desc {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.binding-card__meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
