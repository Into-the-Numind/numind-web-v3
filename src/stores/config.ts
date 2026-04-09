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
  uploadKBDocument as apiUploadKBDocument,
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

  async function uploadDocument(kbId: number, file: File) {
    try {
      await apiUploadKBDocument(kbId, file)
      return true
    } catch (e) {
      console.error('[config] uploadDocument failed:', e)
      return false
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
    avatar?: string
    system_prompt?: string
    knowledge_base_ids?: number[]
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
      avatar?: string
      system_prompt?: string
      knowledge_base_ids?: number[]
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

  async function fetchSopTemplates(offset = 0, limit = 20) {
    loading.value = true
    try {
      const res = await apiListSopTemplates(offset, limit)
      const data = (res as any)?.data as { list: ConfigSopTemplate[]; total: number } | undefined
      sopTemplates.value = data?.list ?? []
      sopTemplatesTotal.value = data?.total ?? 0
    } catch (e) {
      console.error('[config] fetchSopTemplates failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchSopTemplateDetail(
    id: number
  ): Promise<(ConfigSopTemplate & { nodes: SopNode[] }) | null> {
    try {
      const res = await apiGetSopTemplate(id)
      return ((res as any)?.data as ConfigSopTemplate & { nodes: SopNode[] }) ?? null
    } catch (e) {
      console.error('[config] fetchSopTemplateDetail failed:', e)
      return null
    }
  }

  async function addSopTemplate(data: { name: string; description?: string }) {
    try {
      await apiCreateSopTemplate(data)
      await fetchSopTemplates()
      return true
    } catch (e) {
      console.error('[config] addSopTemplate failed:', e)
      return false
    }
  }

  async function editSopTemplate(id: number, data: { name?: string; description?: string }) {
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

  async function addNode(templateId: number, data: { prompt: string; sort?: number }) {
    try {
      await apiCreateNode(templateId, data)
      return true
    } catch (e) {
      console.error('[config] addNode failed:', e)
      return false
    }
  }

  async function editNode(
    templateId: number,
    nodeId: number,
    data: { prompt?: string; sort?: number }
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
    uploadDocument,
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
