import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  KnowledgeBase,
  KBDetail,
  ChatbotConfig,
  ChatbotDetail,
  ChatbotStatus,
  ConfigSopTemplate,
  SopNode
} from '@/types/config'
import {
  listKBs as apiListKBs,
  createKB as apiCreateKB,
  getKB as apiGetKB,
  updateKB as apiUpdateKB,
  deleteKB as apiDeleteKB,
  uploadKBDocuments as apiUploadKBDocuments,
  removeKBDocument as apiRemoveKBDocument,
  listChatbots as apiListChatbots,
  createChatbot as apiCreateChatbot,
  getChatbot as apiGetChatbot,
  updateChatbot as apiUpdateChatbot,
  deleteChatbot as apiDeleteChatbot,
  updateChatbotStatus as apiUpdateChatbotStatus,
  listSopTemplates as apiListSopTemplates,
  createSopTemplate as apiCreateSopTemplate,
  getSopTemplate as apiGetSopTemplate,
  updateSopTemplate as apiUpdateSopTemplate,
  deleteSopTemplate as apiDeleteSopTemplate,
  updateSopTemplateStatus as apiUpdateSopTemplateStatus,
  createNode as apiCreateNode,
  updateNode as apiUpdateNode,
  deleteNode as apiDeleteNode,
  batchSortNodes as apiBatchSortNodes
} from '@/api/config'

