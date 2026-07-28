// Pinia store for parent-account Skill (artifact) CRUD + binding.
// Setup syntax (per numind-web-v3 CLAUDE.md §2 / .claude/rules/frontend-state.md).
//
// agent-mode-v2-skill-as-artifact (S4 T09).
// Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §5.5
//
// Single store covers 11 backend endpoints. State updates for `remove` are optimistic
// (last-write-wins acceptable). For binding state we hold per-agent skill lists keyed
// by agentID — Agent 编辑器组件 SkillBindingPanel 复用此 store。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createSkill,
  listSkills,
  getSkill,
  updateSkill,
  deleteSkill,
  attachSkillToAgent,
  detachSkillFromAgent,
  reorderAgentSkills,
  listAgentSkills,
  importSkillTemplate
} from '@/api/skill'
import type {
  Skill,
  CreateSkillRequest,
  UpdateSkillRequest,
  ListSkillParams
} from '@/types/skill'

export const useSkillStore = defineStore('skill', () => {
  // --- List state ---
  const list = ref<Skill[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')

  // --- Current (detail/edit) state ---
  const current = ref<Skill | null>(null)
  const currentLoading = ref(false)
  const currentError = ref('')

  // --- 每个 Agent 已装载的 Skill 列表（SkillBindingPanel 用）
  //     keyed by agentID 避免多个 Agent 编辑器同时打开互相覆盖。
  const skillsByAgent = ref<Record<number, Skill[]>>({})
  const bindingLoading = ref(false)
  const bindingError = ref('')

  // --- Shared saving flag (create/update/remove/attach/detach/reorder) ---
  const saving = ref(false)

  // --- Getter ---
  const isEmpty = computed(() => list.value.length === 0)

  // --- Actions ---

  async function fetchList(params: ListSkillParams = {}) {
    loading.value = true
    error.value = ''
    try {
      const res = await listSkills({
        page: 1,
        page_size: 20,
        sort: 'updated_at_desc',
        ...params
      })
      list.value = res.list ?? []
      total.value = res.total ?? 0
    } catch (e) {
      error.value = (e as Error).message || '加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchOne(id: number) {
    currentLoading.value = true
    currentError.value = ''
    try {
      current.value = await getSkill(id)
    } catch (e) {
      currentError.value = (e as Error).message || '加载失败'
      throw e
    } finally {
      currentLoading.value = false
    }
  }

  async function create(payload: CreateSkillRequest): Promise<Skill> {
    saving.value = true
    try {
      const s = await createSkill(payload)
      current.value = s
      return s
    } finally {
      saving.value = false
    }
  }

  async function update(id: number, payload: UpdateSkillRequest): Promise<Skill> {
    saving.value = true
    try {
      const s = await updateSkill(id, payload)
      current.value = s
      return s
    } finally {
      saving.value = false
    }
  }

  async function remove(id: number): Promise<number> {
    saving.value = true
    try {
      const resp = await deleteSkill(id)
      // Optimistic local mutation; race with pending fetchList is acceptable v1.
      list.value = list.value.filter((s) => s.id !== id)
      total.value = Math.max(0, total.value - 1)
      return resp.affected_bindings
    } finally {
      saving.value = false
    }
  }

  // ---------- Binding (Agent <-> Skill) ----------

  async function fetchAgentSkills(agentId: number) {
    bindingLoading.value = true
    bindingError.value = ''
    try {
      const res = await listAgentSkills(agentId)
      skillsByAgent.value = { ...skillsByAgent.value, [agentId]: res.list ?? [] }
    } catch (e) {
      bindingError.value = (e as Error).message || '加载装载列表失败'
      throw e
    } finally {
      bindingLoading.value = false
    }
  }

  async function attach(agentId: number, skillId: number, sortOrder?: number) {
    saving.value = true
    try {
      await attachSkillToAgent(agentId, { skill_id: skillId, sort_order: sortOrder })
      // 重新拉取确保 sort_order 与后端一致
      await fetchAgentSkills(agentId)
    } finally {
      saving.value = false
    }
  }

  async function detach(agentId: number, skillId: number) {
    saving.value = true
    try {
      await detachSkillFromAgent(agentId, skillId)
      // 本地立刻移除以提供即时反馈
      const cur = skillsByAgent.value[agentId] || []
      skillsByAgent.value = {
        ...skillsByAgent.value,
        [agentId]: cur.filter((s) => s.id !== skillId)
      }
    } finally {
      saving.value = false
    }
  }

  async function reorder(agentId: number, skillIds: number[]) {
    saving.value = true
    try {
      await reorderAgentSkills(agentId, { skill_ids: skillIds })
      // 本地按新顺序重排（避免重新拉取）
      const cur = skillsByAgent.value[agentId] || []
      const sortedMap = new Map(cur.map((s) => [s.id, s]))
      const reordered: Skill[] = []
      for (const id of skillIds) {
        const s = sortedMap.get(id)
        if (s) reordered.push(s)
      }
      // 兜底：列表里有但 skillIds 漏掉的，追加到末尾
      for (const s of cur) {
        if (!skillIds.includes(s.id)) reordered.push(s)
      }
      skillsByAgent.value = { ...skillsByAgent.value, [agentId]: reordered }
    } finally {
      saving.value = false
    }
  }

  async function importTemplate(templateId: number): Promise<Skill> {
    saving.value = true
    try {
      const s = await importSkillTemplate(templateId)
      current.value = s
      return s
    } finally {
      saving.value = false
    }
  }

  // Pinia setup-syntax stores need explicit reset (no auto $reset).
  function $reset() {
    list.value = []
    total.value = 0
    loading.value = false
    error.value = ''
    current.value = null
    currentLoading.value = false
    currentError.value = ''
    skillsByAgent.value = {}
    bindingLoading.value = false
    bindingError.value = ''
    saving.value = false
  }

  return {
    // state
    list,
    total,
    loading,
    error,
    current,
    currentLoading,
    currentError,
    skillsByAgent,
    bindingLoading,
    bindingError,
    saving,
    // getters
    isEmpty,
    // actions
    fetchList,
    fetchOne,
    create,
    update,
    remove,
    fetchAgentSkills,
    attach,
    detach,
    reorder,
    importTemplate,
    $reset
  }
})
