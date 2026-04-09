import request from './request'
import type {
  KnowledgeBase,
  KBDetail,
  ChatbotConfig,
  ChatbotDetail,
  ChatbotStatus,
  ConfigSopTemplate,
  SopNode
} from '@/types/config'

// ==================== Knowledge Base ====================

export const createKB = (data: { name: string; description?: string }) => {
  return request.post<{ data: KnowledgeBase }>('/v1/config/knowledge-bases', data)
}

export const listKBs = (offset = 0, limit = 20) => {
  return request.get<{ data: { list: KnowledgeBase[]; total: number } }>(
    '/v1/config/knowledge-bases',
    { params: { offset, limit } }
  )
}

export const getKB = (id: number) => {
  return request.get<{ data: KBDetail }>(`/v1/config/knowledge-bases/${id}`)
}

export const updateKB = (id: number, data: { name?: string; description?: string }) => {
  return request.put<{ data: KnowledgeBase }>(`/v1/config/knowledge-bases/${id}`, data)
}

export const deleteKB = (id: number) => {
  return request.delete(`/v1/config/knowledge-bases/${id}`)
}

export const uploadKBDocuments = (kbId: number, files: File[]) => {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  return request.post(`/v1/config/knowledge-bases/${kbId}/documents`, formData, {
    timeout: 300000
  })
}

export const removeKBDocument = (kbId: number, docId: number) => {
  return request.delete(`/v1/config/knowledge-bases/${kbId}/documents/${docId}`)
}

// ==================== Chatbot ====================

export const createChatbot = (data: {
  name: string
  description?: string
  avatar?: string
  system_prompt?: string
  knowledge_base_ids?: number[]
}) => {
  return request.post<{ data: ChatbotConfig }>('/v1/config/chatbots', data)
}

export const listChatbots = (offset = 0, limit = 20) => {
  return request.get<{ data: { list: ChatbotConfig[]; total: number } }>('/v1/config/chatbots', {
    params: { offset, limit }
  })
}

export const getChatbot = (id: number) => {
  return request.get<{ data: ChatbotDetail }>(`/v1/config/chatbots/${id}`)
}

export const updateChatbot = (
  id: number,
  data: {
    name?: string
    description?: string
    avatar?: string
    system_prompt?: string
    knowledge_base_ids?: number[]
  }
) => {
  return request.put<{ data: ChatbotConfig }>(`/v1/config/chatbots/${id}`, data)
}

export const deleteChatbot = (id: number) => {
  return request.delete(`/v1/config/chatbots/${id}`)
}

export const updateChatbotStatus = (id: number, status: ChatbotStatus) => {
  return request.put(`/v1/config/chatbots/${id}/status`, { status })
}

// ==================== SOP Template ====================

export const createSopTemplate = (data: { name: string; description?: string }) => {
  return request.post<{ data: ConfigSopTemplate }>('/v1/config/sop-templates', data)
}

export const listSopTemplates = (offset = 0, limit = 20) => {
  return request.get<{ data: { list: ConfigSopTemplate[]; total: number } }>(
    '/v1/config/sop-templates',
    { params: { offset, limit } }
  )
}

export const getSopTemplate = (id: number) => {
  return request.get<{ data: ConfigSopTemplate & { nodes: SopNode[] } }>(
    `/v1/config/sop-templates/${id}`
  )
}

export const updateSopTemplate = (id: number, data: { name?: string; description?: string }) => {
  return request.put<{ data: ConfigSopTemplate }>(`/v1/config/sop-templates/${id}`, data)
}

export const deleteSopTemplate = (id: number) => {
  return request.delete(`/v1/config/sop-templates/${id}`)
}

export const updateSopTemplateStatus = (id: number, status: string) => {
  return request.put(`/v1/config/sop-templates/${id}/status`, { status })
}

// ==================== SOP Nodes ====================

export const createNode = (
  templateId: number,
  data: { name?: string; description?: string; prompt: string; sort?: number }
) => {
  return request.post<{ data: SopNode }>(`/v1/config/sop-templates/${templateId}/nodes`, data)
}

export const updateNode = (
  templateId: number,
  nodeId: number,
  data: { name?: string; description?: string; prompt?: string; sort?: number }
) => {
  return request.put<{ data: SopNode }>(
    `/v1/config/sop-templates/${templateId}/nodes/${nodeId}`,
    data
  )
}

export const deleteNode = (templateId: number, nodeId: number) => {
  return request.delete(`/v1/config/sop-templates/${templateId}/nodes/${nodeId}`)
}

export const batchSortNodes = (templateId: number, items: Array<{ id: number; sort: number }>) => {
  return request.put(`/v1/config/sop-templates/${templateId}/nodes/batch-sort`, { items })
}