export const useConfigStore = defineStore('config', () => {
  // ==================== State ====================
  const knowledgeBases = ref<KnowledgeBase[]>([])
  const knowledgeBasesTotal = ref(0)
  const chatbots = ref<ChatbotConfig[]>([])
  const chatbotsTotal = ref(0)
  const sopTemplates = ref<ConfigSopTemplate[]>([])
  const sopTemplatesTotal = ref(0)
  const loading = ref(false)

  // ==================== Knowledge Base Actions ====================

  async function fetchKnowledgeBases(offset = 0, limit = 20) {
    loading.value = true
    try {
      const res = await apiListKBs(offset, limit)
      const data = (res as any)?.data as { list: KnowledgeBase[]; total: number } | undefined
      knowledgeBases.value = data?.list ?? []
      knowledgeBasesTotal.value = data?.total ?? 0
    } catch (e) {
      console.error('[config] fetchKnowledgeBases failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchKBDetail(id: number): Promise<KBDetail | null> {
    try {
      const res = await apiGetKB(id)
      return ((res as any)?.data as KBDetail) ?? null
    } catch (e) {
      console.error('[config] fetchKBDetail failed:', e)
      return null
    }
  }

  async function addKnowledgeBase(data: { name: string; description?: string }) {
    try {
      await apiCreateKB(data)
      await fetchKnowledgeBases()
      return true
    } catch (e) {
      console.error('[config] addKnowledgeBase failed:', e)
      return false
    }
  }

  async function editKnowledgeBase(id: number, data: { name?: string; description?: string }) {
    try {
      await apiUpdateKB(id, data)
      await fetchKnowledgeBases()
      return true
    } catch (e) {
      console.error('[config] editKnowledgeBase failed:', e)
      return false
    }
  }

  async function removeKnowledgeBase(id: number) {
    try {
      await apiDeleteKB(id)
      await fetchKnowledgeBases()
      return true
    } catch (e) {
      console.error('[config] removeKnowledgeBase failed:', e)
      return false
    }
  }

  interface UploadResult {
    filename: string
    success: boolean
    error?: string
  }

  async function uploadDocuments(
    kbId: number,
    files: File[]
  ): Promise<{ ok: boolean; results: UploadResult[]; errorMsg?: string }> {
    try {
      const res = await apiUploadKBDocuments(kbId, files)
      const data = (res as any).data?.data ?? (res as any).data
      if (data?.results) {
        const results = data.results as UploadResult[]
        const allOk = results.every((r: UploadResult) => r.success)
        return { ok: allOk, results }
      }
      return { ok: true, results: [] }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '上传失败'
      console.error('[config] uploadDocuments failed:', e)
      return { ok: false, results: [], errorMsg: msg }
    }
  }

  async function removeDocument(kbId: number, docId: number) {
    try {
      await apiRemoveKBDocument(kbId, docId)
      return true
    } catch (e) {
      console.error('[config] removeDocument failed:', e)
      return false
    }
  }

  // ==================== Chatbot Actions ====================

  async function fetchChatbots(offset = 0, limit = 20) {
    loading.value = true
    try {
      const res = await apiListChatbots(offset, limit)
      const data = (res as any)?.data as { list: ChatbotConfig[]; total: number } | undefined
      chatbots.value = data?.list ?? []
      chatbotsTotal.value = data?.total ?? 0
    } catch (e) {
      console.error('[config] fetchChatbots failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchChatbotDetail(id: number): Promise<ChatbotDetail | null> {
    try {
      const res = await apiGetChatbot(id)
      return ((res as any)?.data as ChatbotDetail) ?? null
    } catch (e) {
      console.error('[config] fetchChatbotDetail failed:', e)
      return null
    }
  }

  async function addChatbot(data: {
    name: string
    description?: string
    system_prompt?: string
    knowledge_base_ids?: number[]
    greeting_enabled?: boolean
    greeting_message?: string
  }) {
    try {
      await apiCreateChatbot(data)
      await fetchChatbots()
      return true
    } catch (e) {
      console.error('[config] addChatbot failed:', e)
      return false
    }
  }

  async function editChatbot(
    id: number,
    data: {
      name?: string
      description?: string
      system_prompt?: string
      knowledge_base_ids?: number[]
      greeting_enabled?: boolean
      greeting_message?: string
    }
  ) {
    try {
      await apiUpdateChatbot(id, data)
      await fetchChatbots()
      return true
    } catch (e) {
      console.error('[config] editChatbot failed:', e)
      return false
    }
  }

  async function removeChatbot(id: number) {
    try {
      await apiDeleteChatbot(id)
      await fetchChatbots()
      return true
    } catch (e) {
      console.error('[config] removeChatbot failed:', e)
      return false
    }
  }

  async function setChatbotStatus(id: number, status: ChatbotStatus) {
    try {
      await apiUpdateChatbotStatus(id, status)
      await fetchChatbots()
      return true
    } catch (e) {
      console.error('[config] setChatbotStatus failed:', e)
      return false
    }
  }

  // ==================== SOP Template Actions ====================

  // SopTemplate uses shared gorm.Model which serializes ID/CreatedAt as uppercase
  function normalizeSopTemplate(raw: Record<string, unknown>): ConfigSopTemplate {
    return {
      id: (raw.id ?? raw.ID) as number,
      name: raw.name as string,
      description: (raw.description ?? '') as string,
      creator_user_id: (raw.creator_user_id ?? null) as number | null,
      publish_status: (raw.publish_status ?? 'draft') as string,
      status: (raw.status ?? '') as string,
      // 历史记录可能缺字段：默认 true 与后端 migration 默认值一致
      trailing_chat_enabled: (raw.trailing_chat_enabled ?? true) as boolean,
      node_count: raw.node_count as number | undefined,
      created_at: (raw.created_at ?? raw.CreatedAt ?? '') as string,
      updated_at: (raw.updated_at ?? raw.UpdatedAt ?? '') as string
    }
  }

  async function fetchSopTemplates(offset = 0, limit = 20) {
    loading.value = true
    try {
      const res = await apiListSopTemplates(offset, limit)
      const data = (res as any)?.data as
        | { list: Record<string, unknown>[]; total: number }
        | undefined
      sopTemplates.value = (data?.list ?? []).map(normalizeSopTemplate)
      sopTemplatesTotal.value = data?.total ?? 0
    } catch (e) {
      console.error('[config] fetchSopTemplates failed:', e)
    } finally {
      loading.value = false
    }
  }

  function normalizeSopNode(raw: Record<string, unknown>): SopNode {
    return {
      id: (raw.id ?? raw.ID) as number,
      template_id: (raw.template_id ?? 0) as number,
      name: (raw.name ?? '') as string,
      description: (raw.description ?? '') as string,
      prompt: (raw.prompt ?? '') as string,
      sort: (raw.sort ?? raw.sort_order ?? 0) as number
    }
  }

  async function fetchSopTemplateDetail(
    id: number
  ): Promise<(ConfigSopTemplate & { nodes: SopNode[] }) | null> {
    try {
      const res = await apiGetSopTemplate(id)
      const raw = (res as any)?.data as Record<string, unknown> | undefined
      if (!raw) return null
      // API returns { template: {...}, nodes: [...] }
      const rawTpl = (raw.template ?? raw) as Record<string, unknown>
      const tpl = normalizeSopTemplate(rawTpl)
      const rawNodes = (raw.nodes ?? raw.Nodes ?? []) as Record<string, unknown>[]
      return { ...tpl, nodes: rawNodes.map(normalizeSopNode) }
    } catch (e) {
      console.error('[config] fetchSopTemplateDetail failed:', e)
      return null
    }
  }

  async function addSopTemplate(data: {
    name: string
    description?: string
    trailing_chat_enabled?: boolean
  }): Promise<ConfigSopTemplate | null> {
    try {
      const res = await apiCreateSopTemplate(data)
      const raw = (res as any)?.data as Record<string, unknown> | undefined
      await fetchSopTemplates()
      return raw ? normalizeSopTemplate(raw) : null
    } catch (e) {
      console.error('[config] addSopTemplate failed:', e)
      return null
    }
  }

  async function editSopTemplate(
    id: number,
    data: { name?: string; description?: string; trailing_chat_enabled?: boolean }
  ) {
    try {
      await apiUpdateSopTemplate(id, data)
      await fetchSopTemplates()
      return true
    } catch (e) {
      console.error('[config] editSopTemplate failed:', e)
      return false
    }
  }

  async function removeSopTemplate(id: number) {
    try {
      await apiDeleteSopTemplate(id)
      await fetchSopTemplates()
      return true
    } catch (e) {
      console.error('[config] removeSopTemplate failed:', e)
      return false
    }
  }

  async function setSopTemplateStatus(id: number, status: string) {
    try {
      await apiUpdateSopTemplateStatus(id, status)
      await fetchSopTemplates()
      return true
    } catch (e) {
      console.error('[config] setSopTemplateStatus failed:', e)
      return false
    }
  }

  async function addNode(
    templateId: number,
    data: { name?: string; description?: string; prompt: string; sort?: number }
  ): Promise<SopNode | null> {
    try {
      const res = await apiCreateNode(templateId, data)
      const raw = (res as any)?.data as Record<string, unknown> | undefined
      return raw ? normalizeSopNode(raw) : null
    } catch (e) {
      console.error('[config] addNode failed:', e)
      return null
    }
  }

  async function editNode(
    templateId: number,
    nodeId: number,
    data: { name?: string; description?: string; prompt?: string; sort?: number }
  ) {
    try {
      await apiUpdateNode(templateId, nodeId, data)
      return true
    } catch (e) {
      console.error('[config] editNode failed:', e)
      return false
    }
  }

  async function removeNode(templateId: number, nodeId: number) {
    try {
      await apiDeleteNode(templateId, nodeId)
      return true
    } catch (e) {
      console.error('[config] removeNode failed:', e)
      return false
    }
  }

  async function sortNodes(templateId: number, items: Array<{ id: number; sort: number }>) {
    try {
      await apiBatchSortNodes(templateId, items)
      return true
    } catch (e) {
      console.error('[config] sortNodes failed:', e)
      return false
    }
  }

  return {
    // State
    knowledgeBases,
    knowledgeBasesTotal,
    chatbots,
    chatbotsTotal,
    sopTemplates,
    sopTemplatesTotal,
    loading,

    // KB Actions
    fetchKnowledgeBases,
    fetchKBDetail,
    addKnowledgeBase,
    editKnowledgeBase,
    removeKnowledgeBase,
    uploadDocuments,
    removeDocument,

    // Chatbot Actions
    fetchChatbots,
    fetchChatbotDetail,
    addChatbot,
    editChatbot,
    removeChatbot,
    setChatbotStatus,

    // SOP Template Actions
    fetchSopTemplates,
    fetchSopTemplateDetail,
    addSopTemplate,
    editSopTemplate,
    removeSopTemplate,
    setSopTemplateStatus,
    addNode,
    editNode,
    removeNode,
    sortNodes
  }
})
