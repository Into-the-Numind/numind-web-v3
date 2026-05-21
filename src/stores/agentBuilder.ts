// Pinia store for parent-account agent (Skill) CRUD, history, restore, advanced toggle.
// Setup syntax (per numind-web-v3 CLAUDE.md §2).
// Relocated from numind-admin-web/src/stores/agent.ts in agent-mode-configurator-relocate (2026-05-22).
//
// Student-facing agent chat store is src/stores/agentChat.ts (do NOT confuse).
//
// Single store covers 9 backend endpoints; not split to avoid cross-store coupling.
// State updates are optimistic for softDelete (last-write-wins acceptable v1).

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listAgents,
  getAgent,
  createAgent,
  patchAgent,
  deleteAgent,
  listAgentHistory,
  restoreAgent,
  toggleAgentAdvanced,
  listSkillTemplates,
  type ListAgentsParams
} from '@/api/agentBuilder'
import {
  normalizeQuestionnaire,
  type Agent,
  type AgentHistory,
  type SkillTemplate,
  type CreateAgentPayload,
  type PatchAgentPayload
} from '@/types/agentBuilder'

/**
 * Normalize an Agent from backend — apply normalizeQuestionnaire to handle
 * `omitempty` empty-string / null fields from Go json serialization.
 */
function normalizeAgent(a: Agent): Agent {
  a.questionnaire_answers = normalizeQuestionnaire(a.questionnaire_answers)
  return a
}

export const useAgentBuilderStore = defineStore('agentBuilder', () => {
  // --- List state ---
  const list = ref<Agent[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')

  // --- Current (detail/edit) state ---
  const current = ref<Agent | null>(null)
  const currentLoading = ref(false)
  const currentError = ref('')

  // --- History state ---
  const history = ref<AgentHistory[]>([])
  const historyLoading = ref(false)
  const historyError = ref('')

  // --- Templates state ---
  const templates = ref<SkillTemplate[]>([])
  const templatesLoading = ref(false)
  const templatesError = ref('')

  // --- Shared saving flag (create/update/restore/toggleAdvanced/softDelete) ---
  const saving = ref(false)

  // --- Getter ---
  const isEmpty = computed(() => list.value.length === 0)

  // --- Actions ---

  async function fetchList(params: ListAgentsParams = {}) {
    loading.value = true
    error.value = ''
    try {
      const res = await listAgents({
        page: 1,
        page_size: 20,
        include_inactive: false, // v1 only shows active agents (S1 decision-1)
        ...params
      })
      list.value = res.list.map(normalizeAgent)
      total.value = res.total
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
      current.value = normalizeAgent(await getAgent(id))
    } catch (e) {
      currentError.value = (e as Error).message || '加载失败'
      throw e
    } finally {
      currentLoading.value = false
    }
  }

  async function create(payload: CreateAgentPayload): Promise<Agent> {
    saving.value = true
    try {
      const a = normalizeAgent(await createAgent(payload))
      current.value = a
      return a
    } finally {
      saving.value = false
    }
  }

  // Renamed from `patch` to avoid collision with request.ts patch helper
  // and Pinia's built-in $patch method (S2 P0-4 fix).
  async function update(id: number, payload: PatchAgentPayload): Promise<Agent> {
    saving.value = true
    try {
      const a = normalizeAgent(await patchAgent(id, payload))
      current.value = a
      return a
    } finally {
      saving.value = false
    }
  }

  async function softDelete(id: number): Promise<void> {
    saving.value = true
    try {
      await deleteAgent(id)
      // Optimistic local mutation; race with pending fetchList is acceptable v1.
      list.value = list.value.filter((a) => a.id !== id)
      total.value = Math.max(0, total.value - 1)
    } finally {
      saving.value = false
    }
  }

  async function fetchHistory(id: number) {
    historyLoading.value = true
    historyError.value = ''
    try {
      const res = await listAgentHistory(id)
      history.value = res.list
    } catch (e) {
      historyError.value = (e as Error).message || '加载历史失败'
      throw e
    } finally {
      historyLoading.value = false
    }
  }

  async function restore(id: number, version: number): Promise<Agent> {
    saving.value = true
    try {
      const a = normalizeAgent(await restoreAgent(id, version))
      current.value = a
      // Refresh history so new restored version shows up immediately.
      await fetchHistory(id)
      return a
    } finally {
      saving.value = false
    }
  }

  async function toggleAdvanced(id: number): Promise<Agent> {
    saving.value = true
    try {
      const a = normalizeAgent(await toggleAgentAdvanced(id))
      current.value = a
      return a
    } finally {
      saving.value = false
    }
  }

  async function fetchTemplates() {
    templatesLoading.value = true
    templatesError.value = ''
    try {
      templates.value = await listSkillTemplates()
    } catch (e) {
      templatesError.value = (e as Error).message || '加载模板失败'
      throw e
    } finally {
      templatesLoading.value = false
    }
  }

  // Pinia setup-syntax stores need an explicit reset (no auto $reset).
  function $reset() {
    list.value = []
    total.value = 0
    loading.value = false
    error.value = ''
    current.value = null
    currentLoading.value = false
    currentError.value = ''
    history.value = []
    historyLoading.value = false
    historyError.value = ''
    templates.value = []
    templatesLoading.value = false
    templatesError.value = ''
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
    history,
    historyLoading,
    historyError,
    templates,
    templatesLoading,
    templatesError,
    saving,
    // getters
    isEmpty,
    // actions
    fetchList,
    fetchOne,
    create,
    update,
    softDelete,
    fetchHistory,
    restore,
    toggleAdvanced,
    fetchTemplates,
    $reset
  }
})
