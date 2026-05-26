<!--
  SkillSelectorModal — 从候选 Skill 列表中挑一个装载到 Agent

  弹窗形态：搜索框 + Skill 列表 + 选中后 "装载" 按钮。
  仅列出当前未装载的 Skill（excludeSkillIds 由父组件传入）。

  agent-mode-v2-skill-as-artifact (S4 T13)
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { listSkills } from '@/api/skill'
import type { Skill } from '@/types/skill'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'

interface Props {
  modelValue: boolean
  excludeSkillIds: number[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  pick: [skill: Skill]
}>()

const skills = ref<Skill[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const selectedId = ref<number | null>(null)

const filtered = computed(() => {
  const exclude = new Set(props.excludeSkillIds)
  const term = search.value.toLowerCase().trim()
  return skills.value.filter((s) => {
    if (exclude.has(s.id)) return false
    if (!term) return true
    return s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term)
  })
})

async function fetchSkills() {
  loading.value = true
  error.value = ''
  try {
    const res = await listSkills({ page: 1, page_size: 100, sort: 'updated_at_desc' })
    skills.value = res.list
  } catch (e) {
    error.value = (e as Error).message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (props.modelValue) fetchSkills()
})

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedId.value = null
      search.value = ''
      fetchSkills()
    }
  }
)

function close() {
  emit('update:modelValue', false)
}

function confirmPick() {
  if (selectedId.value === null) return
  const picked = skills.value.find((s) => s.id === selectedId.value)
  if (picked) {
    emit('pick', picked)
    close()
  }
}

function selectRow(s: Skill) {
  selectedId.value = s.id
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    close()
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeydown)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="modelValue" class="skill-selector-overlay" @click.self="close">
        <div class="skill-selector" role="dialog" aria-modal="true">
          <header class="skill-selector__header">
            <h3>选择要装载的 Skill</h3>
            <button type="button" class="skill-selector__close" @click="close">✕</button>
          </header>
          <div class="skill-selector__search">
            <AppInput v-model="search" placeholder="搜索 Skill 名称或描述" />
          </div>
          <div class="skill-selector__list">
            <div v-if="loading" class="state">加载中…</div>
            <div v-else-if="error" class="state state--error">{{ error }}</div>
            <div v-else-if="filtered.length === 0" class="state">
              没有可装载的 Skill
              <p class="state__hint">
                所有 Skill 都已装载，或先去
                <strong>Skill</strong>
                创建一个。
              </p>
            </div>
            <ul v-else class="picker-list">
              <li
                v-for="s in filtered"
                :key="s.id"
                :class="['picker-item', { 'picker-item--selected': selectedId === s.id }]"
                @click="selectRow(s)"
              >
                <div class="picker-icon">{{ s.name.charAt(0) || 'S' }}</div>
                <div class="picker-content">
                  <div class="picker-name">{{ s.name }}</div>
                  <div class="picker-desc">{{ s.description || '—' }}</div>
                </div>
                <div class="picker-meta">v{{ s.version }}</div>
              </li>
            </ul>
          </div>
          <footer class="skill-selector__footer">
            <AppButton variant="secondary" @click="close">取消</AppButton>
            <AppButton variant="primary" :disabled="selectedId === null" @click="confirmPick">
              装载到 Agent
            </AppButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.skill-selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.skill-selector {
  width: 560px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 80px);
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.skill-selector__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid rgba(169, 180, 185, 0.1);
}

.skill-selector__header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.skill-selector__close {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.125rem;
  cursor: pointer;
}

.skill-selector__close:hover {
  color: var(--text);
}

.skill-selector__search {
  padding: var(--space-3) var(--space-4);
}

.skill-selector__list {
  flex: 1;
  overflow: auto;
  padding: 0 var(--space-2);
}

.state {
  padding: var(--space-8) var(--space-4);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.state--error {
  color: var(--danger, #dc2626);
}

.state__hint {
  margin: var(--space-2) 0 0;
  font-size: 0.8125rem;
}

.picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.picker-item {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.picker-item:hover {
  background: var(--surface-tint);
}

.picker-item--selected {
  background: rgba(99, 102, 241, 0.08);
  outline: 1px solid var(--primary);
}

.picker-icon {
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

.picker-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text);
}

.picker-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
  max-width: 380px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.skill-selector__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid rgba(169, 180, 185, 0.1);
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity var(--transition-fast);
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
